"""Making api.telegram.org reachable from this network.

Two independent problems, both diagnosed on the backend side first:

1. The container advertises an IPv6 route that drops packets, and aiohttp does
   not reliably fall back to IPv4 after an immediate connect failure.
2. This ISP filters most of Telegram's address ranges wholesale. DNS resolves
   fine and round-robins across all of them, so which address you happen to get
   decides whether anything works at all — and *which* ones answer changes over
   time (149.154.167.220 was the one reachable address when the backend was
   written; by the time the bot shipped it had gone dark while four others had
   come up).

So rather than pinning one address, resolve the candidates and probe them: real
DNS first (it survives Telegram renumbering, which a hardcoded list does not),
then the configured fallbacks. The winner is cached until something fails and
calls invalidate(), at which point the next call re-probes.

Both fixes hang off socket.getaddrinfo, which aiohttp's default resolver
ultimately calls — so this covers every request aiogram makes, API calls and
voice-file downloads alike, without depending on aiogram's session internals.
"""
import logging
import socket
import threading

from app import config

logger = logging.getLogger(__name__)

_TELEGRAM_HOSTS = ("api.telegram.org",)
_PROBE_TIMEOUT = 5.0
_PROBE_PORT = 443

# Captured before patching so probing and DNS lookups below don't recurse.
_original_getaddrinfo = socket.getaddrinfo

_lock = threading.Lock()
_current_ip: str | None = None
_installed = False


def _probe(ip: str) -> bool:
    try:
        socket.create_connection((ip, _PROBE_PORT), _PROBE_TIMEOUT).close()
        return True
    except OSError:
        return False


def _candidates() -> list[str]:
    """Real DNS first, then the configured fallbacks. Order matters only as a
    probing order — anything unreachable is skipped a few seconds later."""
    found: list[str] = []
    try:
        for info in _original_getaddrinfo(_TELEGRAM_HOSTS[0], _PROBE_PORT, socket.AF_INET, socket.SOCK_STREAM):
            ip = info[4][0]
            if ip not in found:
                found.append(ip)
    except OSError as exc:
        logger.warning("DNS lookup for api.telegram.org failed (%s), using configured fallbacks only", exc)

    for ip in config.TELEGRAM_API_IPS:
        if ip not in found:
            found.append(ip)
    return found


def _pick() -> str:
    candidates = _candidates()
    logger.info("Probing %d candidate addresses for api.telegram.org", len(candidates))
    for ip in candidates:
        if _probe(ip):
            logger.info("Using %s for api.telegram.org", ip)
            return ip
        logger.debug("No route to %s", ip)
    raise OSError(
        f"None of {len(candidates)} candidate addresses for api.telegram.org accepted a "
        f"connection on port {_PROBE_PORT}. Tried: {', '.join(candidates)}"
    )


def resolve() -> str:
    global _current_ip
    with _lock:
        if _current_ip is None:
            _current_ip = _pick()
        return _current_ip


def invalidate() -> None:
    """Called after a network failure: the address that was working may have
    been filtered since, so the next resolve() probes again from scratch."""
    global _current_ip
    with _lock:
        if _current_ip is not None:
            logger.info("Dropping cached address %s for api.telegram.org", _current_ip)
        _current_ip = None


def install() -> None:
    global _installed
    if _installed:
        return

    def patched(host, port, family=0, type=0, proto=0, flags=0):  # noqa: A002
        if config.TELEGRAM_PIN_IP and host in _TELEGRAM_HOSTS:
            # Only the connect() target changes — Host header and TLS SNI still
            # say api.telegram.org, so certificate validation is unaffected.
            host = resolve()
        # Force IPv4 everywhere: the broken IPv6 route affects the host gateway
        # and Life Pilot just as much as it does Telegram.
        if family == 0:
            family = socket.AF_INET
        return _original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = patched
    _installed = True
    if config.TELEGRAM_PIN_IP:
        logger.info("Telegram address probing enabled (IPv4 only)")
    else:
        logger.info("Telegram address probing disabled; plain DNS, IPv4 only")
