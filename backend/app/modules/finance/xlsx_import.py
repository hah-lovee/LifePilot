"""Import of the "Личный бюджет на месяц" spreadsheet — one file per month.

The sheet is the standard Microsoft template with twelve named Excel tables
(Жилье, Транспорт, …), each `название | запланированные | фактические |
разница`, plus an income block at the top in two versions, planned and actual.
Named tables are what this reads, so a shifted row or an inserted column does
not break it.

Two things are recovered rather than flattened:

  - Actual amounts were kept as `=1077+50+678+...`, one term per purchase. Each
    term becomes its own transaction, so "из чего набежало" survives the move.
    The sheet holds no dates, so every imported purchase is dated the first of
    its month and carries a note saying where it came from — a fake day of the
    month would be worse than an obvious one.

  - Planned savings were `=C7*0.05` and `=C7*0.2*0.3` — a share of the planned
    income, not a number. Those become `percent_of_income`, so the rule keeps
    working when the salary changes.
"""

import io
import re
from dataclasses import dataclass, field
from datetime import date

from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.models.user import User
from app.modules.finance.models import (
    EXPENSE,
    INCOME,
    FinanceGroup,
    FinanceItem,
    FinancePlan,
    FinanceTransaction,
)

PLANNED_INCOME_HEADER = "плановый месячный доход"
ACTUAL_INCOME_HEADER = "фактический месячный доход"
INCOME_TOTAL_ROW = "общие доходы за месяц"
SUBTOTAL_ROW = "промежуточный итог"
INCOME_GROUP_NAME = "Доходы"

# C7 is the planned-income total in this template; a planned amount expressed
# against it is a percentage rule rather than a sum.
_PERCENT_FORMULA = re.compile(r"^=\s*\$?C\$?7\s*((?:\*\s*[0-9]*[.,]?[0-9]+\s*)+)$", re.IGNORECASE)
_SUM_OF_TERMS = re.compile(r"^=\s*[0-9]+(?:[.,][0-9]+)?(?:\s*\+\s*[0-9]+(?:[.,][0-9]+)?)*$")
_MONTH_IN_NAME = re.compile(r"(?P<a>\d{1,4})[-_. ](?P<b>\d{2,4})(?!\d)")


@dataclass
class ParsedItem:
    name: str
    planned: float | None = None
    percent_of_income: float | None = None
    actual_terms: list[float] = field(default_factory=list)


@dataclass
class ParsedGroup:
    name: str
    kind: str = EXPENSE
    counts_as_savings: bool = False
    items: list[ParsedItem] = field(default_factory=list)


@dataclass
class ParsedMonth:
    month: date
    groups: list[ParsedGroup]

    @property
    def item_count(self) -> int:
        return sum(len(group.items) for group in self.groups)

    @property
    def transaction_count(self) -> int:
        return sum(len(item.actual_terms) for group in self.groups for item in group.items)


class XlsxImportError(ValueError):
    """Raised with a message meant for the user."""


# --- reading --------------------------------------------------------------


def month_from_filename(filename: str) -> date | None:
    """The month these files are named by: 09.24, 01.25, 06.2026, 09_2026, 2026-09.

    The month comes first unless the first number cannot be one, which is the
    convention every file in the archive follows. A two-digit year is read as
    2000-something — these are personal budgets, not records from 1924."""
    stem = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    match = _MONTH_IN_NAME.search(stem)
    if match is None:
        return None
    a, b = int(match.group("a")), int(match.group("b"))
    year, month = (a, b) if a > 12 else (b, a)
    if year < 100:
        year += 2000
    if not (1 <= month <= 12 and 1900 < year < 2200):
        return None
    return date(year, month, 1)


def looks_like_template(filename: str) -> bool:
    """A blank template carries a month in its name too — "шаблон бюджета(от
    05.25)" — and importing it would overwrite that month's real plan with
    zeroes. Only consulted when the month was guessed from the name: if the
    caller says which month it is, they are trusted."""
    stem = filename.rsplit("/", 1)[-1].lower()
    return "шаблон" in stem or "template" in stem


