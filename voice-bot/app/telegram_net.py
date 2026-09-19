"""Making api.telegram.org reachable from this VM.

Two independent problems, both diagnosed by hand on the backend side and
documented at length in backend/app/modules/telegram/client.py:

1. The container advertises an IPv6 route that drops packets, and aiohttp does
   not reliably fall back to IPv4 after an immediate connect failure.
2. DNS round-robins across Telegram ranges this ISP filters wholesale; only a
   handful of addresses answer at all.

Both are fixed at the resolver: aiohttp's default ThreadedResolver ultimately
calls socket.getaddrinfo, so patching that one function covers every outbound
request aiogram makes — API calls and voice-file downloads alike — without
depending on aiogram's internal session plumbing.
"""
import logging
import socket

from app import config

logger = logging.getLogger(__name__)

_TELEGRAM_HOSTS = ("api.telegram.org",)
_original_getaddrinfo = socket.getaddrinfo
_installed = False


def install() -> None:
    global _installed
    if _installed:
        return

    def patched(host, port, family=0, type=0, proto=0, flags=0):  # noqa: A002
        if config.TELEGRAM_PIN_IP and host in _TELEGRAM_HOSTS and config.TELEGRAM_API_IP:
            host = config.TELEGRAM_API_IP
        # Force IPv4 for everything: the broken IPv6 route affects the host
        # gateway and Life Pilot just as much as it does Telegram.
        if family == 0:
            family = socket.AF_INET
        return _original_getaddrinfo(host, port, family, type, proto, flags)

    socket.getaddrinfo = patched
    _installed = True
    if config.TELEGRAM_PIN_IP:
        logger.info("Pinned api.telegram.org -> %s (IPv4 only)", config.TELEGRAM_API_IP)
    else:
        logger.info("Telegram IP pinning disabled; forcing IPv4 only")
