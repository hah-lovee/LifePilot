from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class Exercise(Base):
    """A gym exercise/machine. Catalog entries (is_base=True, user_id=None) are
    created by an admin and can be adopted (copied) into a user's own list via
    POST /api/exercises/{id}/adopt — mirrors how Habit catalog entries work."""

    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    muscle_group: Mapped[str | None] = mapped_column(String(80), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_base: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    logs: Mapped[list["ExerciseLog"]] = relationship(back_populates="exercise", cascade="all, delete-orphan")


class ExerciseLog(Base):
    """One set logged on a given date. Unlike habit logs, multiple sets per
    exercise per day are expected, so there is no unique (exercise_id, log_date)
    constraint — each set is its own row."""

    __tablename__ = "exercise_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    weight: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sets: Mapped[int] = mapped_column(Integer, default=1, server_default="1", nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercise: Mapped["Exercise"] = relationship(back_populates="logs")