def _number(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _terms(formula: object, cached: object) -> list[float]:
    """The individual amounts behind one actual-spend cell.

    A cell written as a sum of literals gives one term per purchase. Anything
    else — a bare number, a formula referring to other cells — collapses to the
    single value Excel last calculated."""
    if isinstance(formula, str) and _SUM_OF_TERMS.match(formula.strip()):
        parts = [p.strip().replace(",", ".") for p in formula.strip().lstrip("=").split("+")]
        values = [float(p) for p in parts if p]
        if values:
            return [v for v in values if v > 0]
    value = _number(cached) or _number(formula)
    return [value] if value and value > 0 else []


def _percent(formula: object) -> float | None:
    if not isinstance(formula, str):
        return None
    match = _PERCENT_FORMULA.match(formula.strip())
    if match is None:
        return None
    share = 1.0
    for factor in match.group(1).split("*"):
        factor = factor.strip().replace(",", ".")
        if factor:
            share *= float(factor)
    return round(share, 4) if 0 < share <= 1 else None


def _budget_sheet(wb, wbv):
    """The sheet holding the budget — the one with the income header, falling
    back to the sheet with the most named tables."""
    for name in wb.sheetnames:
        ws = wbv[name]
        for row in ws.iter_rows(min_row=1, max_row=min(ws.max_row, 30), max_col=4):
            for cell in row:
                if isinstance(cell.value, str) and cell.value.strip().lower().startswith(
                    PLANNED_INCOME_HEADER
                ):
                    return wb[name], ws
    best = max(wb.worksheets, key=lambda ws: len(ws.tables), default=None)
    if best is None or not best.tables:
        raise XlsxImportError("В файле не найден лист с бюджетом")
    return best, wbv[best.title]


def _income_block(ws, wsv, header: str) -> dict[str, tuple[float | None, list[float]]]:
    """Rows of one income block, by item name."""
    start = None
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, max_col=3):
        cell = row[1]  # column B
        if isinstance(cell.value, str) and cell.value.strip().lower().startswith(header):
            start = cell.row + 1
            break
    if start is None:
        return {}

    found: dict[str, tuple[float | None, list[float]]] = {}
    for row_index in range(start, min(start + 20, ws.max_row + 1)):
        label = ws.cell(row=row_index, column=2).value
        if not isinstance(label, str) or not label.strip():
            continue
        if label.strip().lower().startswith(INCOME_TOTAL_ROW):
            break
        formula = ws.cell(row=row_index, column=3).value
        cached = wsv.cell(row=row_index, column=3).value
        found[label.strip()] = (_number(cached), _terms(formula, cached))
    return found


def parse_workbook(content: bytes, month: date) -> ParsedMonth:
    try:
        wb = load_workbook(io.BytesIO(content), data_only=False)
        wbv = load_workbook(io.BytesIO(content), data_only=True)
    except Exception as exc:  # openpyxl raises a zoo of types on bad input
        raise XlsxImportError("Не удалось прочитать файл — ожидается .xlsx") from exc

    ws, wsv = _budget_sheet(wb, wbv)

    groups: list[ParsedGroup] = []

    planned = _income_block(ws, wsv, PLANNED_INCOME_HEADER)
    actual = _income_block(ws, wsv, ACTUAL_INCOME_HEADER)
    if planned or actual:
        income = ParsedGroup(name=INCOME_GROUP_NAME, kind=INCOME)
        for name in list(planned) + [n for n in actual if n not in planned]:
            income.items.append(
                ParsedItem(
                    name=name,
                    planned=planned.get(name, (None, []))[0],
                    actual_terms=actual.get(name, (None, []))[1],
                )
            )
        groups.append(income)

    for table in ws.tables.values():
        parsed = _parse_table(ws, wsv, table)
        if parsed is not None:
            groups.append(parsed)

    if not groups:
        raise XlsxImportError("В файле не нашлось ни таблиц расходов, ни блока доходов")
    return ParsedMonth(month=month, groups=groups)


def _parse_table(ws, wsv, table) -> ParsedGroup | None:
    from openpyxl.utils import range_boundaries

    min_col, min_row, max_col, max_row = range_boundaries(table.ref)
    if max_col - min_col < 2:
        return None

    # The group's display name sits in the merged cell above the header, and is
    # what the user actually sees — the table's own name is a code
    # ("УходЗаСобой" for "Предметы личной гигиены").
    title = ws.cell(row=min_row - 1, column=min_col).value if min_row > 1 else None
    name = title.strip() if isinstance(title, str) and title.strip() else table.name
    name = name.replace("_", " ")

    group = ParsedGroup(
        name=name,
        counts_as_savings="сбереж" in name.lower() or "инвестиц" in name.lower(),
    )

    last_data_row = max_row - (table.totalsRowCount or 0)
    for row_index in range(min_row + 1, last_data_row + 1):
        label = ws.cell(row=row_index, column=min_col).value
        if not isinstance(label, str) or not label.strip():
            continue
        if label.strip().lower().startswith(SUBTOTAL_ROW):
            continue

        planned_formula = ws.cell(row=row_index, column=min_col + 1).value
        planned_cached = wsv.cell(row=row_index, column=min_col + 1).value
        actual_formula = ws.cell(row=row_index, column=min_col + 2).value
        actual_cached = wsv.cell(row=row_index, column=min_col + 2).value

        group.items.append(
            ParsedItem(
                name=label.strip(),
                planned=_number(planned_cached),
                percent_of_income=_percent(planned_formula),
                actual_terms=_terms(actual_formula, actual_cached),
            )
        )
    return group if group.items else None


