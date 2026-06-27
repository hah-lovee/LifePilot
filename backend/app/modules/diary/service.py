from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.diary.models import DiaryEntry
from app.modules.habits.models import Habit, HabitLog


def recompute_day_score(db: Session, user_id: int, log_date: date) -> None:
    """Day score = average of all habit log scores the user recorded on that date.
    Diary content is left untouched; only the score column is kept in sync so
    reporting can read it without recomputing on every request."""
    avg_score = (
        db.query(func.avg(HabitLog.score))
        .join(Habit, Habit.id == HabitLog.habit_id)
        .filter(Habit.user_id == user_id, HabitLog.log_date == log_date)
        .scalar()
    )

    entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user_id, DiaryEntry.entry_date == log_date)
        .first()
    )
    if entry is None:
        if avg_score is None:
            return
        entry = DiaryEntry(user_id=user_id, entry_date=log_date, day_score=avg_score)
        db.add(entry)
    else:
        entry.day_score = avg_score

    db.commit()
