from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.finance import service, xlsx_import
from app.modules.finance.models import (
    FinanceGroup,
    FinanceItem,
    FinancePlan,
    FinanceTransaction,
    SavingsAccount,
    SavingsOperation,
)
from app.modules.finance.schemas import (
    CopyMonthRequest,
    FinanceAnalytics,
    GroupCreate,
    GroupOut,
    GroupUpdate,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    MonthView,
    PlanDelete,
    PlanWrite,
    SavingsAccountCreate,
    SavingsAccountUpdate,
    SavingsOperationCreate,
    SavingsOperationOut,
    SavingsSummary,
    TransactionCreate,
    TransactionOut,
    TransactionUpdate,
)

router = APIRouter(prefix="/api/finance", tags=["finance"])


def _today(user: User) -> date:
    """The user's own today: months are the unit of this module, and on a UTC
    server the last evening of a month would otherwise land in the next one."""
    try:
        return datetime.now(timezone.utc).astimezone(ZoneInfo(user.timezone)).date()
    except (KeyError, ValueError):
        return datetime.now(timezone.utc).date()


def _month(value: str | None, user: User) -> date:
    if not value:
        today = _today(user)
        return date(today.year, today.month, 1)
    try:
        return service.parse_month(value)
    except (ValueError, IndexError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Месяц указывается как YYYY-MM"
        ) from None


