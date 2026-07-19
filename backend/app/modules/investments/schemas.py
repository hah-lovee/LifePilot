from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Подключения ──────────────────────────────────────────────

class ConnectExchangeRequest(BaseModel):
    exchange: str = Field(..., examples=["okx"])
    portfolio_name: str | None = Field(None, description="Уникальное название портфеля (по умолчанию — название биржи)")
    api_key: str
    secret_key: str
    passphrase: str | None = None


class ConnectBrokerRequest(BaseModel):
    broker: str = Field(..., examples=["tbank"])
    portfolio_name: str | None = Field(None, description="Уникальное название портфеля (по умолчанию — название брокера)")
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
    portfolio_name: str = ""
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
    portfolio_name: str = ""
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
    usd_rub: float = 0.0


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


# ── Ручной ввод себестоимости (когда автосинхронизация не смогла) ──

class ManualCryptoTradeCreate(BaseModel):
    portfolio_name: str
    currency: str
    trade_date: date
    side: str = Field(..., pattern="^(buy|sell)$")
    quantity: float = Field(..., gt=0)
    price_usdt: float = Field(..., gt=0)
    fee_usdt: float | None = Field(None, ge=0)
    note: str | None = None


class ManualCryptoTradeOut(BaseModel):
    id: int
    portfolio_name: str
    currency: str
    trade_date: date
    side: str
    quantity: float
    price_usdt: float
    fee_usdt: float | None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


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
