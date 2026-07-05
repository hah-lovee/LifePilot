from datetime import date

from pydantic import BaseModel, Field


# ── Подключения ──────────────────────────────────────────────

class ConnectExchangeRequest(BaseModel):
    exchange: str = Field(..., examples=["okx"])
    api_key: str
    secret_key: str
    passphrase: str | None = None


class ConnectBrokerRequest(BaseModel):
    broker: str = Field(..., examples=["tbank"])
    token: str
    account_id: str | None = None


# ── Балансы (зеркало моделей trading-keys-api) ──────────────

class WalletBalance(BaseModel):
    currency: str
    total: float
    free: float
    used: float
    value_usdt: float | None = None
    average_price: float | None = None
    pnl_usdt: float | None = None
    pnl_percent: float | None = None


class ExchangeBalance(BaseModel):
    source_type: str = "crypto"
    exchange: str
    status: str
    balances: list[WalletBalance]
    error: str | None = None


class BrokerPosition(BaseModel):
    ticker: str
    name: str
    instrument_type: str
    quantity: float
    average_price: float
    current_price: float
    current_value: float
    currency: str
    pnl_rub: float | None = None
    pnl_percent: float | None = None
    sector: str | None = None


class BrokerPortfolio(BaseModel):
    source_type: str = "broker"
    broker: str
    account_id: str
    account_name: str
    total_value: float
    currency: str
    positions: list[BrokerPosition]
    status: str
    error: str | None = None


class InvestmentsSummary(BaseModel):
    crypto: list[ExchangeBalance]
    brokers: list[BrokerPortfolio]


class RatesOut(BaseModel):
    usd_rub: float
    source: str
    updated_at: str


# ── Дивиденды ────────────────────────────────────────────────

class DividendEvent(BaseModel):
    ticker: str
    name: str
    instrument_type: str
    payment_date: str
    amount_per_unit: float
    currency: str
    quantity_held: float
    total_amount: float


class MonthlyIncome(BaseModel):
    month: str     # "2025-08"
    total_rub: float


# ── Капитал во времени и диверсификация ─────────────────────

class NetWorthPoint(BaseModel):
    snapshot_date: date
    total_value_rub: float
    crypto_value_rub: float
    broker_value_rub: float
    invested_amount_rub: float | None = None
    dividends_received_rub: float | None = None


class DiversificationSlice(BaseModel):
    label: str
    value_rub: float
    pct: float = 0.0


class DiversificationBreakdown(BaseModel):
    by_currency: list[DiversificationSlice]
    by_source: list[DiversificationSlice]
    by_sector: list[DiversificationSlice]
    by_asset_class: list[DiversificationSlice]


class SectorDetail(BaseModel):
    sector: str
    value_rub: float
    pct: float
    positions: list[BrokerPosition]


# ── Профиль отдельного актива ────────────────────────────────

class AssetDetail(BaseModel):
    ticker: str
    name: str
    instrument_type: str
    sector: str | None
    currency: str
    quantity: float
    average_price: float
    current_price: float
    position_value_rub: float
    cost_basis_rub: float
    unrealized_pnl_rub: float
    unrealized_pnl_pct: float
    portfolio_weight_pct: float
    upcoming_dividends: list[DividendEvent]
    annual_income_rub: float
    yield_on_cost_pct: float