def _owned_group(db: Session, user: User, group_id: int) -> FinanceGroup:
    group = (
        db.query(FinanceGroup)
        .filter(FinanceGroup.id == group_id, FinanceGroup.user_id == user.id)
        .first()
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Группа не найдена")
    return group


def _owned_item(db: Session, user: User, item_id: int) -> FinanceItem:
    item = service.owned_item(db, user, item_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Статья не найдена")
    return item


def _group_out(group: FinanceGroup, items: list[FinanceItem]) -> GroupOut:
    return GroupOut(
        id=group.id,
        name=group.name,
        kind=group.kind,
        sort_order=group.sort_order,
        counts_as_savings=group.counts_as_savings,
        archived=group.archived_at is not None,
        items=[
            ItemOut(
                id=item.id,
                group_id=item.group_id,
                name=item.name,
                sort_order=item.sort_order,
                archived=item.archived_at is not None,
            )
            for item in sorted(items, key=lambda i: (i.sort_order, i.name.lower()))
        ],
    )


# --- month ----------------------------------------------------------------


@router.get("/month", response_model=MonthView)
def month_view(
    month: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MonthView:
    return service.build_month(db, user, _month(month, user))


@router.get("/months", response_model=list[str])
def month_list(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[str]:
    return service.months_with_data(db, user)


@router.post("/month/{month}/copy")
def copy_from_month(
    month: str,
    payload: CopyMonthRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, int]:
    target = _month(month, user)
    source = _month(payload.source_month, user)
    if source == target:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя копировать месяц в себя"
        )
    created = service.copy_month(db, user, source, target, payload.include_amounts)
    return {"created": created}


# --- structure ------------------------------------------------------------


@router.get("/structure", response_model=list[GroupOut])
def structure(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[GroupOut]:
    groups = service.active_structure(db, user)
    items = db.query(FinanceItem).filter(FinanceItem.user_id == user.id).all()
    by_group: dict[int, list[FinanceItem]] = {}
    for item in items:
        by_group.setdefault(item.group_id, []).append(item)
    return [_group_out(group, by_group.get(group.id, [])) for group in groups]


@router.post("/bootstrap")
def bootstrap(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, int]:
    """Lay down the default groups and items. Refuses to do anything once the
    user has a structure of their own, so it can never wipe one."""
    return {"created": service.bootstrap_structure(db, user)}


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> GroupOut:
    group = FinanceGroup(user_id=user.id, **payload.model_dump())
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_out(group, [])


@router.patch("/groups/{group_id}", response_model=GroupOut)
def update_group(
    group_id: int,
    payload: GroupUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> GroupOut:
    group = _owned_group(db, user, group_id)
    data = payload.model_dump(exclude_unset=True)
    if "archived" in data:
        group.archived_at = datetime.now(timezone.utc) if data.pop("archived") else None
    for field, value in data.items():
        setattr(group, field, value)
    db.commit()
    db.refresh(group)
    items = db.query(FinanceItem).filter(FinanceItem.group_id == group.id).all()
    return _group_out(group, items)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    """Deletes the group with its items, plans and transactions. Archiving is
    the usual choice; this is for a group created by mistake."""
    db.delete(_owned_group(db, user, group_id))
    db.commit()


@router.post("/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: ItemCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ItemOut:
    _owned_group(db, user, payload.group_id)
    item = FinanceItem(
        user_id=user.id,
        group_id=payload.group_id,
        name=payload.name.strip(),
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.flush()
    if payload.month:
        # Created while looking at a month: an empty plan row is what makes it
        # show up there, and only there.
        db.add(FinancePlan(user_id=user.id, item_id=item.id, month=_month(payload.month, user)))
    db.commit()
    db.refresh(item)
    return ItemOut(
        id=item.id,
        group_id=item.group_id,
        name=item.name,
        sort_order=item.sort_order,
        archived=False,
    )


@router.patch("/items/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ItemOut:
    item = _owned_item(db, user, item_id)
    data = payload.model_dump(exclude_unset=True)
    if "archived" in data:
        item.archived_at = datetime.now(timezone.utc) if data.pop("archived") else None
    if "group_id" in data and data["group_id"] is not None:
        _owned_group(db, user, data["group_id"])
    for field, value in data.items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return ItemOut(
        id=item.id,
        group_id=item.group_id,
        name=item.name,
        sort_order=item.sort_order,
        archived=item.archived_at is not None,
    )


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    db.delete(_owned_item(db, user, item_id))
    db.commit()


# --- plans ----------------------------------------------------------------


@router.put("/plans")
def write_plan(
    payload: PlanWrite, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict[str, float | None]:
    _owned_item(db, user, payload.item_id)
    month = _month(payload.month, user)
    plan = (
        db.query(FinancePlan)
        .filter(FinancePlan.item_id == payload.item_id, FinancePlan.month == month)
        .first()
    )
    if plan is None:
        plan = FinancePlan(user_id=user.id, item_id=payload.item_id, month=month)
        db.add(plan)
    # A percentage and a fixed amount would contradict each other, so the one
    # that was sent wins and the other is cleared.
    if payload.percent_of_income is not None:
        plan.percent_of_income = payload.percent_of_income
        plan.amount = None
    else:
        plan.amount = payload.amount
        plan.percent_of_income = None
    db.commit()
    return {"amount": payload.amount, "percent_of_income": payload.percent_of_income}


@router.delete("/plans", status_code=status.HTTP_204_NO_CONTENT)
def drop_plan(
    payload: PlanDelete, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    """Takes the item out of that month. Its transactions stay, and while any
    remain the item keeps showing in the month — removing a row is not a way to
    hide money that was actually spent."""
    month = _month(payload.month, user)
    plan = (
        db.query(FinancePlan)
        .filter(
            FinancePlan.user_id == user.id,
            FinancePlan.item_id == payload.item_id,
            FinancePlan.month == month,
        )
        .first()
    )
    if plan is not None:
        db.delete(plan)
        db.commit()


# --- transactions ---------------------------------------------------------


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    month: str | None = None,
    item_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[FinanceTransaction]:
    query = db.query(FinanceTransaction).filter(FinanceTransaction.user_id == user.id)
    if month:
        first = _month(month, user)
        query = query.filter(
            FinanceTransaction.happened_on >= first,
            FinanceTransaction.happened_on < service.month_end(first),
        )
    if item_id:
        query = query.filter(FinanceTransaction.item_id == item_id)
    return query.order_by(
        FinanceTransaction.happened_on.desc(), FinanceTransaction.id.desc()
    ).all()


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FinanceTransaction:
    _owned_item(db, user, payload.item_id)
    transaction = FinanceTransaction(user_id=user.id, **payload.model_dump())
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.patch("/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FinanceTransaction:
    transaction = (
        db.query(FinanceTransaction)
        .filter(FinanceTransaction.id == transaction_id, FinanceTransaction.user_id == user.id)
        .first()
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Трата не найдена")
    data = payload.model_dump(exclude_unset=True)
    if data.get("item_id") is not None:
        _owned_item(db, user, data["item_id"])
    for field, value in data.items():
        setattr(transaction, field, value)
    db.commit()
    db.refresh(transaction)
    return transaction


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    transaction_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    transaction = (
        db.query(FinanceTransaction)
        .filter(FinanceTransaction.id == transaction_id, FinanceTransaction.user_id == user.id)
        .first()
    )
    if transaction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Трата не найдена")
    db.delete(transaction)
    db.commit()


# --- import from the spreadsheet -----------------------------------------

_MAX_XLSX_BYTES = 10 * 1024 * 1024


@router.post("/import-xlsx")
async def import_xlsx(
    file: UploadFile = File(...),
    month: str | None = Form(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, int | str]:
    """Load one month out of a "Личный бюджет на месяц" file.

    The month comes from the filename (09_2026.xlsx) unless given explicitly —
    the sheet itself never says which month it is. Re-importing the same file
    replaces the rows it created last time rather than doubling them."""
    content = await file.read()
    if len(content) > _MAX_XLSX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл больше 10 МБ")

    filename = file.filename or "budget.xlsx"
    target = (
        service.parse_month(month)
        if month
        else xlsx_import.month_from_filename(filename)
    )
    if target is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Не понял, за какой месяц файл — назовите его как 09_2026.xlsx или укажите месяц",
        )

    try:
        parsed = xlsx_import.parse_workbook(content, target)
    except xlsx_import.XlsxImportError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    result = xlsx_import.apply_month(db, user, parsed, filename)
    return {**result, "month_label": service.format_month(target)}


# --- analytics ------------------------------------------------------------


@router.get("/analytics", response_model=FinanceAnalytics)
def analytics(
    month: str | None = None,
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FinanceAnalytics:
    return service.build_analytics(db, user, _month(month, user), months)


# --- savings --------------------------------------------------------------


def _owned_account(db: Session, user: User, account_id: int) -> SavingsAccount:
    account = (
        db.query(SavingsAccount)
        .filter(SavingsAccount.id == account_id, SavingsAccount.user_id == user.id)
        .first()
    )
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Счёт не найден")
    return account


@router.get("/savings", response_model=SavingsSummary)
def savings(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SavingsSummary:
    return service.build_savings(db, user, _today(user))


@router.post("/savings", status_code=status.HTTP_201_CREATED)
def create_account(
    payload: SavingsAccountCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, int]:
    account = SavingsAccount(user_id=user.id, **payload.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"id": account.id}


@router.patch("/savings/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_account(
    account_id: int,
    payload: SavingsAccountUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    account = _owned_account(db, user, account_id)
    data = payload.model_dump(exclude_unset=True)
    if "archived" in data:
        account.archived_at = datetime.now(timezone.utc) if data.pop("archived") else None
    for field, value in data.items():
        setattr(account, field, value)
    db.commit()


@router.delete("/savings/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    db.delete(_owned_account(db, user, account_id))
    db.commit()


@router.get("/savings/{account_id}/operations", response_model=list[SavingsOperationOut])
def list_operations(
    account_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SavingsOperation]:
    _owned_account(db, user, account_id)
    return (
        db.query(SavingsOperation)
        .filter(SavingsOperation.account_id == account_id)
        .order_by(SavingsOperation.happened_on.desc(), SavingsOperation.id.desc())
        .all()
    )


@router.post(
    "/savings/{account_id}/operations",
    response_model=SavingsOperationOut,
    status_code=status.HTTP_201_CREATED,
)
def create_operation(
    account_id: int,
    payload: SavingsOperationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavingsOperation:
    _owned_account(db, user, account_id)
    # The sign carries the meaning, so it is forced to agree with the kind
    # rather than trusted: a withdrawal typed as 5000 must not read as a deposit.
    amount = abs(payload.amount)
    if payload.kind == SavingsOperation.WITHDRAWAL:
        amount = -amount
    operation = SavingsOperation(
        user_id=user.id,
        account_id=account_id,
        happened_on=payload.happened_on,
        amount=amount,
        kind=payload.kind,
        note=payload.note,
    )
    db.add(operation)
    db.commit()
    db.refresh(operation)
    return operation


@router.delete(
    "/savings/{account_id}/operations/{operation_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_operation(
    account_id: int,
    operation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _owned_account(db, user, account_id)
    operation = (
        db.query(SavingsOperation)
        .filter(
            SavingsOperation.id == operation_id,
            SavingsOperation.account_id == account_id,
            SavingsOperation.user_id == user.id,
        )
        .first()
    )
    if operation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Операция не найдена")
    db.delete(operation)
    db.commit()
