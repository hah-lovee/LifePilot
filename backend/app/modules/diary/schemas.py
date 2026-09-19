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


class VoiceTranscriptionOut(BaseModel):
    """What a recording turned into. Every diary field is optional: the model is
    told to return null for anything the speaker didn't mention, and the client
    leaves those fields alone rather than clearing them."""

    text: str | None = None
    tags: list[str] = []
    sleep_bedtime: str | None = None  # "HH:MM"
    sleep_wakeup: str | None = None   # "HH:MM"
    energy: int | None = Field(None, ge=1, le=10)
    mood: int | None = Field(None, ge=1, le=10)
    body_condition: int | None = Field(None, ge=1, le=10)
    # The raw recognised speech, shown so the user can see what was actually
    # heard when the parse looks wrong.
    transcript: str
    # True when the model produced no summary and `text` is the unedited
    # transcript — worth telling the user, since it reads noticeably rougher.
    used_raw_transcript: bool = False
