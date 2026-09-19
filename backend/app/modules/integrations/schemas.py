from datetime import date, datetime

from pydantic import BaseModel, Field

from app.modules.diary.schemas import DiaryEntryOut


class DiaryContextOut(BaseModel):
    """Everything the bot needs to build its LLM prompt and pick a date, so it
    never has to guess the owner's timezone or invent tag names."""

    user_name: str
    timezone: str
    local_now: datetime  # current time in the user's own tz, not UTC
    local_date: date
    tags: list[str]  # the user's existing vocabulary; the bot must pick from it
    today_entry: DiaryEntryOut | None


class DiaryReportIn(BaseModel):
    telegram_chat_id: str
    # Which day this report belongs to. The bot decides (it applies a
    # late-night rollover so a 00:30 report still lands on the day that just
    # ended); when omitted we fall back to "today" in the user's timezone.
    entry_date: date | None = None
    content: str | None = None
    # Appended to whatever is already stored for that date rather than
    # replacing it, so a second report of the day — or anything typed in the
    # web UI earlier — is never silently destroyed.
    append_content: bool = True
    tags: list[str] = []
    sleep_bedtime: str | None = None  # "HH:MM"
    sleep_wakeup: str | None = None   # "HH:MM"
    energy: int | None = Field(None, ge=1, le=10)
    mood: int | None = Field(None, ge=1, le=10)
    body_condition: int | None = Field(None, ge=1, le=10)


class DiaryReportOut(BaseModel):
    entry: DiaryEntryOut
    created: bool  # False when an existing entry for that date was updated
    applied_tags: list[str]
    rejected_tags: list[str]  # names the LLM produced that aren't in the vocabulary


class TelegramLinkIn(BaseModel):
    chat_id: str
    code: str


class TelegramLinkOut(BaseModel):
    linked: bool
    user_name: str | None = None
