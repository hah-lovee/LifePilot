import time
from typing import Any

_store: dict[str, tuple[float, Any]] = {}


def get(key: str, ttl: float) -> Any | None:
    entry = _store.get(key)
    if entry and time.time() - entry[0] < ttl:
        return entry[1]
    return None


def put(key: str, data: Any) -> None:
    _store[key] = (time.time(), data)


def invalidate(prefix: str) -> None:
    for key in list(_store):
        if key.startswith(prefix):
            del _store[key]
