from datetime import date

from pydantic import BaseModel


class DayScorePoint(BaseModel):
    entry_date: date
    day_score: float | None


class HabitTrendPoint(BaseModel):
    log_date: date
    score: int


class TagImpact(BaseModel):
    tag: str
    avg_score_with_tag: float | None
    avg_score_without_tag: float | None
    days_with_tag: int


class HabitSummary(BaseModel):
    habit_id: int
    habit_name: str
    avg_score_30d: float | None
    current_streak_days: int


class ReportSummary(BaseModel):
    avg_day_score_7d: float | None
    avg_day_score_30d: float | None
    habits: list[HabitSummary]


class SleepPoint(BaseModel):
    entry_date: date
    sleep_hours: float
    day_score: float | None


class SleepSummary(BaseModel):
    avg_sleep_hours: float | None
    avg_bedtime: str | None
    avg_wakeup: str | None
    days_with_data: int
    score_by_quality: dict[str, float | None]  # {"отличный": 8.2, ...}
    points: list[SleepPoint]
