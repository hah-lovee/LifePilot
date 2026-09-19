from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_integration_key(x_api_key: str = Header(...)) -> None:
    """Shared-secret auth for machine callers (currently only voice-bot).

    Deliberately not JWT: the bot is a long-lived daemon, and every JWT this
    app issues carries a 7-day exp (app/core/security.py), so a token-based
    bot would need the owner's password on hand to re-login. A single key it
    can present forever, revoked by rotating one .env line, is both simpler
    and less material to leak. The key never identifies *which* user is being
    written to — that comes from telegram_chat_id, which the owner linked
    themselves via the /start flow.
    """
    if not settings.integration_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Integration API is not configured (INTEGRATION_API_KEY is empty)",
        )
    if x_api_key != settings.integration_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
