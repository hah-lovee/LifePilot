from datetime import datetime

from pydantic import BaseModel

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
