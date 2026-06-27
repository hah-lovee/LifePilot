from datetime import date, datetime

from pydantic import BaseModel


class DiaryEntryUpsert(BaseModel):
    entry_date: date
    content: str | None = None
    tags: list[str] = []


class DiaryEntryOut(BaseModel):
    id: int
    entry_date: date
    content: str | None
    tags: list[str]
    day_score: float | None
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
