from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.sport.models import Exercise, ExerciseLog, ExercisePhoto
from app.modules.sport.schemas import ExerciseLogCreate, ExerciseLogOut, ExerciseLogUpdate, ExerciseOut

router = APIRouter(tags=["sport"])


def _get_owned_log(db: Session, user: User, log_id: int) -> ExerciseLog:
    log = db.query(ExerciseLog).filter(ExerciseLog.id == log_id, ExerciseLog.user_id == user.id).first()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    return log


@router.get("/api/exercises", response_model=list[ExerciseOut])
def list_exercises(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Exercise]:
    return db.query(Exercise).order_by(Exercise.name).all()


@router.get("/api/exercises/{exercise_id}/photo")
def get_exercise_photo(exercise_id: int, v: str | None = None, db: Session = Depends(get_db)) -> Response:
    """Serves the photo bytes stored in the database.

    Deliberately the one endpoint without get_current_user: an <img> tag cannot
    send the bearer token, and the catalog is shared pictures of gym equipment,
    not personal data. Nothing about a user is reachable through it."""
    photo = db.get(ExercisePhoto, exercise_id)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    # A request carrying the right digest can be cached forever, because a
    # replaced photo gets a new digest and therefore a new URL. A bare request
    # (an old link, a hand-typed one) has to revalidate instead.
    fresh = v is not None and photo.sha256.startswith(v)
    return Response(
        content=photo.content,
        media_type=photo.content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable" if fresh else "no-cache",
            "ETag": f'"{photo.sha256}"',
        },
    )


@router.get("/api/exercises/{exercise_id}", response_model=ExerciseOut)
def get_exercise(
    exercise_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Exercise:
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise


@router.get("/api/exercise-logs", response_model=list[ExerciseLogOut])
def list_logs(
    log_date: date | None = None,
    exercise_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ExerciseLog]:
    query = db.query(ExerciseLog).filter(ExerciseLog.user_id == user.id)
    if log_date:
        query = query.filter(ExerciseLog.log_date == log_date)
    if exercise_id:
        query = query.filter(ExerciseLog.exercise_id == exercise_id)
    if date_from:
        query = query.filter(ExerciseLog.log_date >= date_from)
    if date_to:
        query = query.filter(ExerciseLog.log_date <= date_to)
    return query.order_by(ExerciseLog.log_date, ExerciseLog.id).all()


@router.get("/api/exercise-logs/days", response_model=list[date])
def list_workout_days(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[date]:
    query = db.query(ExerciseLog.log_date).filter(ExerciseLog.user_id == user.id).distinct()
    if date_from:
        query = query.filter(ExerciseLog.log_date >= date_from)
    if date_to:
        query = query.filter(ExerciseLog.log_date <= date_to)
    return [row[0] for row in query.order_by(ExerciseLog.log_date).all()]


@router.post("/api/exercise-logs", response_model=ExerciseLogOut, status_code=status.HTTP_201_CREATED)
def create_log(
    payload: ExerciseLogCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ExerciseLog:
    exercise = db.query(Exercise).filter(Exercise.id == payload.exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    log = ExerciseLog(user_id=user.id, **payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.patch("/api/exercise-logs/{log_id}", response_model=ExerciseLogOut)
def update_log(
    log_id: int,
    payload: ExerciseLogUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExerciseLog:
    log = _get_owned_log(db, user, log_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/api/exercise-logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(log_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    log = _get_owned_log(db, user, log_id)
    db.delete(log)
    db.commit()
