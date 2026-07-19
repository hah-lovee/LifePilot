from datetime import date, datetime

from pydantic import BaseModel, Field


class DiaryEntryUpsert(BaseModel):
    entry_date: date
    content: str | None = None
    tags: list[str] = []
    sleep_bedtime: str | None = None  # "HH:MM"
    sleep_wakeup: str | None = None   # "HH:MM"
    energy: int | None = Field(None, ge=1, le=10)
    mood: int | None = Field(None, ge=1, le=10)
    body_condition: int | None = Field(None, ge=1, le=10)


class DiaryEntryOut(BaseModel):
    id: int
    entry_date: date
    content: str | None
    tags: list[str]
    day_score: float | None
    sleep_bedtime: str | None
    sleep_wakeup: str | None
    energy: int | None
    mood: int | None
    body_condition: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiaryTagCreate(BaseModel):
    name: str


class DiaryTagOut(BaseModel):
    id: int
    name: str
    is_base: bool

    model_config = {"from_attributes": True}