# --- writing --------------------------------------------------------------


SOURCE = "xlsx"


def note_for(filename: str) -> str:
    """Shown next to the purchase, so it is obvious where a row dated the first
    of the month came from. Identifying imported rows is `source`, not this —
    see FinanceTransaction.source."""
    return f"импорт из {filename.rsplit('/', 1)[-1]}"


def apply_month(db: Session, user: User, parsed: ParsedMonth, filename: str) -> dict[str, int]:
    marker = note_for(filename)
    month = parsed.month

    groups = {
        g.name.strip().lower(): g
        for g in db.query(FinanceGroup).filter(FinanceGroup.user_id == user.id).all()
    }
    items_by_group: dict[int, dict[str, FinanceItem]] = {}
    for item in db.query(FinanceItem).filter(FinanceItem.user_id == user.id).all():
        items_by_group.setdefault(item.group_id, {})[item.name.strip().lower()] = item

    created_groups = created_items = 0
    next_group_order = (
        max((g.sort_order for g in groups.values()), default=-1) + 1 if groups else 0
    )

    plan_rows: list[tuple[int, float | None, float | None]] = []
    transactions: list[tuple[int, float]] = []

    for parsed_group in parsed.groups:
        key = parsed_group.name.strip().lower()
        group = groups.get(key)
        if group is None:
            group = FinanceGroup(
                user_id=user.id,
                name=parsed_group.name,
                kind=parsed_group.kind,
                sort_order=next_group_order,
                counts_as_savings=parsed_group.counts_as_savings,
            )
            next_group_order += 1
            db.add(group)
            db.flush()
            groups[key] = group
            created_groups += 1

        known = items_by_group.setdefault(group.id, {})
        next_item_order = max((i.sort_order for i in known.values()), default=-1) + 1

        for parsed_item in parsed_group.items:
            item_key = parsed_item.name.strip().lower()
            item = known.get(item_key)
            if item is None:
                item = FinanceItem(
                    user_id=user.id,
                    group_id=group.id,
                    name=parsed_item.name,
                    sort_order=next_item_order,
                )
                next_item_order += 1
                db.add(item)
                db.flush()
                known[item_key] = item
                created_items += 1

            plan_rows.append((item.id, parsed_item.planned, parsed_item.percent_of_income))
            transactions.extend((item.id, amount) for amount in parsed_item.actual_terms)

    existing_plans = {
        plan.item_id: plan
        for plan in db.query(FinancePlan).filter(
            FinancePlan.user_id == user.id, FinancePlan.month == month
        )
    }
    for item_id, amount, percent in plan_rows:
        plan = existing_plans.get(item_id)
        if plan is None:
            plan = FinancePlan(user_id=user.id, item_id=item_id, month=month)
            db.add(plan)
            existing_plans[item_id] = plan
        plan.amount = None if percent is not None else amount
        plan.percent_of_income = percent

    # Everything a previous import left in this month, whatever file it came
    # from. Hand-entered rows have no source and survive.
    next_month = date(month.year + (month.month == 12), month.month % 12 + 1, 1)
    removed = (
        db.query(FinanceTransaction)
        .filter(
            FinanceTransaction.user_id == user.id,
            FinanceTransaction.happened_on >= month,
            FinanceTransaction.happened_on < next_month,
            FinanceTransaction.source == SOURCE,
        )
        .delete(synchronize_session=False)
    )
    for item_id, amount in transactions:
        db.add(
            FinanceTransaction(
                user_id=user.id,
                item_id=item_id,
                happened_on=month,
                amount=amount,
                note=marker,
                source=SOURCE,
            )
        )

    db.commit()
    return {
        "month": month.month,
        "year": month.year,
        "groups_created": created_groups,
        "items_created": created_items,
        "plans": len(plan_rows),
        "transactions": len(transactions),
        "transactions_replaced": removed,
    }
