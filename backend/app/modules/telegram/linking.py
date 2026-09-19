import logging

from sqlalchemy.orm import Session

from app.models.user import User

logger = logging.getLogger(__name__)


def link_chat(db: Session, chat_id: str, code: str) -> User | None:
    """Consume a one-time link code issued by POST /api/telegram/link and bind
    the Telegram chat to its owner. Returns None when the code is unknown or
    already spent.

    This used to run inside the backend's own getUpdates poller; the poller is
    gone (voice-bot is the single consumer of the bot's update stream — two
    getUpdates callers on one token steal each other's updates), so the bot now
    forwards /start payloads here instead. Idempotent by construction: the code
    is cleared on success, so a redelivered update simply finds nothing.
    """
    user = db.query(User).filter(User.telegram_link_code == code).first()
    if user is None:
        return None

    user.telegram_chat_id = chat_id
    user.telegram_link_code = None
    db.commit()
    logger.info("Telegram chat linked to user_id=%s", user.id)
    return user
