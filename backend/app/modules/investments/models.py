from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, UniqueConstraint
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
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
