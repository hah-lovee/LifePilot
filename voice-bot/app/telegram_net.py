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
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlsplit

from app import config

logger = logging.getLogger(__name__)

_TELEGRAM_HOSTS = ("api.telegram.org",)
_PROBE_PORT = 443

# Captured before patching so probing and DNS lookups below don't recurse.
_original_getaddrinfo = socket.getaddrinfo

_lock = threading.Lock()
_current_ip: str | None = None
_installed = False

# Whether to rewrite api.telegram.org to a probed address. Off while traffic
# goes through a proxy (which resolves the name at its end) and switched back
# on when we fall back to a direct connection — the VPN behind the proxy is not
# always up, so this flips at runtime rather than being decided at import.
_pinning = config.TELEGRAM_PIN_IP


def set_pinning(enabled: bool) -> None:
    global _pinning
    if _pinning != enabled:
        logger.info("Address probing %s", "enabled" if enabled else "disabled (using proxy)")
    _pinning = enabled


def proxy_usable(proxy_url: str, timeout: float = 8.0) -> bool:
    """Can we actually reach Telegram through this proxy right now?

    Not just "is the port open": the proxy lives on a PC whose VPN may be off,
    in which case it accepts the connection and then fails to reach Telegram
    exactly like we would. So ask it to open the tunnel and see what it says.
    """
    parsed = urlsplit(proxy_url if "://" in proxy_url else f"http://{proxy_url}")
    host, port = parsed.hostname, parsed.port or 8889
    if not host:
        logger.warning("Cannot parse TELEGRAM_PROXY=%r", proxy_url)
        return False
    try:
        with socket.create_connection((host, port), timeout) as sock:
            sock.settimeout(timeout)
            target = _TELEGRAM_HOSTS[0]
            sock.sendall(f"CONNECT {target}:443 HTTP/1.1\r\nHost: {target}:443\r\n\r\n".encode())
            response = sock.recv(256).decode("latin-1", "replace")
    except OSError as exc:
        logger.warning("Proxy %s:%s unreachable: %s", host, port, exc)
        return False

    ok = " 200 " in response.split("\r\n")[0]
    if not ok:
        logger.warning("Proxy %s:%s refused the tunnel: %s", host, port, response.split("\r\n")[0])
    return ok


def _probe(ip: str) -> tuple[str, bool, float]:
    started = time.monotonic()
    try:
        socket.create_connection((ip, _PROBE_PORT), config.TELEGRAM_PROBE_TIMEOUT).close()
        return ip, True, time.monotonic() - started
    except OSError:
        return ip, False, time.monotonic() - started


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
    """Probe all candidates at once and take the first to answer.

    Sequentially was a mistake: this link throttles Telegram hard enough that a
    successful connect can take many seconds (the backend measured ~40s for a
    plain getMe), so the timeout has to be generous — and a generous timeout
    times nine candidates meant the whole probe outran the request timeout
    before reaching a working address. In parallel the wall-clock cost is one
    timeout regardless of how many addresses are dark.
    """
    candidates = _candidates()
    timeout = config.TELEGRAM_PROBE_TIMEOUT
    logger.info("Probing %d addresses for api.telegram.org (%.0fs timeout)", len(candidates), timeout)

    pool = ThreadPoolExecutor(max_workers=min(len(candidates), 16))
    failed: list[str] = []
    try:
        futures = [pool.submit(_probe, ip) for ip in candidates]
        for future in as_completed(futures, timeout=timeout + 5):
            ip, ok, elapsed = future.result()
            if ok:
                logger.info("Using %s for api.telegram.org (connected in %.1fs)", ip, elapsed)
                return ip
            failed.append(ip)
    except TimeoutError:
        pass
    finally:
        pool.shutdown(wait=False, cancel_futures=True)

    # Logged rather than only raised: aiohttp rewraps this into a generic
    # "Cannot connect to host" and the detail is lost by the time it surfaces.
    logger.error("No reachable address for api.telegram.org. Failed: %s", ", ".join(failed) or "(all timed out)")
    raise OSError(
        f"None of {len(candidates)} candidate addresses for api.telegram.org answered on "
        f"port {_PROBE_PORT} within {timeout:.0f}s"
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
        if _pinning and host in _TELEGRAM_HOSTS:
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
    logger.info("IPv4 forced for all outbound traffic; address probing=%s", _pinning)
