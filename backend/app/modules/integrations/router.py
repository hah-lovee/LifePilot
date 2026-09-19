import logging
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import User
from app.modules.diary.models import DiaryEntry, DiaryTag
from app.modules.integrations.deps import require_integration_key
from app.modules.integrations.schemas import (
    DiaryContextOut,
    DiaryReportIn,
    DiaryReportOut,
    TelegramLinkIn,
    TelegramLinkOut,
)
from app.modules.telegram.linking import link_chat

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_integration_key)],
)


def _user_by_chat(db: Session, telegram_chat_id: str) -> User:
    user = db.query(User).filter(User.telegram_chat_id == telegram_chat_id).first()
    if user is None:
        # Second gate behind the bot's own ALLOWED_TELEGRAM_ID check: even a
        # caller holding the API key can only write to a chat the owner
        # deliberately linked, and unlinking in the UI revokes it instantly.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Life Pilot account is linked to this Telegram chat",
        )
    return user


def _local_now(user: User) -> datetime:
    """Containers run in UTC while entry_date means a day in the owner's own
    wall-clock time, so every date decision goes through their timezone."""
    try:
        return datetime.now(ZoneInfo(user.timezone))
    except (ZoneInfoNotFoundError, ValueError):
        logger.warning("Invalid timezone %r for user_id=%s, falling back to UTC", user.timezone, user.id)
        return datetime.now(ZoneInfo("UTC"))


@router.get("/diary/context", response_model=DiaryContextOut)
def diary_context(
    telegram_chat_id: str, db: Session = Depends(get_db)
) -> DiaryContextOut:
    user = _user_by_chat(db, telegram_chat_id)
    now = _local_now(user)
    tags = [t.name for t in db.query(DiaryTag).filter(DiaryTag.user_id == user.id).order_by(DiaryTag.name)]
    today_entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == now.date())
        .first()
    )
    return DiaryContextOut(
        user_name=user.name,
        timezone=user.timezone,
        local_now=now,
        local_date=now.date(),
        tags=tags,
        today_entry=today_entry,
    )


@router.post("/diary", response_model=DiaryReportOut)
def upsert_diary_report(payload: DiaryReportIn, db: Session = Depends(get_db)) -> DiaryReportOut:
    user = _user_by_chat(db, payload.telegram_chat_id)
    now = _local_now(user)
    entry_date = payload.entry_date or now.date()

    entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == entry_date)
        .first()
    )
    created = entry is None
    if entry is None:
        entry = DiaryEntry(user_id=user.id, entry_date=entry_date)
        db.add(entry)

    if payload.content:
        new_text = payload.content.strip()
        if payload.append_content and entry.content:
            # Time-stamped separator so a day assembled from several dictations
            # still reads as a sequence rather than one run-on paragraph.
            entry.content = f"{entry.content.rstrip()}\n\n— {now:%H:%M} —\n{new_text}"
        else:
            entry.content = new_text

    for field in ("sleep_bedtime", "sleep_wakeup", "energy", "mood", "body_condition"):
        value = getattr(payload, field)
        # None means "the speaker didn't mention it" — leave whatever is stored
        # (possibly entered by hand in the web UI) rather than nulling it out.
        if value is not None:
            setattr(entry, field, value)

    # Unlike PUT /api/diary, unknown names are dropped instead of being created:
    # the model picks tags from a list we hand it, and a hallucinated one would
    # otherwise permanently pollute the tag picker.
    applied_tags: list[str] = []
    rejected_tags: list[str] = []
    if payload.tags:
        vocabulary = {t.name for t in db.query(DiaryTag).filter(DiaryTag.user_id == user.id)}
        existing = set(entry.tags or [])
        for name in payload.tags:
            normalized = name.strip().lower()
            if normalized not in vocabulary:
                rejected_tags.append(name)
            elif normalized not in existing:
                applied_tags.append(normalized)
                existing.add(normalized)
        if applied_tags:
            entry.tags = sorted(existing)

    db.commit()
    db.refresh(entry)
    if rejected_tags:
        logger.info("Dropped unknown tags %s for user_id=%s", rejected_tags, user.id)

    return DiaryReportOut(
        entry=entry, created=created, applied_tags=applied_tags, rejected_tags=rejected_tags
    )


@router.post("/telegram/link", response_model=TelegramLinkOut)
def telegram_link(payload: TelegramLinkIn, db: Session = Depends(get_db)) -> TelegramLinkOut:
    """Forwarded by the bot when it sees "/start <code>"."""
    user = link_chat(db, payload.chat_id, payload.code)
    if user is None:
        return TelegramLinkOut(linked=False)
    return TelegramLinkOut(linked=True, user_name=user.name)
