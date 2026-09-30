from datetime import date

from pydantic import BaseModel


class DayScorePoint(BaseModel):
    entry_date: date
    day_score: float | None
    energy: int | None = None
    mood: int | None = None
    body_condition: int | None = None
    sleep_score: float | None = None


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


class StateSummary(BaseModel):
    avg_energy_7d: float | None
    avg_energy_30d: float | None
    avg_mood_7d: float | None
    avg_mood_30d: float | None
    avg_body_condition_7d: float | None
    avg_body_condition_30d: float | None


class ReportSummary(BaseModel):
    avg_day_score_7d: float | None
    avg_day_score_30d: float | None
    habits: list[HabitSummary]
    state: StateSummary


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


class MuscleReadiness(BaseModel):
    group: str
    last_trained: date
    days_since: int
    base_recovery_hours: int  # as configured for the group
    recovery_hours: int  # after adjusting for how hard the last session was
    sets_last_session: int
    typical_sets: float
    readiness_pct: int
    ready_in_days: int


class GroupLoad(BaseModel):
    group: str
    sessions: int
    sets: int
    volume: float
    share_pct: float


class WeeklyLoad(BaseModel):
    week_start: date
    sets: int
    volume: float
    sessions: int


class ExerciseProgress(BaseModel):
    exercise_id: int
    name: str
    muscle_group: str | None
    best_weight: float | None
    best_weight_date: date | None
    recent_best: float | None  # best of the last 8 weeks
    previous_best: float | None  # best of the 8 weeks before those
    delta: float | None
    last_done: date
    sessions: int
    sets: int
    stale: bool


class SportFrequency(BaseModel):
    sessions_30d: int
    sessions_per_week: float
    longest_gap_days: int | None
    days_since_last: int | None


class SportReport(BaseModel):
    readiness: list[MuscleReadiness]
    load_30d: list[GroupLoad]
    weekly: list[WeeklyLoad]
    exercises: list[ExerciseProgress]
    frequency: SportFrequency
