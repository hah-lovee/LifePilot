import logging

from app.core.db import SessionLocal
from app.models.user import User
from app.modules.telegram import client

logger = logging.getLogger(__name__)

# In-memory offset — fine for a single-process backend: on restart Telegram
# simply redelivers any still-unconfirmed updates, and processing below is
# idempotent (a /start code that no longer matches any user is just ignored),
# so there's no need to persist this anywhere.
_last_update_id: int | None = None


def poll_updates() -> None:
    global _last_update_id
    offset = _last_update_id + 1 if _last_update_id is not None else None
    updates = client.get_updates(offset)
    if not updates:
        return

    db = SessionLocal()
    try:
        for update in updates:
            _last_update_id = update["update_id"]
            message = update.get("message")
            if not message:
                continue
            chat_id = message.get("chat", {}).get("id")
            text = (message.get("text") or "").strip()
            if chat_id is None or not text.startswith("/start"):
                continue

            parts = text.split(maxsplit=1)
            code = parts[1].strip() if len(parts) > 1 else None
            if not code:
                client.send_message(
                    str(chat_id), "Привет! Открой Life Pilot → Настройки, чтобы получить код привязки."
                )
                continue

            user = db.query(User).filter(User.telegram_link_code == code).first()
            if user is None:
                client.send_message(
                    str(chat_id), "Код не найден или уже использован — сгенерируй новый в Настройках."
                )
                continue

            user.telegram_chat_id = str(chat_id)
            user.telegram_link_code = None
            db.commit()
            client.send_message(str(chat_id), f"Готово! Telegram привязан к аккаунту «{user.name}».")
    except Exception:
        logger.exception("Telegram update polling failed")
    finally:
        db.close()
