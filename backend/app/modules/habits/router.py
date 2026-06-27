from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.diary.service import recompute_day_score
from app.modules.habits.models import Habit, HabitLog
from app.modules.habits.schemas import (
    HabitCreate,
    HabitLogOut,
    HabitLogUpsert,
    HabitOut,
    HabitUpdate,
)

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _get_owned_habit(db: Session, user: User, habit_id: int) -> Habit:
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == user.id).first()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return habit


@router.get("", response_model=list[HabitOut])
def list_habits(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Habit]:
    query = db.query(Habit).filter(Habit.user_id == user.id)
    if not include_inactive:
        query = query.filter(Habit.is_active.is_(True))
    return query.order_by(Habit.created_at).all()


@router.post("", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_habit(
    payload: HabitCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Habit:
    habit = Habit(user_id=user.id, **payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.get("/catalog", response_model=list[HabitOut])
def list_catalog_habits(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Habit]:
    return db.query(Habit).filter(Habit.is_base.is_(True)).order_by(Habit.created_at).all()


@router.post("/{habit_id}/adopt", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def adopt_habit(
    habit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Habit:
    template = db.query(Habit).filter(Habit.id == habit_id, Habit.is_base.is_(True)).first()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog habit not found")
    habit = Habit(
        user_id=user.id,
        name=template.name,
        description=template.description,
        frequency=template.frequency,
        schedule_detail=template.schedule_detail,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.patch("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: int,
    payload: HabitUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Habit:
    habit = _get_owned_habit(db, user, habit_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_habit(
    habit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    habit = _get_owned_habit(db, user, habit_id)
    db.delete(habit)
    db.commit()


@router.put("/{habit_id}/logs", response_model=HabitLogOut)
def upsert_log(
    habit_id: int,
    payload: HabitLogUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HabitLog:
    _get_owned_habit(db, user, habit_id)
    log = (
        db.query(HabitLog)
        .filter(HabitLog.habit_id == habit_id, HabitLog.log_date == payload.log_date)
        .first()
    )
    if log is None:
        log = HabitLog(habit_id=habit_id, log_date=payload.log_date, score=payload.score, note=payload.note)
        db.add(log)
    else:
        log.score = payload.score
        log.note = payload.note
    db.commit()
    db.refresh(log)

    recompute_day_score(db, user.id, payload.log_date)
    return log


@router.get("/{habit_id}/logs", response_model=list[HabitLogOut])
def list_logs(
    habit_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HabitLog]:
    _get_owned_habit(db, user, habit_id)
    query = db.query(HabitLog).filter(HabitLog.habit_id == habit_id)
    if date_from:
        query = query.filter(HabitLog.log_date >= date_from)
    if date_to:
        query = query.filter(HabitLog.log_date <= date_to)
    return query.order_by(HabitLog.log_date).all()


@router.delete("/{habit_id}/logs/{log_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    habit_id: int,
    log_date: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _get_owned_habit(db, user, habit_id)
    log = (
        db.query(HabitLog)
        .filter(HabitLog.habit_id == habit_id, HabitLog.log_date == log_date)
        .first()
    )
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    db.delete(log)
    db.commit()
    recompute_day_score(db, user.id, log.log_date)
