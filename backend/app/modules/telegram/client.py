import logging
import socket

import requests
import urllib3.util.connection as urllib3_cn

from app.core.config import settings

logger = logging.getLogger(__name__)

# This container's IPv6 route is advertised but doesn't actually deliver
# packets (confirmed: connect() to a known-reachable IPv6 host fails with
# "Network is unreachable"), while IPv4 works fine. api.telegram.org resolves
# to both families, and urllib3 doesn't reliably fall back to IPv4 after an
# immediate IPv6 connect failure, so force IPv4 for all outbound requests in
# this process rather than resolving/connecting via the broken IPv6 route.
urllib3_cn.allowed_gai_family = lambda: socket.AF_INET

# api.telegram.org's DNS round-robins across Telegram's whole 149.154.160.0/20
# (and other) ranges, and this host's network blocks most of those IPs outright
# (near-total, near-instant timeout — consistent with ISP-level filtering of
# Telegram, common for Russian-hosted servers) while leaving a few untouched.
# Diagnosed by hand: 149.154.167.220 is reachable; every other candidate tried
# (149.154.166.110, .167.221, .167.222, .175.50, .175.100, .171.5, .161.144,
# 91.108.4.196, 95.161.76.100) times out. Pinning DNS for just this hostname to
# the known-good IP avoids depending on which address the round-robin hands us.
# Host header / TLS SNI still say "api.telegram.org", so certificate validation
# is unaffected — only the actual connect() target changes.
_TELEGRAM_HOST = "api.telegram.org"
_TELEGRAM_PINNED_IP = "149.154.167.220"

_original_getaddrinfo = socket.getaddrinfo


def _pinned_getaddrinfo(host, *args, **kwargs):
    if host == _TELEGRAM_HOST:
        host = _TELEGRAM_PINNED_IP
    return _original_getaddrinfo(host, *args, **kwargs)


socket.getaddrinfo = _pinned_getaddrinfo


def _api_url(method: str) -> str:
    return f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}"


# Even the reachable IP above is severely throttled from this host — a plain
# getMe call was measured at ~40s instead of the usual sub-second response
# (bandwidth/latency throttling rather than an outright block). Give calls
# generous headroom rather than timing out something that's just slow.
_REQUEST_TIMEOUT = 60


def send_message(chat_id: str, text: str) -> None:
    if not settings.telegram_bot_token:
        return
    try:
        resp = requests.post(
            _api_url("sendMessage"), json={"chat_id": chat_id, "text": text}, timeout=_REQUEST_TIMEOUT
        )
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
        resp = requests.get(_api_url("getUpdates"), params=params, timeout=timeout + _REQUEST_TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("result", [])
    except requests.exceptions.RequestException:
        logger.exception("Telegram getUpdates request failed")
        return []
