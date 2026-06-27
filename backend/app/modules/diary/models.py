from datetime import date, datetime

from sqlalchemy import ARRAY, Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base

# Seeded into every new user's tag vocabulary on registration (see
# app/modules/auth/router.py) so they have sensible options before they've
# tagged anything themselves.
BASE_DIARY_TAGS = [
    "болел",
    "дедлайн",
    "перелёт",
    "командировка",
    "праздник",
    "выходной",
    "стресс",
    "отпуск",
    "плохой сон",
    "алкоголь",
]


class DiaryTag(Base):
    """A user's tag vocabulary: base tags seeded at registration plus any
    custom tags they add. Diary entries reference tags by name (see
    DiaryEntry.tags) rather than by id, so this table only exists to drive
    the picker UI and prevent typos — not as a foreign key target."""

    __tablename__ = "diary_tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_diary_tag_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(60), nullable=False)
    is_base: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class DiaryEntry(Base):
    """One entry per user per calendar day. Tags capture notable events of the
    day (e.g. "перелёт", "болел", "дедлайн") used later to correlate with habit
    score swings in the reporting module."""

    __tablename__ = "diary_entries"
    __table_args__ = (UniqueConstraint("user_id", "entry_date", name="uq_diary_entry_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(60)), default=list, server_default="{}")
    day_score: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="diary_entries")  # noqa: F821
