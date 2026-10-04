from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.modules.finance.models import EXPENSE, INCOME

KINDS = (INCOME, EXPENSE)


# --- Structure: groups and items ------------------------------------------


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: str = EXPENSE
    sort_order: int = 0
    counts_as_savings: bool = False

    @field_validator("kind")
    @classmethod
    def known_kind(cls, value: str) -> str:
        if value not in KINDS:
            raise ValueError(f"kind must be one of {KINDS}")
        return value


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    sort_order: int | None = None
    counts_as_savings: bool | None = None
    archived: bool | None = None


class ItemCreate(BaseModel):
    group_id: int
    name: str = Field(min_length=1, max_length=120)
    sort_order: int = 0
    # Adding an item while looking at a month should put it in that month —
    # otherwise it is created and immediately invisible.
    month: str | None = None


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    group_id: int | None = None
    sort_order: int | None = None
    archived: bool | None = None


class ItemOut(BaseModel):
    id: int
    group_id: int
    name: str
    sort_order: int
    archived: bool


class GroupOut(BaseModel):
    id: int
    name: str
    kind: str
    sort_order: int
    counts_as_savings: bool
    archived: bool
    items: list[ItemOut]


# --- Plans ----------------------------------------------------------------


class PlanWrite(BaseModel):
    item_id: int
    month: str  # YYYY-MM
    amount: float | None = Field(default=None, ge=0)
    percent_of_income: float | None = Field(default=None, ge=0, le=1)


class PlanDelete(BaseModel):
    item_id: int
    month: str


class CopyMonthRequest(BaseModel):
    source_month: str  # YYYY-MM — the month whose structure and plans to copy
    include_amounts: bool = True


# --- Transactions ---------------------------------------------------------


class TransactionCreate(BaseModel):
    item_id: int
    happened_on: date
    amount: float = Field(gt=0)
    note: str | None = None


class TransactionUpdate(BaseModel):
    item_id: int | None = None
    happened_on: date | None = None
    amount: float | None = Field(default=None, gt=0)
    note: str | None = None


class TransactionOut(BaseModel):
    id: int
    item_id: int
    happened_on: date
    amount: float
    note: str | None

    model_config = {"from_attributes": True}


# --- Month view -----------------------------------------------------------


class MonthItem(BaseModel):
    item_id: int
    name: str
    planned: float | None
    actual: float
    difference: float | None  # planned - actual; positive means under budget
    percent_of_income: float | None
    transactions: int
    in_plan: bool  # has a plan row for this month, i.e. carried over on purpose


class MonthGroup(BaseModel):
    group_id: int
    name: str
    kind: str
    counts_as_savings: bool
    items: list[MonthItem]
    planned: float
    actual: float
    difference: float


class MonthView(BaseModel):
    month: str
    income: list[MonthGroup]
    expenses: list[MonthGroup]
    planned_income: float
    actual_income: float
    planned_expenses: float
    actual_expenses: float
    planned_balance: float
    actual_balance: float
    # Фактический остаток минус плановый — the spreadsheet's "Разница".
    balance_difference: float
    is_empty: bool
    previous_month: str | None  # nearest earlier month with data, to copy from


# --- Analytics ------------------------------------------------------------


class MonthTotals(BaseModel):
    month: str
    income: float
    expenses: float
    balance: float
    savings: float  # actual amount put into groups flagged counts_as_savings
    savings_rate: float | None  # savings / income


class GroupSlice(BaseModel):
    group: str
    actual: float
    planned: float
    share_pct: float


class GroupTrendPoint(BaseModel):
    month: str
    values: dict[str, float]  # group name -> actual spend


class ItemStat(BaseModel):
    item_id: int
    name: str
    group: str
    actual: float
    planned: float | None
    difference: float | None
    average_3m: float | None
    months_with_spend: int


class FinanceAnalytics(BaseModel):
    months: list[MonthTotals]
    by_group: list[GroupSlice]  # the latest month, biggest first
    group_trend: list[GroupTrendPoint]
    top_items: list[ItemStat]
    overspent: list[ItemStat]  # this month's items over plan, worst first
    reference_month: str


# --- Savings --------------------------------------------------------------


class SavingsAccountCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    goal_amount: float | None = Field(default=None, gt=0)
    goal_date: date | None = None
    sort_order: int = 0


class SavingsAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    goal_amount: float | None = Field(default=None, gt=0)
    goal_date: date | None = None
    sort_order: int | None = None
    archived: bool | None = None


class SavingsOperationCreate(BaseModel):
    happened_on: date
    amount: float
    kind: str = "contribution"
    note: str | None = None

    @field_validator("kind")
    @classmethod
    def known_kind(cls, value: str) -> str:
        allowed = ("contribution", "withdrawal", "interest")
        if value not in allowed:
            raise ValueError(f"kind must be one of {allowed}")
        return value

    @field_validator("amount")
    @classmethod
    def nonzero(cls, value: float) -> float:
        if value == 0:
            raise ValueError("amount must not be zero")
        return value


class SavingsOperationOut(BaseModel):
    id: int
    happened_on: date
    amount: float
    kind: str
    note: str | None

    model_config = {"from_attributes": True}


class SavingsAccountOut(BaseModel):
    id: int
    name: str
    goal_amount: float | None
    goal_date: date | None
    sort_order: int
    archived: bool
    balance: float
    contributed: float
    withdrawn: float
    interest: float
    goal_progress_pct: float | None
    # What the balance needs to grow by each month to reach the goal in time.
    monthly_needed: float | None
    last_operation_on: date | None


class SavingsSummary(BaseModel):
    accounts: list[SavingsAccountOut]
    total_balance: float
    total_goal: float | None
