from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.habits.models import HabitFrequency


class UserAdminOut(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    created_at: datetime
    last_login_at: datetime | None

    model_config = {"from_attributes": True}


class UserAdminUpdate(BaseModel):
    is_admin: bool


class RegistrationCodeOut(BaseModel):
    registration_code: str


class RegistrationCodeUpdate(BaseModel):
    registration_code: str


class CatalogHabitCreate(BaseModel):
    name: str
    description: str | None = None
    frequency: HabitFrequency = HabitFrequency.DAILY


class MuscleGroupCreate(BaseModel):
    name: str
    recovery_hours: int = Field(default=48, ge=8, le=336)


class MuscleGroupUpdate(BaseModel):
    recovery_hours: int = Field(ge=8, le=336)


class ExerciseAdminUpdate(BaseModel):
    name: str | None = None
    muscle_group_id: int | None = None
