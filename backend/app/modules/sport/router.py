from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.uploads import save_exercise_photo
from app.models.user import User
from app.modules.sport.models import Exercise, ExerciseLog
from app.modules.sport.schemas import ExerciseLogCreate, ExerciseLogOut, ExerciseOut, ExerciseUpdate

router = APIRouter(prefix="/api/exercises", tags=["sport"])


def _get_owned_exercise(db: Session, user: User, exercise_id: int) -> Exercise:
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id, Exercise.user_id == user.id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    return exercise


@router.get("", response_model=list[ExerciseOut])
def list_exercises(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Exercise]:
    return db.query(Exercise).filter(Exercise.user_id == user.id).order_by(Exercise.created_at).all()


@router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    name: str = Form(...),
    description: str | None = Form(None),
    muscle_group: str | None = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exercise:
    photo_url = await save_exercise_photo(photo) if photo and photo.filename else None
    exercise = Exercise(
        user_id=user.id, name=name, description=description, muscle_group=muscle_group, photo_url=photo_url
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.patch("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int,
    payload: ExerciseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Exercise:
    exercise = _get_owned_exercise(db, user, exercise_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(
    exercise_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    exercise = _get_owned_exercise(db, user, exercise_id)
    db.delete(exercise)
    db.commit()


@router.get("/catalog", response_model=list[ExerciseOut])
def list_catalog_exercises(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Exercise]:
    return db.query(Exercise).filter(Exercise.is_base.is_(True)).order_by(Exercise.created_at).all()


@router.post("/{exercise_id}/adopt", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def adopt_exercise(
    exercise_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Exercise:
    template = db.query(Exercise).filter(Exercise.id == exercise_id, Exercise.is_base.is_(True)).first()
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog exercise not found")
    exercise = Exercise(
        user_id=user.id,
        name=template.name,
        description=template.description,
        muscle_group=template.muscle_group,
        photo_url=template.photo_url,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.post("/{exercise_id}/logs", response_model=ExerciseLogOut, status_code=status.HTTP_201_CREATED)
def create_log(
    exercise_id: int,
    payload: ExerciseLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ExerciseLog:
    _get_owned_exercise(db, user, exercise_id)
    log = ExerciseLog(exercise_id=exercise_id, **payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/{exercise_id}/logs", response_model=list[ExerciseLogOut])
def list_logs(
    exercise_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ExerciseLog]:
    _get_owned_exercise(db, user, exercise_id)
    query = db.query(ExerciseLog).filter(ExerciseLog.exercise_id == exercise_id)
    if date_from:
        query = query.filter(ExerciseLog.log_date >= date_from)
    if date_to:
        query = query.filter(ExerciseLog.log_date <= date_to)
    return query.order_by(ExerciseLog.log_date, ExerciseLog.id).all()


@router.delete("/{exercise_id}/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_log(
    exercise_id: int,
    log_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    _get_owned_exercise(db, user, exercise_id)
    log = db.query(ExerciseLog).filter(ExerciseLog.id == log_id, ExerciseLog.exercise_id == exercise_id).first()
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Log not found")
    db.delete(log)
    db.commit()
