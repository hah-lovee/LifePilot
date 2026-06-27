from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import require_admin
from app.core.uploads import delete_exercise_photo, save_exercise_photo
from app.models.user import User
from app.modules.admin.schemas import (
    CatalogHabitCreate,
    ExerciseAdminUpdate,
    MuscleGroupCreate,
    RegistrationCodeOut,
    RegistrationCodeUpdate,
    UserAdminOut,
    UserAdminUpdate,
)
from app.modules.admin.service import REGISTRATION_CODE_KEY, get_setting, set_setting
from app.core.config import settings as app_config
from app.modules.habits.models import Habit
from app.modules.habits.schemas import HabitOut
from app.modules.sport.models import Exercise, MuscleGroup
from app.modules.sport.schemas import ExerciseOut, MuscleGroupOut

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _delete_photo_if_unused(db: Session, photo_url: str | None) -> None:
    """Only remove the file from disk if no other exercise row still points at
    it — old data from a since-removed "copy exercise" feature could leave
    several rows sharing one photo_url, and deleting it out from under them
    broke their photo too."""
    if not photo_url:
        return
    if db.query(Exercise).filter(Exercise.photo_url == photo_url).first() is not None:
        return
    delete_exercise_photo(photo_url)


@router.get("/users", response_model=list[UserAdminOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return db.query(User).order_by(User.created_at).all()


@router.patch("/users/{user_id}", response_model=UserAdminOut)
def update_user_admin_flag(
    user_id: int, payload: UserAdminUpdate, db: Session = Depends(get_db)
) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_admin = payload.is_admin
    db.commit()
    db.refresh(user)
    return user


@router.get("/registration-code", response_model=RegistrationCodeOut)
def get_registration_code(db: Session = Depends(get_db)) -> RegistrationCodeOut:
    code = get_setting(db, REGISTRATION_CODE_KEY) or app_config.registration_code
    return RegistrationCodeOut(registration_code=code)


@router.put("/registration-code", response_model=RegistrationCodeOut)
def set_registration_code(
    payload: RegistrationCodeUpdate, db: Session = Depends(get_db)
) -> RegistrationCodeOut:
    set_setting(db, REGISTRATION_CODE_KEY, payload.registration_code)
    return RegistrationCodeOut(registration_code=payload.registration_code)


@router.post("/habits", response_model=HabitOut, status_code=status.HTTP_201_CREATED)
def create_catalog_habit(payload: CatalogHabitCreate, db: Session = Depends(get_db)) -> Habit:
    habit = Habit(user_id=None, is_base=True, is_active=True, **payload.model_dump())
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.get("/muscle-groups", response_model=list[MuscleGroupOut])
def list_muscle_groups(db: Session = Depends(get_db)) -> list[MuscleGroup]:
    return db.query(MuscleGroup).order_by(MuscleGroup.name).all()


@router.post("/muscle-groups", response_model=MuscleGroupOut, status_code=status.HTTP_201_CREATED)
def create_muscle_group(payload: MuscleGroupCreate, db: Session = Depends(get_db)) -> MuscleGroup:
    name = payload.name.strip()
    existing = db.query(MuscleGroup).filter(MuscleGroup.name == name).first()
    if existing is not None:
        return existing
    group = MuscleGroup(name=name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return group


@router.post("/exercises", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
async def create_catalog_exercise(
    name: str = Form(...),
    description: str | None = Form(None),
    muscle_group_id: int | None = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
) -> Exercise:
    photo_url = await save_exercise_photo(photo) if photo and photo.filename else None
    exercise = Exercise(
        name=name, description=description, muscle_group_id=muscle_group_id, photo_url=photo_url
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.patch("/exercises/{exercise_id}", response_model=ExerciseOut)
def update_catalog_exercise(
    exercise_id: int, payload: ExerciseAdminUpdate, db: Session = Depends(get_db)
) -> Exercise:
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(exercise, field, value)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.patch("/exercises/{exercise_id}/photo", response_model=ExerciseOut)
async def replace_exercise_photo(
    exercise_id: int, photo: UploadFile = File(...), db: Session = Depends(get_db)
) -> Exercise:
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    old_photo_url = exercise.photo_url
    exercise.photo_url = await save_exercise_photo(photo)
    db.commit()
    db.refresh(exercise)
    if old_photo_url and old_photo_url != exercise.photo_url:
        _delete_photo_if_unused(db, old_photo_url)
    return exercise


@router.delete("/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog_habit(habit_id: int, db: Session = Depends(get_db)) -> None:
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.is_base.is_(True)).first()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog habit not found")
    db.delete(habit)
    db.commit()


@router.delete("/exercises/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog_exercise(exercise_id: int, db: Session = Depends(get_db)) -> None:
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
    if exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog exercise not found")
    photo_url = exercise.photo_url
    db.delete(exercise)
    db.commit()
    _delete_photo_if_unused(db, photo_url)
