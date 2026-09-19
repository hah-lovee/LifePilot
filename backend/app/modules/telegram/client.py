import logging
import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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
#
# Which ones are untouched changes over time, and this used to pin the single
# address that worked when it was written. That address (149.154.167.220) later
# went dark, silently killing every habit reminder until it was noticed by
# accident. So probe instead of pin: take DNS's answers (which survive Telegram
# renumbering) plus a fallback list, and use the first that accepts a
# connection, re-probing whenever a request fails.
#
# Host header / TLS SNI still say "api.telegram.org", so certificate validation
# is unaffected — only the actual connect() target changes.
_TELEGRAM_HOST = "api.telegram.org"
_PROBE_PORT = 443
_PROBE_TIMEOUT = 20.0
_FALLBACK_IPS = (
    "149.154.167.222", "149.154.175.50", "91.108.4.196", "149.154.161.144",
    "149.154.167.220", "149.154.167.221", "149.154.166.110", "149.154.171.5",
    "95.161.76.100",
)

# Captured before patching so probing and DNS lookups don't recurse.
_original_getaddrinfo = socket.getaddrinfo

_resolve_lock = threading.Lock()
_current_ip: str | None = None


def _probe(ip: str) -> tuple[str, bool, float]:
    started = time.monotonic()
    try:
        socket.create_connection((ip, _PROBE_PORT), _PROBE_TIMEOUT).close()
        return ip, True, time.monotonic() - started
    except OSError:
        return ip, False, time.monotonic() - started


def _pick_ip() -> str:
    """Probe every candidate at once and take the first that answers.

    Telegram is throttled hard enough from this host that a *successful*
    connect can take many seconds, so the per-probe timeout has to be generous
    — and sequentially that would mean minutes before reaching a live address
    when the dead ones come first. In parallel it costs one timeout total.
    """
    candidates: list[str] = []
    try:
        for info in _original_getaddrinfo(_TELEGRAM_HOST, _PROBE_PORT, socket.AF_INET, socket.SOCK_STREAM):
            ip = info[4][0]
            if ip not in candidates:
                candidates.append(ip)
    except OSError as exc:
        logger.warning("DNS lookup for %s failed (%s), using fallback list only", _TELEGRAM_HOST, exc)
    for ip in _FALLBACK_IPS:
        if ip not in candidates:
            candidates.append(ip)

    pool = ThreadPoolExecutor(max_workers=min(len(candidates), 16))
    failed: list[str] = []
    try:
        futures = [pool.submit(_probe, ip) for ip in candidates]
        for future in as_completed(futures, timeout=_PROBE_TIMEOUT + 5):
            ip, ok, elapsed = future.result()
            if ok:
                logger.info("Using %s for %s (connected in %.1fs)", ip, _TELEGRAM_HOST, elapsed)
                return ip
            failed.append(ip)
    except TimeoutError:
        pass
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    logger.error("No reachable address for %s. Failed: %s", _TELEGRAM_HOST, ", ".join(failed) or "(all timed out)")
    raise OSError(f"No address for {_TELEGRAM_HOST} answered on port {_PROBE_PORT} within {_PROBE_TIMEOUT:.0f}s")


def _resolve() -> str:
    global _current_ip
    with _resolve_lock:
        if _current_ip is None:
            _current_ip = _pick_ip()
        return _current_ip


def _invalidate() -> None:
    """After a failed request: the working address may have been filtered
    since, so force a re-probe rather than retrying the same dead IP."""
    global _current_ip
    with _resolve_lock:
        _current_ip = None


def _probing_getaddrinfo(host, *args, **kwargs):
    if host == _TELEGRAM_HOST:
        host = _resolve()
    return _original_getaddrinfo(host, *args, **kwargs)


socket.getaddrinfo = _probing_getaddrinfo


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
        # Most likely the chosen address stopped answering; the next reminder
        # then re-probes instead of retrying a dead IP forever.
        _invalidate()
