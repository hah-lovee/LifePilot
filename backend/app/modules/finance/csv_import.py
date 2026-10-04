"""Import of a bank statement — Т-Банк's CSV export.

What a statement brings that the spreadsheet import cannot: the real date and
time of every purchase, and the bank's own category. What it cannot bring is
which статья of this budget a purchase belongs to — "Супермаркеты" is the
bank's idea, "Еда / Продукты" is yours. FinanceImportRule stores that answer
once per category and side, so every later statement needs no decisions.

The flow is therefore two-pass and deliberately stateless: an import writes
everything it has a rule for and reports the categories it does not, you set
those rules, and you upload the same file again. Nothing is doubled by that,
because every row carries a fingerprint.
"""

import csv
import hashlib
import io
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.user import User
from app.modules.finance.models import (
    INCOME,
    FinanceGroup,
    FinanceImportRule,
    FinanceItem,
    FinanceTransaction,
    SavingsAccount,
    SavingsOperation,
)

BANK_TBANK = "tbank"
SOURCE = "statement"

# Т-Банк writes the file in UTF-8 with a BOM from the web export and in
# Windows-1251 from some older ones, so both are tried before giving up.
ENCODINGS = ("utf-8-sig", "cp1251")

ACCOUNT = "Имя счёта"
WHEN = "Дата операции"
AMOUNT_IN_ACCOUNT_CURRENCY = "Сумма в валюте счёта"
AMOUNT = "Сумма операции"
STATUS = "Статус"
BANK_CATEGORY = "Категория по-умолчанию"
OWN_CATEGORY = "Ваша категория"
DESCRIPTION = "Описание"
COUNTED = "Учёт в аналитике"

OK_STATUS = "ок"
REQUIRED = (WHEN, AMOUNT, STATUS, DESCRIPTION)


class StatementError(ValueError):
    """Raised with a message meant for the user."""


@dataclass
class Row:
    external_id: str
    happened_on: date
    amount: float  # signed as the statement has it: negative is money out
    account: str
    category: str
    description: str

    @property
    def direction(self) -> str:
        return FinanceImportRule.OUT if self.amount < 0 else FinanceImportRule.IN


@dataclass
class Unmapped:
    category: str
    direction: str
    count: int
    total: float
    examples: list[str]


# --- reading --------------------------------------------------------------


def _decode(content: bytes) -> str:
    for encoding in ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise StatementError("Не удалось прочитать файл — ожидается CSV из Т-Банка")


def _number(value: str) -> float | None:
    """"-1545,27" — a comma for the decimal point, spaces for thousands."""
    cleaned = value.strip().replace("\xa0", "").replace(" ", "").replace(",", ".")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_statement(content: bytes) -> list[Row]:
    text = _decode(content)
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    if reader.fieldnames is None:
        raise StatementError("Файл пустой")

    header = {name.strip().lstrip("﻿") for name in reader.fieldnames}
    missing = [name for name in REQUIRED if name not in header]
    if missing:
        raise StatementError(
            "Не похоже на выписку Т-Банка — нет колонок: " + ", ".join(missing)
        )

    rows: list[Row] = []
    for raw in reader:
        if (raw.get(STATUS) or "").strip().lower() != OK_STATUS:
            # Pending and failed operations are not money that moved.
            continue
        if (raw.get(COUNTED) or "Да").strip().lower() == "нет":
            # The bank's own "do not count this" flag, set by the user there.
            continue

        when = (raw.get(WHEN) or "").strip()
        try:
            moment = datetime.strptime(when, "%d.%m.%Y %H:%M:%S")
        except ValueError:
            try:
                moment = datetime.strptime(when, "%d.%m.%Y")
            except ValueError:
                continue

        # The account-currency column is the one that belongs in a rouble
        # budget; a foreign purchase has a different number in the other.
        amount = _number(raw.get(AMOUNT_IN_ACCOUNT_CURRENCY) or "") or _number(
            raw.get(AMOUNT) or ""
        )
        if amount is None or amount == 0:
            continue

        account = (raw.get(ACCOUNT) or "").strip()
        description = (raw.get(DESCRIPTION) or "").strip()
        # "Ваша категория" is the user's own correction in the bank's app and
        # beats the default one when present.
        category = (raw.get(OWN_CATEGORY) or "").strip() or (
            raw.get(BANK_CATEGORY) or ""
        ).strip() or "Без категории"

        fingerprint = hashlib.sha256(
            "|".join([account, when, f"{amount:.2f}", description]).encode("utf-8")
        ).hexdigest()[:40]

        rows.append(
            Row(
                external_id=fingerprint,
                happened_on=moment.date(),
                amount=amount,
                account=account,
                category=category,
                description=description,
            )
        )
    if not rows:
        raise StatementError("В выписке нет проведённых операций")
    return rows


