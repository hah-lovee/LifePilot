"""The monthly budget, modelled on the spreadsheet it replaces.

The spreadsheet is one file per month: income at the top, then a dozen tables of
expenses, each row a статья with planned, actual and the difference. Two details
of how it was actually used drove this model:

  - Actual amounts were kept as a formula — `=1077+50+678+181+...` — one term
    per purchase. That is a transaction log collapsed into a cell, so here the
    purchases are rows (`FinanceTransaction`) and the month total is derived.

  - Статьи were rewritten every month: "Адвокат" and "Др багды и ильи" belong
    to September and nothing else. So an item is not simply "on" forever — it
    takes part in a month when it has a `FinancePlan` row for that month, or a
    transaction in it. A one-off therefore disappears by itself next month,
    while "Продукты" carries over because the plan is copied forward.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base

INCOME = "income"
EXPENSE = "expense"


class FinanceGroup(Base):
    """A block of the spreadsheet: Жилье, Еда, Развлечения — or, with
    kind=income, the income block at the top."""

    __tablename__ = "finance_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=EXPENSE)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Money moved here is put aside rather than consumed — "Сбережения и
    # инвестиции" in the spreadsheet. An explicit flag, because deciding it by
    # matching the group's name would quietly break the moment it is renamed,
    # and the savings rate is the one number worth getting right.
    counts_as_savings: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="false"
    )
    # Archived rather than deleted: deleting would take its history with it.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    items: Mapped[list["FinanceItem"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (Index("ix_finance_groups_user", "user_id", "kind", "sort_order"),)


class FinanceItem(Base):
    """A row inside a group: Продукты, Рестораны, Адвокат."""

    __tablename__ = "finance_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    group_id: Mapped[int] = mapped_column(
        ForeignKey("finance_groups.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    group: Mapped["FinanceGroup"] = relationship(back_populates="items")

    __table_args__ = (Index("ix_finance_items_group", "group_id", "sort_order"),)


class FinancePlan(Base):
    """The planned amount for one item in one month.

    The row itself carries meaning beyond the number: its presence is what puts
    the item in that month's budget. `amount` may be NULL — an item you track
    without planning for it.

    `percent_of_income` reproduces the formulas the spreadsheet used for
    savings (`=доход*5%`, `=доход*20%*30%`). When set, it wins over `amount`
    and is applied to the month's planned income, so changing the salary
    re-plans the savings by itself."""

    __tablename__ = "finance_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("finance_items.id", ondelete="CASCADE"), nullable=False
    )
    # Always the first day of the month it describes.
    month: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    percent_of_income: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True)

    item: Mapped["FinanceItem"] = relationship()

    __table_args__ = (
        UniqueConstraint("item_id", "month", name="uq_finance_plans_item_month"),
        Index("ix_finance_plans_user_month", "user_id", "month"),
    )


class FinanceTransaction(Base):
    """One actual payment or receipt. Several on one day under one item are
    simply several rows — this is the log the spreadsheet's `=1077+50+...`
    formula was standing in for."""

    __tablename__ = "finance_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(
        ForeignKey("finance_items.id", ondelete="CASCADE"), nullable=False
    )
    happened_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "xlsx" for a row the spreadsheet importer created, NULL for one entered by
    # hand. Re-importing a month replaces its own rows and leaves the hand-typed
    # ones alone; keying that on the filename was wrong, because the same month
    # under a different name doubled instead of replacing.
    source: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    item: Mapped["FinanceItem"] = relationship()

    __table_args__ = (
        Index("ix_finance_transactions_user_date", "user_id", "happened_on"),
        Index("ix_finance_transactions_item_date", "item_id", "happened_on"),
    )


class SavingsAccount(Base):
    """A pot of money kept aside: отпуск, подушка безопасности, накопительный
    счёт в банке. Deliberately separate from the investments module, which
    reads real broker and exchange positions through trading-keys-api — these
    are balances you maintain yourself."""

    __tablename__ = "savings_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    goal_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    goal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    operations: Mapped[list["SavingsOperation"]] = relationship(
        back_populates="account", cascade="all, delete-orphan", passive_deletes=True
    )


class SavingsOperation(Base):
    """A movement on a savings account. `amount` is signed — deposits and
    interest positive, withdrawals negative — so the balance is a plain sum and
    cannot disagree with the ledger. `kind` only says what the movement was,
    which is what makes "сколько набежало процентами" answerable."""

    __tablename__ = "savings_operations"

    CONTRIBUTION = "contribution"
    WITHDRAWAL = "withdrawal"
    INTEREST = "interest"

    __table_args__ = (Index("ix_savings_operations_account_date", "account_id", "happened_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("savings_accounts.id", ondelete="CASCADE"), nullable=False
    )
    happened_on: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default=CONTRIBUTION)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    account: Mapped["SavingsAccount"] = relationship(back_populates="operations")
