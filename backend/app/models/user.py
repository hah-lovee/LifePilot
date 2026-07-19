from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Telegram: chat_id set once the user completes the /start <code> linking
    # flow (see app/modules/telegram); link_code is the pending, one-time code
    # shown in the app until it's consumed by that flow.
    telegram_chat_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    telegram_link_code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # IANA tz name (e.g. "Europe/Moscow") — habit reminders are matched against
    # this, not server local time, since the server runs in UTC.
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Moscow", server_default="Europe/Moscow")

    habits: Mapped[list["Habit"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    diary_entries: Mapped[list["DiaryEntry"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
