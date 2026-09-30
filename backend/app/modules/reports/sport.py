"""The sport report.

Everything here is derived from exercise_logs, which record a date, a weight and
a repetition count — no clock time, no perceived effort, no heart rate. That
shapes what can honestly be said: recovery is counted in whole days, not hours,
and load is counted in sets first and tonnage second, because a pull-up has no
weight and would otherwise vanish from every total.
"""

import math
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta
from statistics import median

from sqlalchemy.orm import Session

from app.models.user import User
from app.modules.reports.schemas import (
    ExerciseProgress,
    GroupLoad,
    MuscleReadiness,
    SportFrequency,
    SportReport,
    WeeklyLoad,
)
from app.modules.sport.models import Exercise, ExerciseLog, MuscleGroup

# A session noticeably heavier than usual for that muscle group needs longer to
# recover from, a light one less. The thresholds are deliberately wide: with
# sets as the only measure of effort, small differences mean nothing.
HEAVY_SESSION_RATIO = 1.3
LIGHT_SESSION_RATIO = 0.7
HEAVY_SESSION_FACTOR = 1.25
LIGHT_SESSION_FACTOR = 0.75

TREND_WINDOW_DAYS = 56  # eight weeks, compared against the eight before it
STALE_RECORD_DAYS = 56
RECENT_DAYS = 30
WEEKS_SHOWN = 12


def build_report(db: Session, user: User, today: date) -> SportReport:
    rows = (
        db.query(ExerciseLog, Exercise, MuscleGroup)
        .join(Exercise, Exercise.id == ExerciseLog.exercise_id)
        .outerjoin(MuscleGroup, MuscleGroup.id == Exercise.muscle_group_id)
        .filter(ExerciseLog.user_id == user.id)
        .order_by(ExerciseLog.log_date)
        .all()
    )

    entries = [
        _Entry(
            log_date=log.log_date,
            exercise_id=exercise.id,
            exercise_name=exercise.name,
            group=group.name if group else None,
            group_recovery_hours=group.recovery_hours if group else None,
            weight=float(log.weight) if log.weight is not None else None,
            reps=log.reps,
        )
        for log, exercise, group in rows
    ]

    return SportReport(
        readiness=_readiness(entries, today),
        load_30d=_load_by_group(entries, today),
        weekly=_weekly_load(entries, today),
        exercises=_exercise_progress(entries, today),
        frequency=_frequency(entries, today),
    )


class _Entry:
    """One logged set, flattened with the exercise and muscle group it belongs
    to, so the rest of this module never has to touch the ORM."""

    __slots__ = (
        "log_date",
        "exercise_id",
        "exercise_name",
        "group",
        "group_recovery_hours",
        "weight",
        "reps",
    )

    def __init__(
        self,
        log_date: date,
        exercise_id: int,
        exercise_name: str,
        group: str | None,
        group_recovery_hours: int | None,
        weight: float | None,
        reps: int | None,
    ) -> None:
        self.log_date = log_date
        self.exercise_id = exercise_id
        self.exercise_name = exercise_name
        self.group = group
        self.group_recovery_hours = group_recovery_hours
        self.weight = weight
        self.reps = reps

    @property
    def volume(self) -> float:
        if self.weight is None or self.reps is None:
            return 0.0
        return self.weight * self.reps


def _readiness(entries: list[_Entry], today: date) -> list[MuscleReadiness]:
    """How long each muscle group has been resting against how long it is given.

    A caveat worth keeping in mind when reading the result: an exercise carries
    one muscle group, its primary one. A pull-up is counted as back and not at
    all as biceps, so a group can be more tired than this says.
    """
    sets_per_session: dict[str, dict[date, int]] = defaultdict(lambda: defaultdict(int))
    recovery_hours: dict[str, int] = {}
    for entry in entries:
        if entry.group is None:
            continue
        sets_per_session[entry.group][entry.log_date] += 1
        recovery_hours[entry.group] = entry.group_recovery_hours or 48

    result: list[MuscleReadiness] = []
    for group, sessions in sets_per_session.items():
        last_date = max(sessions)
        last_sets = sessions[last_date]
        days_since = (today - last_date).days

        # "Usual" means the last 90 days, so a change in training style shows up
        # within a season rather than being diluted by everything ever logged.
        recent = [count for day, count in sessions.items() if (today - day).days <= 90]
        typical = median(recent) if recent else last_sets
        factor = 1.0
        if typical > 0:
            if last_sets / typical >= HEAVY_SESSION_RATIO:
                factor = HEAVY_SESSION_FACTOR
            elif last_sets / typical <= LIGHT_SESSION_RATIO:
                factor = LIGHT_SESSION_FACTOR

        base_hours = recovery_hours[group]
        adjusted_hours = int(round(base_hours * factor))
        needed_days = adjusted_hours / 24
        readiness_pct = 100 if needed_days <= 0 else min(100, int(days_since / needed_days * 100))
        ready_in_days = max(0, math.ceil(needed_days - days_since))

        result.append(
            MuscleReadiness(
                group=group,
                last_trained=last_date,
                days_since=days_since,
                base_recovery_hours=base_hours,
                recovery_hours=adjusted_hours,
                sets_last_session=last_sets,
                typical_sets=round(typical, 1),
                readiness_pct=readiness_pct,
                ready_in_days=ready_in_days,
            )
        )

    # Least rested first: that is the order in which the answer to "what do I
    # train today" becomes obvious.
    result.sort(key=lambda item: (item.readiness_pct, item.group))
    return result


