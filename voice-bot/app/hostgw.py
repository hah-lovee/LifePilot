"""Locating the Windows host from inside a container on the VM.

Whisper and Ollama run on the Hyper-V *host*, and the Default Switch renumbers
its subnet whenever that host reboots — so the address must be discovered, never
hardcoded. The spec's `ip route | grep default` is right, but only when run on
the VM: inside a container attached to a docker network the default route points
at the docker bridge, which is the VM itself. So we read the VM's route table
through a bind mount of its /proc/net/route instead, and re-read it periodically
so a host reboot heals without recreating the container.
"""
import logging
import socket
import struct
import time

from app import config

logger = logging.getLogger(__name__)

_CACHE_TTL = 60.0
_cached: tuple[str, float] | None = None


def _parse_default_gateway(route_table: str) -> str | None:
    """/proc/net/route columns: Iface Destination Gateway Flags ... — the
    default route is the one with destination 0.0.0.0, and addresses are
    little-endian hex."""
    for line in route_table.splitlines()[1:]:
        fields = line.split()
        if len(fields) < 3 or fields[1] != "00000000":
            continue
        try:
            gateway = int(fields[2], 16)
        except ValueError:
            continue
        if gateway == 0:
            continue
        return socket.inet_ntoa(struct.pack("<L", gateway))
    return None


def _discover() -> str:
    if config.HOST_GW:
        return config.HOST_GW

    try:
        with open(config.HOST_ROUTE_FILE, encoding="ascii") as fh:
            gateway = _parse_default_gateway(fh.read())
    except OSError as exc:
        raise RuntimeError(
            f"Cannot read {config.HOST_ROUTE_FILE}: {exc}. Either mount the VM's "
            "/proc/net/route into the container (see infra/docker-compose.yml) "
            "or set HOST_GW explicitly."
        ) from exc

    if not gateway:
        raise RuntimeError(f"No default route found in {config.HOST_ROUTE_FILE}")
    return gateway


def host_gateway(force_refresh: bool = False) -> str:
    """Cached for a minute: called on every request, but the underlying value
    only ever changes when the host reboots. Callers pass force_refresh after a
    connection failure, which is exactly when the address may have moved."""
    global _cached
    now = time.monotonic()
    if _cached and not force_refresh and now - _cached[1] < _CACHE_TTL:
        return _cached[0]

    gateway = _discover()
    if _cached is None or _cached[0] != gateway:
        logger.info("Host gateway resolved to %s", gateway)
    _cached = (gateway, now)
    return gateway


def whisper_url(force_refresh: bool = False) -> str:
    if config.WHISPER_URL:
        return config.WHISPER_URL.rstrip("/")
    return f"http://{host_gateway(force_refresh)}:{config.WHISPER_PORT}"


def ollama_url(force_refresh: bool = False) -> str:
    if config.OLLAMA_URL:
        return config.OLLAMA_URL.rstrip("/")
    return f"http://{host_gateway(force_refresh)}:{config.OLLAMA_PORT}"
