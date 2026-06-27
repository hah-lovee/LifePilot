from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class MuscleGroup(Base):
    """A predefined muscle group, managed only by admins (see
    app/modules/admin/router.py) so the list stays consistent across exercises."""

    __tablename__ = "muscle_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)


class Exercise(Base):
    """A gym exercise/machine. Created and managed only by admins (see
    app/modules/admin/router.py) — a shared catalog, not owned by any user."""

    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    muscle_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("muscle_groups.id", ondelete="SET NULL"), nullable=True
    )
    photo_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    muscle_group_ref: Mapped["MuscleGroup | None"] = relationship()
    logs: Mapped[list["ExerciseLog"]] = relationship(back_populates="exercise", cascade="all, delete-orphan")

    @property
    def muscle_group(self) -> str | None:
        return self.muscle_group_ref.name if self.muscle_group_ref else None


class ExerciseLog(Base):
    """One set logged by a user on a given date. Several sets of the same
    exercise on the same day are just several rows — no unique constraint."""

    __tablename__ = "exercise_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    weight: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercise: Mapped["Exercise"] = relationship(back_populates="logs")
