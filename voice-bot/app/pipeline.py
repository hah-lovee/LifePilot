"""The orchestrator (spec §3): transcript -> structure -> diary + filler log.

Every step that talks to another service lives in its own module; this file
only decides the order and what to tell the user.
"""
import logging
from datetime import datetime, timedelta

from app import config, fillers, lifepilot, llm, whisper

logger = logging.getLogger(__name__)

_LABELS = {
    "mood": "настроение",
    "energy": "бодрость",
    "body_condition": "самочувствие",
}


def resolve_entry_date(local_now: datetime) -> str:
    """Which day a report is *about*. Dictating at 00:30 almost always means
    the day that just ended, so anything before DAY_ROLLOVER_HOUR counts
    backwards. local_now already arrives in the owner's timezone — containers
    run in UTC and must never decide this themselves."""
    effective = local_now - timedelta(hours=config.DAY_ROLLOVER_HOUR)
    return effective.date().isoformat()


def format_confirmation(parsed: dict, saved: dict, stats: dict, entry_date: str) -> str:
    lines = ["📝 Записал" if saved["created"] else "📝 Дописал к записи"]
    lines.append(f"Дата: {entry_date}")

    recorded = [f"{label} {parsed[field]}/10" for field, label in _LABELS.items() if parsed[field]]
    if parsed["sleep_bedtime"] or parsed["sleep_wakeup"]:
        recorded.append(f"сон {parsed['sleep_bedtime'] or '?'} → {parsed['sleep_wakeup'] or '?'}")
    if recorded:
        lines.append("· " + ", ".join(recorded))
    if saved["applied_tags"]:
        lines.append("· теги: " + ", ".join(saved["applied_tags"]))
    if not recorded and not parsed["summary"]:
        lines.append("· из оценок ничего не распознал — сохранил только текст")

    lines.append("")
    lines.append(fillers.summarize(stats))
    return "\n".join(lines)


async def handle_report(chat_id: str, *, text: str | None = None, audio: bytes | None = None) -> str:
    """Returns the message to send back. Raises on failure — the handler turns
    that into a readable error."""
    if audio is not None:
        source = "voice"
        transcript = await whisper.transcribe(audio)
        logger.info("Transcribed %d bytes into %d chars", len(audio), len(transcript))
    else:
        source = "text"
        transcript = (text or "").strip()

    if not transcript:
        raise ValueError("Пустой текст — нечего записывать")

    context = await lifepilot.diary_context(chat_id)
    local_now = datetime.fromisoformat(context["local_now"])
    entry_date = resolve_entry_date(local_now)

    parsed = await llm.parse_report(transcript, context["tags"])
    # Deliberately on the raw transcript, not on parsed["summary"] — the model
    # was told to strip fillers, so counting the clean text would always be 0.
    stats = fillers.count(transcript)

    saved = await lifepilot.save_report(chat_id, entry_date, parsed)
    # Diary first: if the file write fails we have still kept the report, and
    # append_log swallows its own IO errors for exactly that reason.
    await fillers.append_log(stats, source, entry_date, transcript)

    if saved["rejected_tags"]:
        logger.info("Model proposed tags outside the vocabulary: %s", saved["rejected_tags"])

    return format_confirmation(parsed, saved, stats, entry_date)
