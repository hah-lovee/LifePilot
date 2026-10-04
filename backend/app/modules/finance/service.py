"""Derivations over the budget tables: the month view, the analytics, savings.

Nothing here stores a computed total. The month's actual spend is the sum of
its transactions, every time — the same reason the spreadsheet's totals were
formulas rather than typed numbers.
"""

from collections import defaultdict
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user import User
from app.modules.finance.models import (
    EXPENSE,
    INCOME,
    FinanceGroup,
    FinanceItem,
    FinancePlan,
    FinanceTransaction,
    SavingsAccount,
    SavingsOperation,
)
from app.modules.finance.schemas import (
    FinanceAnalytics,
    GroupSlice,
    GroupTrendPoint,
    ItemStat,
    MonthGroup,
    MonthItem,
    MonthTotals,
    MonthView,
    SavingsAccountOut,
    SavingsSummary,
)

TREND_MONTHS = 12
TOP_ITEMS = 10
AVERAGE_MONTHS = 3


# --- month arithmetic -----------------------------------------------------


def parse_month(value: str) -> date:
    """"YYYY-MM" (or a full date) to the first day of that month."""
    parts = value.split("-")
    if len(parts) < 2:
        raise ValueError("month must look like YYYY-MM")
    return date(int(parts[0]), int(parts[1]), 1)


