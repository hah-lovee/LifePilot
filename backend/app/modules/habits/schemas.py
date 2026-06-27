from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.habits.models import HabitFrequency


class HabitCreate(BaseModel):
    name: str
    description: str | None = None
    frequency: HabitFrequency = HabitFrequency.DAILY
    schedule_detail: int | None = None


class HabitUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    frequency: HabitFrequency | None = None
    schedule_detail: int | None = None
    is_active: bool | None = None


class HabitOut(BaseModel):
    id: int
    name: str
    description: str | None
    frequency: HabitFrequency
    schedule_detail: int | None
    is_active: bool
    is_base: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class HabitLogUpsert(BaseModel):
    log_date: date
    score: int = Field(ge=0, le=10)
    note: str | None = None


class HabitLogOut(BaseModel):
    id: int
    habit_id: int
    log_date: date
    score: int
    note: str | None

    model_config = {"from_attributes": True}
