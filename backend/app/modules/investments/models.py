from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class InvestmentSnapshot(Base):
    """One row per user per day — written by the daily scheduler job (see
    app/modules/investments/scheduler.py), never by the read endpoints, so
    opening the page never silently mutates data."""

    __tablename__ = "investment_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "snapshot_date", name="uq_investment_snapshot_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_value_rub: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    crypto_value_rub: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    broker_value_rub: Mapped[float] = mapped_column(Numeric(16, 2), nullable=False)
    invested_amount_rub: Mapped[float | None] = mapped_column(Numeric(16, 2), nullable=True)
    dividends_received_rub: Mapped[float | None] = mapped_column(Numeric(16, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ManualCryptoTrade(Base):
    """A user-entered buy/sell used to compute cost basis for a crypto
    position when the automatic sync (trading-keys-api, matching by current
    exchange symbol) can't find it — e.g. a renamed/delisted trading pair, or
    coins transferred in after being bought elsewhere. FIFO-averaged the same
    way as real synced trades (see service.py); fee_usdt is folded into cost
    so the resulting average price is what the position actually cost."""

    __tablename__ = "manual_crypto_trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    portfolio_name: Mapped[str] = mapped_column(String(60), nullable=False)
    currency: Mapped[str] = mapped_column(String(20), nullable=False)
    trade_date: Mapped[date] = mapped_column(Date, nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # "buy" | "sell"
    quantity: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    price_usdt: Mapped[float] = mapped_column(Numeric(24, 8), nullable=False)
    fee_usdt: Mapped[float | None] = mapped_column(Numeric(24, 8), nullable=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
