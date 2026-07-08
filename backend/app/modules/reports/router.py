from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.diary.models import DiaryEntry
from app.modules.habits.models import Habit, HabitLog
from app.modules.reports.schemas import (
    DayScorePoint,
    HabitSummary,
    HabitTrendPoint,
    ReportSummary,
    SleepPoint,
    SleepSummary,
    TagImpact,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/day-scores", response_model=list[DayScorePoint])
def day_scores(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DiaryEntry]:
    query = db.query(DiaryEntry).filter(DiaryEntry.user_id == user.id)
    if date_from:
        query = query.filter(DiaryEntry.entry_date >= date_from)
    if date_to:
        query = query.filter(DiaryEntry.entry_date <= date_to)
    return query.order_by(DiaryEntry.entry_date).all()


@router.get("/habits/{habit_id}/trend", response_model=list[HabitTrendPoint])
def habit_trend(
    habit_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HabitLog]:
    query = (
        db.query(HabitLog)
        .join(Habit, Habit.id == HabitLog.habit_id)
        .filter(Habit.user_id == user.id, Habit.id == habit_id)
    )
    if date_from:
        query = query.filter(HabitLog.log_date >= date_from)
    if date_to:
        query = query.filter(HabitLog.log_date <= date_to)
    return query.order_by(HabitLog.log_date).all()


@router.get("/tag-impact", response_model=list[TagImpact])
def tag_impact(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[TagImpact]:
    """For each tag the user has ever used on a diary entry, compare the average
    day score on days carrying that tag versus days without it. A practical way
    to spot which events tend to coincide with better/worse habit performance."""
    entries = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.day_score.isnot(None))
        .all()
    )

    all_tags: set[str] = set()
    for entry in entries:
        all_tags.update(entry.tags or [])

    results: list[TagImpact] = []
    for tag in sorted(all_tags):
        with_scores = [float(e.day_score) for e in entries if tag in (e.tags or [])]
        without_scores = [float(e.day_score) for e in entries if tag not in (e.tags or [])]
        results.append(
            TagImpact(
                tag=tag,
                avg_score_with_tag=sum(with_scores) / len(with_scores) if with_scores else None,
                avg_score_without_tag=sum(without_scores) / len(without_scores) if without_scores else None,
                days_with_tag=len(with_scores),
            )
        )
    return results


def _parse_time_minutes(t: str) -> int | None:
    """'HH:MM' → минуты от полуночи."""
    try:
        h, m = t.split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


def _sleep_hours(bedtime: str, wakeup: str) -> float | None:
    bed = _parse_time_minutes(bedtime)
    wake = _parse_time_minutes(wakeup)
    if bed is None or wake is None:
        return None
    minutes = (wake - bed) % (24 * 60)
    return round(minutes / 60, 2)


def _minutes_to_hhmm(minutes: float) -> str:
    total = int(round(minutes)) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _sleep_quality(hours: float) -> str:
    if hours >= 8:
        return "отличный"
    if hours >= 7:
        return "хороший"
    if hours >= 6:
        return "нормальный"
    return "плохой"


@router.get("/sleep", response_model=SleepSummary)
def sleep_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> SleepSummary:
    entries = (
        db.query(DiaryEntry)
        .filter(
            DiaryEntry.user_id == user.id,
            DiaryEntry.sleep_bedtime.isnot(None),
            DiaryEntry.sleep_wakeup.isnot(None),
        )
        .order_by(DiaryEntry.entry_date)
        .all()
    )

    points: list[SleepPoint] = []
    all_hours: list[float] = []
    bed_minutes: list[float] = []
    wake_minutes: list[float] = []
    quality_scores: dict[str, list[float]] = {"отличный": [], "хороший": [], "нормальный": [], "плохой": []}

    for e in entries:
        hours = _sleep_hours(e.sleep_bedtime, e.sleep_wakeup)
        if hours is None or hours <= 0 or hours > 20:
            continue
        all_hours.append(hours)
        bed_m = _parse_time_minutes(e.sleep_bedtime)
        wake_m = _parse_time_minutes(e.sleep_wakeup)
        if bed_m is not None:
            bed_minutes.append(bed_m if bed_m >= 12 * 60 else bed_m + 24 * 60)
        if wake_m is not None:
            wake_minutes.append(wake_m)
        quality = _sleep_quality(hours)
        if e.day_score is not None:
            quality_scores[quality].append(float(e.day_score))
        points.append(SleepPoint(
            entry_date=e.entry_date,
            sleep_hours=hours,
            day_score=float(e.day_score) if e.day_score is not None else None,
        ))

    avg_hours = round(sum(all_hours) / len(all_hours), 2) if all_hours else None
    avg_bed = _minutes_to_hhmm(sum(bed_minutes) / len(bed_minutes)) if bed_minutes else None
    avg_wake = _minutes_to_hhmm(sum(wake_minutes) / len(wake_minutes)) if wake_minutes else None
    score_by_quality = {
        q: round(sum(v) / len(v), 2) if v else None
        for q, v in quality_scores.items()
    }

    return SleepSummary(
        avg_sleep_hours=avg_hours,
        avg_bedtime=avg_bed,
        avg_wakeup=avg_wake,
        days_with_data=len(points),
        score_by_quality=score_by_quality,
        points=points,
    )


def _current_streak(log_dates: set[date]) -> int:
    streak = 0
    cursor = date.today()
    while cursor in log_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


@router.get("/summary", response_model=ReportSummary)
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ReportSummary:
    today = date.today()

    def avg_day_score_since(days: int) -> float | None:
        value = (
            db.query(func.avg(DiaryEntry.day_score))
            .filter(
                DiaryEntry.user_id == user.id,
                DiaryEntry.entry_date >= today - timedelta(days=days),
                DiaryEntry.day_score.isnot(None),
            )
            .scalar()
        )
        return float(value) if value is not None else None

    habits = db.query(Habit).filter(Habit.user_id == user.id, Habit.is_active.is_(True)).all()
    logs_by_habit: dict[int, list[HabitLog]] = defaultdict(list)
    if habits:
        habit_ids = [h.id for h in habits]
        recent_logs = (
            db.query(HabitLog)
            .filter(HabitLog.habit_id.in_(habit_ids), HabitLog.log_date >= today - timedelta(days=30))
            .all()
        )
        for log in recent_logs:
            logs_by_habit[log.habit_id].append(log)

    habit_summaries = []
    for habit in habits:
        logs = logs_by_habit.get(habit.id, [])
        avg_30d = sum(log.score for log in logs) / len(logs) if logs else None
        streak = _current_streak({log.log_date for log in logs})
        habit_summaries.append(
            HabitSummary(
                habit_id=habit.id,
                habit_name=habit.name,
                avg_score_30d=avg_30d,
                current_streak_days=streak,
            )
        )

    return ReportSummary(
        avg_day_score_7d=avg_day_score_since(7),
        avg_day_score_30d=avg_day_score_since(30),
        habits=habit_summaries,
    )