def format_month(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def month_end(first: date) -> date:
    return date(first.year + (first.month == 12), first.month % 12 + 1, 1)


def shift_month(first: date, months: int) -> date:
    index = first.year * 12 + (first.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


# --- the month view -------------------------------------------------------


def _actuals(db: Session, user: User, month: date) -> dict[int, tuple[float, int]]:
    """Per item: total and number of transactions inside the month."""
    rows = (
        db.query(
            FinanceTransaction.item_id,
            func.sum(FinanceTransaction.amount),
            func.count(FinanceTransaction.id),
        )
        .filter(
            FinanceTransaction.user_id == user.id,
            FinanceTransaction.happened_on >= month,
            FinanceTransaction.happened_on < month_end(month),
        )
        .group_by(FinanceTransaction.item_id)
        .all()
    )
    return {item_id: (float(total or 0), count) for item_id, total, count in rows}


def previous_month_with_data(db: Session, user: User, month: date) -> date | None:
    """The nearest earlier month holding a plan or a transaction — what the
    "copy last month" action offers, and nothing if there is no history."""
    latest_plan = (
        db.query(func.max(FinancePlan.month))
        .filter(FinancePlan.user_id == user.id, FinancePlan.month < month)
        .scalar()
    )
    latest_tx = (
        db.query(func.max(FinanceTransaction.happened_on))
        .filter(FinanceTransaction.user_id == user.id, FinanceTransaction.happened_on < month)
        .scalar()
    )
    candidates = [m for m in (latest_plan, latest_tx) if m is not None]
    if not candidates:
        return None
    best = max(candidates)
    return date(best.year, best.month, 1)


def build_month(db: Session, user: User, month: date) -> MonthView:
    plans = (
        db.query(FinancePlan)
        .filter(FinancePlan.user_id == user.id, FinancePlan.month == month)
        .all()
    )
    actuals = _actuals(db, user, month)

    plan_by_item = {plan.item_id: plan for plan in plans}
    item_ids = set(plan_by_item) | set(actuals)

    if not item_ids:
        return MonthView(
            month=format_month(month),
            income=[],
            expenses=[],
            planned_income=0.0,
            actual_income=0.0,
            planned_expenses=0.0,
            actual_expenses=0.0,
            planned_balance=0.0,
            actual_balance=0.0,
            balance_difference=0.0,
            is_empty=True,
            previous_month=(
                format_month(prev)
                if (prev := previous_month_with_data(db, user, month)) is not None
                else None
            ),
        )

    rows = (
        db.query(FinanceItem, FinanceGroup)
        .join(FinanceGroup, FinanceGroup.id == FinanceItem.group_id)
        .filter(FinanceItem.user_id == user.id, FinanceItem.id.in_(item_ids))
        .all()
    )

    # Percent-of-income plans need the month's planned income first, and income
    # itself is never expressed as a percentage of itself.
    planned_income = 0.0
    for item, group in rows:
        if group.kind != INCOME:
            continue
        plan = plan_by_item.get(item.id)
        if plan is not None and plan.amount is not None:
            planned_income += float(plan.amount)

    # Each entry pairs a sort key with the row, so group order survives the
    # fact that rows arrive from the database in no particular order.
    grouped: dict[int, tuple[FinanceGroup, list[tuple[tuple[int, str], MonthItem]]]] = {}
    for item, group in rows:
        plan = plan_by_item.get(item.id)
        actual, count = actuals.get(item.id, (0.0, 0))

        percent = float(plan.percent_of_income) if plan and plan.percent_of_income else None
        if percent is not None:
            planned: float | None = round(planned_income * percent, 2)
        elif plan is not None and plan.amount is not None:
            planned = float(plan.amount)
        else:
            planned = None

        # Positive always means "went well": for expenses that is spending less
        # than planned, for income it is earning more.
        if planned is None:
            difference = None
        elif group.kind == INCOME:
            difference = round(actual - planned, 2)
        else:
            difference = round(planned - actual, 2)

        entry = grouped.setdefault(group.id, (group, []))
        entry[1].append(
            (
                (item.sort_order, item.name.lower()),
                MonthItem(
                    item_id=item.id,
                    name=item.name,
                    planned=planned,
                    actual=round(actual, 2),
                    difference=difference,
                    percent_of_income=percent,
                    transactions=count,
                    in_plan=plan is not None,
                ),
            )
        )

    income_groups: list[MonthGroup] = []
    expense_groups: list[MonthGroup] = []
    for group, rows_in_group in grouped.values():
        # The order the rows were put in, as in the spreadsheet — not alphabetical.
        rows_in_group.sort(key=lambda pair: pair[0])
        items = [item for _, item in rows_in_group]
        planned_total = round(sum(i.planned or 0 for i in items), 2)
        actual_total = round(sum(i.actual for i in items), 2)
        month_group = MonthGroup(
            group_id=group.id,
            name=group.name,
            kind=group.kind,
            counts_as_savings=group.counts_as_savings,
            items=items,
            planned=planned_total,
            actual=actual_total,
            difference=round(
                actual_total - planned_total
                if group.kind == INCOME
                else planned_total - actual_total,
                2,
            ),
        )
        (income_groups if group.kind == INCOME else expense_groups).append(month_group)

    sort_key = {g.id: (g.sort_order, g.name.lower()) for g, _ in grouped.values()}
    income_groups.sort(key=lambda g: sort_key[g.group_id])
    expense_groups.sort(key=lambda g: sort_key[g.group_id])

    actual_income = round(sum(g.actual for g in income_groups), 2)
    planned_expenses = round(sum(g.planned for g in expense_groups), 2)
    actual_expenses = round(sum(g.actual for g in expense_groups), 2)
    planned_balance = round(planned_income - planned_expenses, 2)
    actual_balance = round(actual_income - actual_expenses, 2)

    return MonthView(
        month=format_month(month),
        income=income_groups,
        expenses=expense_groups,
        planned_income=round(planned_income, 2),
        actual_income=actual_income,
        planned_expenses=planned_expenses,
        actual_expenses=actual_expenses,
        planned_balance=planned_balance,
        actual_balance=actual_balance,
        balance_difference=round(actual_balance - planned_balance, 2),
        is_empty=False,
        previous_month=(
            format_month(prev)
            if (prev := previous_month_with_data(db, user, month)) is not None
            else None
        ),
    )


def months_with_data(db: Session, user: User) -> list[str]:
    plan_months = db.query(FinancePlan.month).filter(FinancePlan.user_id == user.id).distinct()
    tx_days = (
        db.query(FinanceTransaction.happened_on)
        .filter(FinanceTransaction.user_id == user.id)
        .distinct()
    )
    found: set[date] = {row[0] for row in plan_months}
    for (value,) in tx_days:
        if value is not None:
            found.add(date(value.year, value.month, 1))
    return [format_month(m) for m in sorted(found, reverse=True)]


def copy_month(db: Session, user: User, source: date, target: date, include_amounts: bool) -> int:
    """Carry the source month's structure into the target: a plan row per item,
    which is what makes the item appear there. Items the target already has are
    left alone, so running this twice changes nothing."""
    source_plans = (
        db.query(FinancePlan)
        .filter(FinancePlan.user_id == user.id, FinancePlan.month == source)
        .all()
    )
    existing = {
        item_id
        for (item_id,) in db.query(FinancePlan.item_id).filter(
            FinancePlan.user_id == user.id, FinancePlan.month == target
        )
    }
    created = 0
    for plan in source_plans:
        if plan.item_id in existing:
            continue
        db.add(
            FinancePlan(
                user_id=user.id,
                item_id=plan.item_id,
                month=target,
                amount=plan.amount if include_amounts else None,
                percent_of_income=plan.percent_of_income if include_amounts else None,
            )
        )
        created += 1
    db.commit()
    return created


def fill_month(db: Session, user: User, month: date) -> int:
    """A plan row for every active item that has none in this month."""
    present = {
        item_id
        for (item_id,) in db.query(FinancePlan.item_id).filter(
            FinancePlan.user_id == user.id, FinancePlan.month == month
        )
    }
    items = (
        db.query(FinanceItem)
        .join(FinanceGroup, FinanceGroup.id == FinanceItem.group_id)
        .filter(
            FinanceItem.user_id == user.id,
            FinanceItem.archived_at.is_(None),
            FinanceGroup.archived_at.is_(None),
        )
        .all()
    )
    created = 0
    for item in items:
        if item.id in present:
            continue
        db.add(FinancePlan(user_id=user.id, item_id=item.id, month=month))
        created += 1
    db.commit()
    return created


# --- analytics ------------------------------------------------------------


def build_analytics(db: Session, user: User, reference: date, months: int) -> FinanceAnalytics:
    first = shift_month(reference, -(months - 1))

    tx_rows = (
        db.query(
            FinanceTransaction.happened_on,
            FinanceTransaction.amount,
            FinanceItem.id,
            FinanceItem.name,
            FinanceGroup.name,
            FinanceGroup.kind,
            FinanceGroup.counts_as_savings,
        )
        .join(FinanceItem, FinanceItem.id == FinanceTransaction.item_id)
        .join(FinanceGroup, FinanceGroup.id == FinanceItem.group_id)
        .filter(
            FinanceTransaction.user_id == user.id,
            FinanceTransaction.happened_on >= first,
            FinanceTransaction.happened_on < month_end(reference),
        )
        .all()
    )

    income: dict[date, float] = defaultdict(float)
    expenses: dict[date, float] = defaultdict(float)
    savings: dict[date, float] = defaultdict(float)
    group_by_month: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    item_actual: dict[date, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    item_meta: dict[int, tuple[str, str]] = {}

    for happened_on, amount, item_id, item_name, group_name, kind, is_savings in tx_rows:
        bucket = date(happened_on.year, happened_on.month, 1)
        value = float(amount)
        if kind == INCOME:
            income[bucket] += value
        else:
            expenses[bucket] += value
            group_by_month[bucket][group_name] += value
            item_actual[bucket][item_id] += value
            item_meta[item_id] = (item_name, group_name)
            if is_savings:
                savings[bucket] += value

    buckets = [shift_month(first, offset) for offset in range(months)]
    totals = []
    for bucket in buckets:
        month_income = round(income.get(bucket, 0.0), 2)
        month_expenses = round(expenses.get(bucket, 0.0), 2)
        month_savings = round(savings.get(bucket, 0.0), 2)
        totals.append(
            MonthTotals(
                month=format_month(bucket),
                income=month_income,
                expenses=month_expenses,
                balance=round(month_income - month_expenses, 2),
                savings=month_savings,
                savings_rate=(
                    round(month_savings / month_income, 4) if month_income > 0 else None
                ),
            )
        )

    planned_by_group, planned_by_item = _planned(db, user, reference)

    reference_groups = group_by_month.get(reference, {})
    total_expense = sum(reference_groups.values())
    by_group = sorted(
        (
            GroupSlice(
                group=name,
                actual=round(value, 2),
                planned=round(planned_by_group.get(name, 0.0), 2),
                share_pct=round(value / total_expense * 100, 1) if total_expense else 0.0,
            )
            for name, value in reference_groups.items()
        ),
        key=lambda slice_: slice_.actual,
        reverse=True,
    )

    # Every group that appears in any month, so the stacked chart keeps a
    # series stable instead of making bars jump when a group is idle.
    all_groups = sorted({name for values in group_by_month.values() for name in values})
    group_trend = [
        GroupTrendPoint(
            month=format_month(bucket),
            values={
                name: round(group_by_month.get(bucket, {}).get(name, 0.0), 2)
                for name in all_groups
            },
        )
        for bucket in buckets
    ]

    stats = []
    for item_id, actual in item_actual.get(reference, {}).items():
        name, group_name = item_meta[item_id]
        planned = planned_by_item.get(item_id)
        history = [
            item_actual.get(shift_month(reference, -offset), {}).get(item_id)
            for offset in range(1, AVERAGE_MONTHS + 1)
        ]
        previous = [value for value in history if value is not None]
        months_with_spend = sum(
            1 for bucket in buckets if item_actual.get(bucket, {}).get(item_id)
        )
        stats.append(
            ItemStat(
                item_id=item_id,
                name=name,
                group=group_name,
                actual=round(actual, 2),
                planned=round(planned, 2) if planned is not None else None,
                difference=round(planned - actual, 2) if planned is not None else None,
                average_3m=round(sum(previous) / len(previous), 2) if previous else None,
                months_with_spend=months_with_spend,
            )
        )

    top_items = sorted(stats, key=lambda s: s.actual, reverse=True)[:TOP_ITEMS]
    overspent = sorted(
        (s for s in stats if s.difference is not None and s.difference < 0),
        key=lambda s: s.difference or 0,
    )

    return FinanceAnalytics(
        months=totals,
        by_group=by_group,
        group_trend=group_trend,
        top_items=top_items,
        overspent=overspent,
        reference_month=format_month(reference),
    )


def _planned(db: Session, user: User, month: date) -> tuple[dict[str, float], dict[int, float]]:
    """Planned expense amounts for one month, by group name and by item, with
    percent-of-income plans resolved against that month's planned income."""
    rows = (
        db.query(FinancePlan, FinanceItem, FinanceGroup)
        .join(FinanceItem, FinanceItem.id == FinancePlan.item_id)
        .join(FinanceGroup, FinanceGroup.id == FinanceItem.group_id)
        .filter(FinancePlan.user_id == user.id, FinancePlan.month == month)
        .all()
    )
    planned_income = sum(
        float(plan.amount)
        for plan, _, group in rows
        if group.kind == INCOME and plan.amount is not None
    )

    by_group: dict[str, float] = defaultdict(float)
    by_item: dict[int, float] = {}
    for plan, item, group in rows:
        if group.kind == INCOME:
            continue
        if plan.percent_of_income:
            amount = planned_income * float(plan.percent_of_income)
        elif plan.amount is not None:
            amount = float(plan.amount)
        else:
            continue
        by_group[group.name] += amount
        by_item[item.id] = amount
    return by_group, by_item


# --- savings --------------------------------------------------------------


def build_savings(db: Session, user: User, today: date) -> SavingsSummary:
    accounts = (
        db.query(SavingsAccount)
        .filter(SavingsAccount.user_id == user.id)
        .order_by(SavingsAccount.sort_order, SavingsAccount.name)
        .all()
    )
    if not accounts:
        return SavingsSummary(accounts=[], total_balance=0.0, total_goal=None)

    rows = (
        db.query(
            SavingsOperation.account_id,
            SavingsOperation.kind,
            func.sum(SavingsOperation.amount),
            func.max(SavingsOperation.happened_on),
        )
        .filter(SavingsOperation.user_id == user.id)
        .group_by(SavingsOperation.account_id, SavingsOperation.kind)
        .all()
    )
    by_account: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    last_seen: dict[int, date] = {}
    for account_id, kind, total, latest in rows:
        by_account[account_id][kind] += float(total or 0)
        if latest is not None and (account_id not in last_seen or latest > last_seen[account_id]):
            last_seen[account_id] = latest

    out: list[SavingsAccountOut] = []
    for account in accounts:
        sums = by_account.get(account.id, {})
        balance = round(sum(sums.values()), 2)
        goal = float(account.goal_amount) if account.goal_amount is not None else None

        monthly_needed = None
        if goal is not None and account.goal_date is not None and balance < goal:
            months_left = max(
                1,
                (account.goal_date.year - today.year) * 12
                + (account.goal_date.month - today.month),
            )
            monthly_needed = round((goal - balance) / months_left, 2)

        out.append(
            SavingsAccountOut(
                id=account.id,
                name=account.name,
                goal_amount=goal,
                goal_date=account.goal_date,
                sort_order=account.sort_order,
                archived=account.archived_at is not None,
                balance=balance,
                contributed=round(sums.get(SavingsOperation.CONTRIBUTION, 0.0), 2),
                withdrawn=round(abs(sums.get(SavingsOperation.WITHDRAWAL, 0.0)), 2),
                interest=round(sums.get(SavingsOperation.INTEREST, 0.0), 2),
                goal_progress_pct=(
                    round(min(100.0, balance / goal * 100), 1) if goal and goal > 0 else None
                ),
                monthly_needed=monthly_needed,
                last_operation_on=last_seen.get(account.id),
            )
        )

    goals = [a.goal_amount for a in out if a.goal_amount is not None]
    return SavingsSummary(
        accounts=out,
        total_balance=round(sum(a.balance for a in out), 2),
        total_goal=round(sum(goals), 2) if goals else None,
    )


# --- first run ------------------------------------------------------------

# The structure of the spreadsheet this module replaces, offered on an empty
# account so the first month is editing rather than building from nothing.
# Everything here is renameable and removable afterwards.
DEFAULT_STRUCTURE: list[tuple[str, str, bool, list[str]]] = [
    (INCOME, "Доходы", False, ["Доход 1", "Дополнительный доход"]),
    (
        EXPENSE,
        "Жилье",
        False,
        [
            "Ипотека или аренда",
            "Телефон",
            "Электричество",
            "Газ",
            "Водоснабжение и канализация",
            "Интернет",
            "Вывоз мусора",
            "Ремонт или обслуживание",
            "Другое",
        ],
    ),
    (
        EXPENSE,
        "Транспорт",
        False,
        ["Проезд на автобусе/такси", "Топливо", "Обслуживание", "Страхование", "Другое"],
    ),
    (EXPENSE, "Еда", False, ["Продукты", "Рестораны", "Прочее"]),
    (EXPENSE, "Страхование", False, ["Здоровье", "Жизнь", "Дом", "Другое"]),
    (
        EXPENSE,
        "Предметы личной гигиены",
        False,
        ["Медицина", "Уход за волосами/ногтями", "Одежда", "Фитнес-клуб", "Другое"],
    ),
    (EXPENSE, "Развлечения", False, ["Кино", "Концерты", "Книги", "Подписки", "Другое"]),
    (EXPENSE, "Кредиты", False, ["Кредитная карта", "Другое"]),
    (EXPENSE, "Налоги", False, ["Другое"]),
    (
        EXPENSE,
        "Сбережения и инвестиции",
        True,
        ["Подушка безопасности", "Инвестиционный счет", "На отпуск"],
    ),
    (EXPENSE, "Подарки и пожертвования", False, ["Подарки", "Благотворительность"]),
    (EXPENSE, "Домашние животные", False, ["Еда", "Врачи и анализы", "Уход", "Другое"]),
    (EXPENSE, "Юридические расходы", False, ["Адвокат", "Другое"]),
]


def bootstrap_structure(db: Session, user: User) -> int:
    """Create the default groups and items. Does nothing if the user already
    has any — this is a starting point, never a reset."""
    exists = db.scalar(select(FinanceGroup.id).where(FinanceGroup.user_id == user.id).limit(1))
    if exists is not None:
        return 0

    created = 0
    for group_order, (kind, group_name, is_savings, items) in enumerate(DEFAULT_STRUCTURE):
        group = FinanceGroup(
            user_id=user.id,
            name=group_name,
            kind=kind,
            sort_order=group_order,
            counts_as_savings=is_savings,
        )
        db.add(group)
        db.flush()
        for item_order, item_name in enumerate(items):
            db.add(
                FinanceItem(
                    user_id=user.id, group_id=group.id, name=item_name, sort_order=item_order
                )
            )
            created += 1
    db.commit()
    return created


def active_structure(db: Session, user: User) -> list[FinanceGroup]:
    return (
        db.query(FinanceGroup)
        .filter(FinanceGroup.user_id == user.id)
        .order_by(FinanceGroup.kind.desc(), FinanceGroup.sort_order, FinanceGroup.name)
        .all()
    )


def owned_item(db: Session, user: User, item_id: int) -> FinanceItem | None:
    return (
        db.query(FinanceItem)
        .filter(FinanceItem.id == item_id, FinanceItem.user_id == user.id)
        .first()
    )
