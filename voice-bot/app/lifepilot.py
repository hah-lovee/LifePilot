"""Life Pilot integration client — POST /api/integrations/* with a shared key.

Auth note: the bot holds no password and no JWT. It presents INTEGRATION_API_KEY
and a telegram_chat_id; the backend resolves that chat to its owner through
users.telegram_chat_id, which the owner populated themselves via the existing
/start <code> linking flow. Revoking access is the "unlink" button in Settings.
"""
import logging

import httpx

from app import config

logger = logging.getLogger(__name__)


class LifePilotError(RuntimeError):
    pass


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=config.LIFEPILOT_API_URL,
        headers={"X-API-Key": config.INTEGRATION_API_KEY},
        timeout=config.LIFEPILOT_TIMEOUT,
    )


async def _request(method: str, path: str, **kwargs) -> dict:
    try:
        async with _client() as client:
            resp = await client.request(method, path, **kwargs)
    except httpx.RequestError as exc:
        raise LifePilotError(f"Life Pilot недоступен: {exc}") from exc

    if resp.is_success:
        return resp.json()

    detail = resp.text
    try:
        detail = resp.json().get("detail", detail)
    except ValueError:
        pass
    raise LifePilotError(f"Life Pilot ответил {resp.status_code}: {detail}")


async def diary_context(chat_id: str) -> dict:
    """Owner's timezone, tag vocabulary and today's entry — everything needed
    to build the prompt and pick the right date without guessing."""
    return await _request("GET", "/api/integrations/diary/context", params={"telegram_chat_id": chat_id})


async def save_report(chat_id: str, entry_date: str, parsed: dict) -> dict:
    return await _request(
        "POST",
        "/api/integrations/diary",
        json={
            "telegram_chat_id": chat_id,
            "entry_date": entry_date,
            "content": parsed["summary"],
            "append_content": True,
            "tags": parsed["tags"],
            "mood": parsed["mood"],
            "energy": parsed["energy"],
            "body_condition": parsed["body_condition"],
            "sleep_bedtime": parsed["sleep_bedtime"],
            "sleep_wakeup": parsed["sleep_wakeup"],
        },
    )


async def link_chat(chat_id: str, code: str) -> dict:
    """Forwards "/start <code>". The backend used to read these updates itself;
    it can't any more, because this process is now the only getUpdates caller."""
    return await _request(
        "POST", "/api/integrations/telegram/link", json={"chat_id": chat_id, "code": code}
    )
