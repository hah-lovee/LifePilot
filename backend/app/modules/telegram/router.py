import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.telegram.schemas import TelegramLinkOut, TelegramStatusOut

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.get("/status", response_model=TelegramStatusOut)
def status_(user: User = Depends(get_current_user)) -> TelegramStatusOut:
    return TelegramStatusOut(linked=user.telegram_chat_id is not None)


@router.post("/link", response_model=TelegramLinkOut)
def start_link(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TelegramLinkOut:
    if user.telegram_chat_id is not None:
        return TelegramLinkOut(linked=True)

    code = secrets.token_urlsafe(6)
    user.telegram_link_code = code
    db.commit()

    deep_link = f"https://t.me/{settings.telegram_bot_username}?start={code}" if settings.telegram_bot_username else None
    return TelegramLinkOut(linked=False, link_code=code, deep_link=deep_link)


@router.delete("/link", response_model=TelegramStatusOut)
def unlink(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TelegramStatusOut:
    user.telegram_chat_id = None
    user.telegram_link_code = None
    db.commit()
    return TelegramStatusOut(linked=False)
