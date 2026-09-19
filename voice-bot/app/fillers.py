"""Counting filler words and accumulating them outside the Life Pilot DB.

Per spec §2.3 this is its own store — a JSONL file on a volume, one line per
report — so a future "сколько паразитов за неделю" analysis has raw material
without the diary schema growing a column it doesn't want. No analysis here,
only accumulation.
"""
import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from app import config

logger = logging.getLogger(__name__)

_write_lock = asyncio.Lock()


def _load_filler_words() -> list[str]:
    if config.FILLER_WORDS_FILE:
        try:
            raw = Path(config.FILLER_WORDS_FILE).read_text(encoding="utf-8")
            words = [line.strip() for line in raw.splitlines()]
        except OSError as exc:
            logger.warning("Cannot read %s (%s), falling back to FILLER_WORDS", config.FILLER_WORDS_FILE, exc)
            words = config.FILLER_WORDS_RAW.split(",")
    else:
        words = config.FILLER_WORDS_RAW.split(",")

    seen: list[str] = []
    for word in words:
        cleaned = word.strip().lower()
        if cleaned and not cleaned.startswith("#") and cleaned not in seen:
            seen.append(cleaned)
    return seen


def _compile(phrase: str) -> re.Pattern:
    parts = phrase.split()
    if len(parts) == 1 and len(phrase) >= 2 and len(set(phrase)) == 1:
        # A hesitation like "эээ" comes back from Whisper with an arbitrary
        # number of letters, so match any run of two or more rather than the
        # exact spelling someone happened to put in the config.
        return re.compile(rf"\b{re.escape(phrase[0])}{{2,}}\b", re.IGNORECASE | re.UNICODE)
    # \s+ between parts so "как   бы" and a line break both still count.
    pattern = r"\s+".join(re.escape(part) for part in parts)
    return re.compile(rf"\b{pattern}\b", re.IGNORECASE | re.UNICODE)


FILLER_WORDS = _load_filler_words()
_PATTERNS = [(word, _compile(word)) for word in FILLER_WORDS]


def count(text: str) -> dict:
    """Counted on the RAW transcript, before the model cleans it up — the whole
    point is to measure how the sentence was actually spoken."""
    counts = {word: len(pattern.findall(text)) for word, pattern in _PATTERNS}
    found = {word: n for word, n in counts.items() if n}
    words_total = len(re.findall(r"\b[\w-]+\b", text, re.UNICODE))
    return {
        "found": dict(sorted(found.items(), key=lambda kv: -kv[1])),
        "total": sum(found.values()),
        "chars": len(text),
        "words": words_total,
        # Fillers per 100 words — the only number that stays comparable between
        # a one-line note and a five-minute monologue.
        "per_100_words": round(sum(found.values()) * 100 / words_total, 1) if words_total else 0.0,
    }


async def append_log(stats: dict, source: str, entry_date: str, text: str) -> None:
    record = {
        "logged_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "entry_date": entry_date,
        "source": source,  # "voice" | "text"
        **stats,
        "text": text,
    }
    line = json.dumps(record, ensure_ascii=False) + "\n"

    async with _write_lock:
        try:
            path = Path(config.FILLER_LOG_PATH)
            path.parent.mkdir(parents=True, exist_ok=True)
            # Append + flush + fsync: the container is killed by `docker compose
            # down`, not by a graceful shutdown hook, and a lost line here is a
            # lost line forever.
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line)
                fh.flush()
                os.fsync(fh.fileno())
        except OSError:
            # Never let the parasite log take down a report that is otherwise
            # already safely in the diary.
            logger.exception("Failed to append to %s", config.FILLER_LOG_PATH)


def summarize(stats: dict) -> str:
    if not stats["total"]:
        return "Слов-паразитов не нашёл 👌"
    listed = ", ".join(f"«{word}» × {n}" for word, n in list(stats["found"].items())[:5])
    extra = len(stats["found"]) - 5
    if extra > 0:
        listed += f" и ещё {extra}"
    return f"Паразитов: {stats['total']} ({stats['per_100_words']} на 100 слов)\n{listed}"
