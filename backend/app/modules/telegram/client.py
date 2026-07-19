import logging

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


def _api_url(method: str) -> str:
    return f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}"


def send_message(chat_id: str, text: str) -> None:
    if not settings.telegram_bot_token:
        return
    try:
        resp = requests.post(_api_url("sendMessage"), json={"chat_id": chat_id, "text": text}, timeout=10)
        if not resp.ok:
            logger.warning("Telegram sendMessage failed for chat_id=%s: %s", chat_id, resp.text)
    except requests.exceptions.RequestException:
        logger.exception("Telegram sendMessage request failed for chat_id=%s", chat_id)


def get_updates(offset: int | None, timeout: int = 0) -> list[dict]:
    """Long-poll-friendly getUpdates. offset = last processed update_id + 1."""
    if not settings.telegram_bot_token:
        return []
    params: dict = {"timeout": timeout}
    if offset is not None:
        params["offset"] = offset
    try:
        resp = requests.get(_api_url("getUpdates"), params=params, timeout=timeout + 10)
        resp.raise_for_status()
        return resp.json().get("result", [])
    except requests.exceptions.RequestException:
        logger.exception("Telegram getUpdates request failed")
        return []
