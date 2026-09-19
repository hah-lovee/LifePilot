"""Speech -> structured diary fields.

Two hops to GPU services on the Windows host (see app/core/hostgw.py): Whisper
turns the recording into text, Qwen turns the text into the diary's own fields.
Neither knows anything about Life Pilot; the mapping to DiaryEntryUpsert lives
here.

Audio is never written to disk. It arrives in memory, goes straight to Whisper
and is dropped — the diary is the most private data in the app and a voice
recording is biometric on top of that, so the transcript is the only thing worth
keeping. There is also nothing to forget to delete on an error path.
"""
import json
import logging
import re

import requests
from fastapi import HTTPException, status

from app.core import hostgw
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — парсер устных записей дневника. На вход тебе дают расшифровку речи человека о прожитом дне.

Верни СТРОГО один JSON-объект. Без markdown, без ```, без пояснений до или после.

Схема:
{
  "text": строка или null — связная запись дня от первого лица. Убери слова-паразиты, запинки и повторы, сохрани все факты и события. Не сокращай до одного предложения и ничего не выдумывай.
  "mood": целое 1-10 или null — настроение,
  "energy": целое 1-10 или null — бодрость, силы,
  "body_condition": целое 1-10 или null — самочувствие тела: болезни, боли, усталость,
  "sleep_bedtime": "ЧЧ:ММ" или null — во сколько лёг спать,
  "sleep_wakeup": "ЧЧ:ММ" или null — во сколько встал,
  "tags": массив строк — только из списка допустимых тегов, который дан ниже. Если ничего не подходит — пустой массив.
}

Железные правила:
- Если чего-то в речи НЕТ — ставь null. Никогда не угадывай и не подставляй среднее.
- Оценки бери из сказанного: явное число («настроение на семёрку») — как есть; словесную оценку переводи в шкалу 1-10 («отлично» ≈ 9, «нормально» ≈ 6, «так себе» ≈ 4, «отвратительно» ≈ 2).
- Время сна приводи к 24-часовому формату: «лёг в час ночи» -> "01:00", «встал в полвосьмого» -> "07:30".
- В "tags" НЕ придумывай новые теги — бери дословно из списка допустимых."""

_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _unavailable(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=detail)


def transcribe(audio: bytes, filename: str, content_type: str) -> str:
    url = hostgw.whisper_url()
    try:
        resp = requests.post(
            f"{url}/transcribe",
            files={"file": (filename, audio, content_type)},
            timeout=settings.whisper_timeout,
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        # A moved host gateway looks exactly like this, so re-resolve once
        # before giving up — that is the whole point of not caching forever.
        logger.warning("Whisper unreachable at %s (%s); re-resolving host gateway", url, exc)
        retry_url = hostgw.whisper_url(force_refresh=True)
        if retry_url == url:
            raise _unavailable("Сервис распознавания речи недоступен") from exc
        try:
            resp = requests.post(
                f"{retry_url}/transcribe",
                files={"file": (filename, audio, content_type)},
                timeout=settings.whisper_timeout,
            )
            resp.raise_for_status()
        except requests.exceptions.RequestException as retry_exc:
            raise _unavailable("Сервис распознавания речи недоступен") from retry_exc

    text = (resp.json().get("text") or "").strip()
    if not text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Не удалось разобрать речь — попробуйте записать ещё раз",
        )
    return text


def _extract_json(raw: str) -> dict:
    """Ollama's format=json makes a bare object overwhelmingly likely, but a 7B
    model still occasionally wraps it in prose or a fence, so fall back to
    scanning for the first balanced object rather than failing the whole
    recording."""
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*(.+?)```", raw, re.S)
    if fenced:
        try:
            return json.loads(fenced.group(1).strip())
        except json.JSONDecodeError:
            pass

    start = raw.find("{")
    if start != -1:
        depth = 0
        for i, ch in enumerate(raw[start:], start):
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start : i + 1])
                    except json.JSONDecodeError:
                        break

    logger.error("Could not extract JSON from model output: %r", raw[:500])
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail="Модель вернула неразборчивый ответ — попробуйте ещё раз",
    )


def _score(value) -> int | None:
    if value is None:
        return None
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        logger.info("Dropping non-numeric score %r", value)
        return None
    # The diary schema rejects anything outside 1-10; clamping keeps a slightly
    # over-enthusiastic "11 из 10" from failing the whole recording.
    return min(10, max(1, number))


def _clock(value) -> str | None:
    if not isinstance(value, str):
        return None
    match = _TIME_RE.match(value.strip())
    if not match:
        logger.info("Dropping malformed time %r", value)
        return None
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def normalize(data: dict, allowed_tags: list[str], transcript: str) -> dict:
    text = data.get("text")
    text = text.strip() if isinstance(text, str) and text.strip() else None

    vocabulary = {t.lower(): t for t in allowed_tags}
    tags: list[str] = []
    for tag in data.get("tags") or []:
        if not isinstance(tag, str):
            continue
        canonical = vocabulary.get(tag.strip().lower())
        # Unknown names are dropped rather than created: the model picks from a
        # list we hand it, and a hallucinated tag would permanently pollute the
        # picker for every future entry.
        if canonical and canonical not in tags:
            tags.append(canonical)

    used_transcript = text is None
    if used_transcript:
        # A 7B model does sometimes return text: null. Falling back to the raw
        # transcript keeps the recording from being silently worthless —
        # rougher wording beats an empty form.
        logger.warning("Model returned no text; falling back to the raw transcript")
        text = transcript

    return {
        "text": text,
        "mood": _score(data.get("mood")),
        "energy": _score(data.get("energy")),
        "body_condition": _score(data.get("body_condition")),
        "sleep_bedtime": _clock(data.get("sleep_bedtime")),
        "sleep_wakeup": _clock(data.get("sleep_wakeup")),
        "tags": tags,
        "transcript": transcript,
        "used_raw_transcript": used_transcript,
    }


def parse(transcript: str, allowed_tags: list[str]) -> dict:
    tag_line = ", ".join(allowed_tags) if allowed_tags else "(список пуст — верни пустой массив)"
    body = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Допустимые теги: {tag_line}\n\nРасшифровка речи:\n{transcript}"},
        ],
        "stream": False,
        "format": "json",
        # Deterministic: this is extraction, not composition — creativity here
        # shows up as invented numbers.
        "options": {"temperature": 0},
    }

    url = hostgw.ollama_url()
    try:
        resp = requests.post(f"{url}/api/chat", json=body, timeout=settings.ollama_timeout)
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.warning("Ollama unreachable at %s (%s); re-resolving host gateway", url, exc)
        retry_url = hostgw.ollama_url(force_refresh=True)
        if retry_url == url:
            raise _unavailable("Сервис разбора текста недоступен") from exc
        try:
            resp = requests.post(f"{retry_url}/api/chat", json=body, timeout=settings.ollama_timeout)
            resp.raise_for_status()
        except requests.exceptions.RequestException as retry_exc:
            raise _unavailable("Сервис разбора текста недоступен") from retry_exc

    content = resp.json().get("message", {}).get("content", "")
    return normalize(_extract_json(content), allowed_tags, transcript)
