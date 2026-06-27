from datetime import date, datetime

from pydantic import BaseModel, Field


class ExerciseOut(BaseModel):
    id: int
    name: str
    description: str | None
    muscle_group: str | None
    photo_url: str | None
    is_base: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ExerciseUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    muscle_group: str | None = None


class ExerciseLogCreate(BaseModel):
    log_date: date
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    sets: int = Field(default=1, ge=1)
    note: str | None = None


class ExerciseLogOut(BaseModel):
    id: int
    exercise_id: int
    log_date: date
    weight: float | None
    reps: int | None
    sets: int
    note: str | None

    model_config = {"from_attributes": True}