def _load_by_group(entries: list[_Entry], today: date) -> list[GroupLoad]:
    window_start = today - timedelta(days=RECENT_DAYS)
    sets: dict[str, int] = defaultdict(int)
    volume: dict[str, float] = defaultdict(float)
    days: dict[str, set[date]] = defaultdict(set)

    for entry in entries:
        if entry.log_date < window_start:
            continue
        group = entry.group or "Без группы"
        sets[group] += 1
        volume[group] += entry.volume
        days[group].add(entry.log_date)

    total_sets = sum(sets.values())
    result = [
        GroupLoad(
            group=group,
            sessions=len(days[group]),
            sets=count,
            volume=round(volume[group], 1),
            share_pct=round(count / total_sets * 100, 1) if total_sets else 0.0,
        )
        for group, count in sets.items()
    ]
    result.sort(key=lambda item: item.sets, reverse=True)
    return result


def _weekly_load(entries: list[_Entry], today: date) -> list[WeeklyLoad]:
    first_week = today - timedelta(days=today.weekday()) - timedelta(weeks=WEEKS_SHOWN - 1)
    sets: dict[date, int] = defaultdict(int)
    volume: dict[date, float] = defaultdict(float)
    days: dict[date, set[date]] = defaultdict(set)

    for entry in entries:
        week = entry.log_date - timedelta(days=entry.log_date.weekday())
        if week < first_week:
            continue
        sets[week] += 1
        volume[week] += entry.volume
        days[week].add(entry.log_date)

    # Weeks with no training are part of the picture, so they are emitted as
    # zeroes rather than left out of the chart.
    return [
        WeeklyLoad(
            week_start=week,
            sets=sets.get(week, 0),
            volume=round(volume.get(week, 0.0), 1),
            sessions=len(days.get(week, ())),
        )
        for week in (first_week + timedelta(weeks=offset) for offset in range(WEEKS_SHOWN))
    ]


def _exercise_progress(entries: list[_Entry], today: date) -> list[ExerciseProgress]:
    by_exercise: dict[int, list[_Entry]] = defaultdict(list)
    for entry in entries:
        by_exercise[entry.exercise_id].append(entry)

    recent_start = today - timedelta(days=TREND_WINDOW_DAYS)
    previous_start = today - timedelta(days=TREND_WINDOW_DAYS * 2)

    result: list[ExerciseProgress] = []
    for exercise_id, logs in by_exercise.items():
        weighted = [entry for entry in logs if entry.weight is not None]
        best = max(weighted, key=lambda entry: (entry.weight or 0, entry.log_date), default=None)
        recent_best = _max_weight(entry for entry in weighted if entry.log_date >= recent_start)
        previous_best = _max_weight(
            entry for entry in weighted if previous_start <= entry.log_date < recent_start
        )
        last_done = max(entry.log_date for entry in logs)
        record_age = (today - best.log_date).days if best else None

        result.append(
            ExerciseProgress(
                exercise_id=exercise_id,
                name=logs[0].exercise_name,
                muscle_group=logs[0].group,
                best_weight=best.weight if best else None,
                best_weight_date=best.log_date if best else None,
                recent_best=recent_best,
                previous_best=previous_best,
                delta=(
                    round(recent_best - previous_best, 1)
                    if recent_best is not None and previous_best is not None
                    else None
                ),
                last_done=last_done,
                sessions=len({entry.log_date for entry in logs}),
                sets=len(logs),
                # Still being trained, but the record has not moved in two
                # months — the row worth looking at.
                stale=(
                    record_age is not None
                    and record_age > STALE_RECORD_DAYS
                    and (today - last_done).days <= RECENT_DAYS
                ),
            )
        )

    result.sort(key=lambda item: item.last_done, reverse=True)
    return result


def _max_weight(entries: Iterable[_Entry]) -> float | None:
    weights = [entry.weight for entry in entries if entry.weight is not None]
    return max(weights) if weights else None


def _frequency(entries: list[_Entry], today: date) -> SportFrequency:
    workout_days = sorted({entry.log_date for entry in entries})
    if not workout_days:
        return SportFrequency(
            sessions_30d=0, sessions_per_week=0.0, longest_gap_days=None, days_since_last=None
        )

    recent_days = [day for day in workout_days if (today - day).days <= RECENT_DAYS]
    window_days = [day for day in workout_days if (today - day).days <= TREND_WINDOW_DAYS]
    gaps = [
        (later - earlier).days
        for earlier, later in zip(workout_days, workout_days[1:])
        if (today - later).days <= 180
    ]

    return SportFrequency(
        sessions_30d=len(recent_days),
        sessions_per_week=round(len(window_days) / (TREND_WINDOW_DAYS / 7), 1),
        longest_gap_days=max(gaps) if gaps else None,
        days_since_last=(today - workout_days[-1]).days,
    )