# --- writing --------------------------------------------------------------


def apply_statement(db: Session, user: User, rows: list[Row]) -> dict:
    rules = {
        (rule.category.strip().lower(), rule.direction): rule
        for rule in db.query(FinanceImportRule).filter(
            FinanceImportRule.user_id == user.id, FinanceImportRule.bank == BANK_TBANK
        )
    }
    # Both tables can hold a row that came from a statement, so the duplicate
    # guard has to look at both — interest on a savings account lives in
    # savings_operations and would otherwise re-import on every upload.
    seen = {
        external_id
        for (external_id,) in db.query(FinanceTransaction.external_id).filter(
            FinanceTransaction.user_id == user.id, FinanceTransaction.external_id.isnot(None)
        )
    } | {
        external_id
        for (external_id,) in db.query(SavingsOperation.external_id).filter(
            SavingsOperation.user_id == user.id, SavingsOperation.external_id.isnot(None)
        )
    }
    item_kind = dict(
        db.query(FinanceItem.id, FinanceGroup.kind).join(
            FinanceGroup, FinanceGroup.id == FinanceItem.group_id
        ).filter(FinanceItem.user_id == user.id)
    )
    own_accounts = {
        account_id
        for (account_id,) in db.query(SavingsAccount.id).filter(
            SavingsAccount.user_id == user.id
        )
    }

    imported = duplicates = ignored = 0
    unmapped: dict[tuple[str, str], Unmapped] = {}
    first_date: date | None = None
    last_date: date | None = None

    for row in rows:
        first_date = row.happened_on if first_date is None else min(first_date, row.happened_on)
        last_date = row.happened_on if last_date is None else max(last_date, row.happened_on)

        if row.external_id in seen:
            duplicates += 1
            continue

        rule = rules.get((row.category.strip().lower(), row.direction))
        if rule is None:
            key = (row.category, row.direction)
            entry = unmapped.get(key)
            if entry is None:
                entry = Unmapped(
                    category=row.category, direction=row.direction, count=0, total=0.0, examples=[]
                )
                unmapped[key] = entry
            entry.count += 1
            entry.total = round(entry.total + abs(row.amount), 2)
            if len(entry.examples) < 3 and row.description:
                entry.examples.append(row.description)
            continue

        if rule.ignored:
            ignored += 1
            seen.add(row.external_id)
            continue

        if rule.savings_account_id is not None and rule.savings_account_id in own_accounts:
            kind = (
                SavingsOperation.INTEREST
                if "процент" in row.description.lower()
                else SavingsOperation.CONTRIBUTION
                if row.amount > 0
                else SavingsOperation.WITHDRAWAL
            )
            db.add(
                SavingsOperation(
                    user_id=user.id,
                    account_id=rule.savings_account_id,
                    happened_on=row.happened_on,
                    amount=row.amount,
                    kind=kind,
                    note=row.description or None,
                    external_id=row.external_id,
                )
            )
            imported += 1
            seen.add(row.external_id)
            continue

        if rule.item_id is None or rule.item_id not in item_kind:
            continue

        # An expense is stored positive; a refund on an expense статья keeps its
        # minus so it reduces the month rather than inflating it.
        kind = item_kind[rule.item_id]
        amount = row.amount if kind == INCOME else -row.amount
        db.add(
            FinanceTransaction(
                user_id=user.id,
                item_id=rule.item_id,
                happened_on=row.happened_on,
                amount=amount,
                note=row.description or None,
                source=SOURCE,
                external_id=row.external_id,
            )
        )
        imported += 1
        seen.add(row.external_id)

    db.commit()
    return {
        "imported": imported,
        "duplicates": duplicates,
        "ignored": ignored,
        "rows": len(rows),
        "period_from": first_date,
        "period_to": last_date,
        # Biggest first: that is the category worth deciding about.
        "unmapped": [
            {
                "category": entry.category,
                "direction": entry.direction,
                "count": entry.count,
                "total": entry.total,
                "examples": entry.examples,
            }
            for entry in sorted(unmapped.values(), key=lambda u: u.total, reverse=True)
        ],
    }
