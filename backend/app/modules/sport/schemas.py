from datetime import date, datetime

from pydantic import BaseModel, Field


class MuscleGroupOut(BaseModel):
    id: int
    name: str

    model_config = {"from_attributes": True}


class ExerciseOut(BaseModel):
    id: int
    name: str
    description: str | None
    muscle_group: str | None
    photo_url: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExerciseLogCreate(BaseModel):
    exercise_id: int
    log_date: date
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)


class ExerciseLogUpdate(BaseModel):
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)


class ExerciseLogOut(BaseModel):
    id: int
    exercise_id: int
    log_date: date
    weight: float | None
    reps: int | None

    model_config = {"from_attributes": True}
