"""Free-form speech -> structured day report. Writes nothing anywhere (spec §3).

Field names and ranges mirror Life Pilot's DiaryEntryUpsert exactly
(backend/app/modules/diary/schemas.py): content, tags[], sleep_bedtime,
sleep_wakeup and three 1-10 scores. day_score is deliberately absent — the
backend derives it from habit logs and it is not writable.
"""
import json
import logging
import re

import httpx

from app import config, hostgw

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Ты — парсер устных отчётов о прожитом дне. На вход тебе дают расшифровку речи человека.

Верни СТРОГО один JSON-объект. Без markdown, без ```, без пояснений до или после.

Схема:
{
  "summary": строка или null — связный текст записи дня от первого лица. Убери слова-паразиты, запинки и повторы, но сохрани все факты и события. Не сокращай до одного предложения и ничего не выдумывай.
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


class LLMError(RuntimeError):
    pass


def _extract_json(raw: str) -> dict:
    """Ollama's format=json makes a bare object overwhelmingly likely, but a 7B
    model still occasionally wraps it in prose or a fence — so fall back to
    scanning for the first balanced object rather than failing the whole
    report."""
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
    raise LLMError("Модель вернула не-JSON")


def _score(value) -> int | None:
    if value is None:
        return None
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        logger.info("Dropping non-numeric score %r", value)
        return None
    # The backend rejects anything outside 1-10 with a 422; clamping keeps a
    # slightly over-enthusiastic "11 из 10" from failing the whole report.
    return min(10, max(1, number))


_TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _clock(value) -> str | None:
    if not isinstance(value, str):
        return None
    match = _TIME_RE.match(value.strip())
    if not match:
        logger.info("Dropping malformed time %r", value)
        return None
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def normalize(data: dict, allowed_tags: list[str]) -> dict:
    summary = data.get("summary")
    summary = summary.strip() if isinstance(summary, str) and summary.strip() else None

    vocabulary = {t.lower(): t for t in allowed_tags}
    tags: list[str] = []
    for tag in data.get("tags") or []:
        if not isinstance(tag, str):
            continue
        canonical = vocabulary.get(tag.strip().lower())
        # Belt and braces: the backend drops unknown names too, but filtering
        # here keeps the confirmation message honest about what was saved.
        if canonical and canonical not in tags:
            tags.append(canonical)

    return {
        "summary": summary,
        "mood": _score(data.get("mood")),
        "energy": _score(data.get("energy")),
        "body_condition": _score(data.get("body_condition")),
        "sleep_bedtime": _clock(data.get("sleep_bedtime")),
        "sleep_wakeup": _clock(data.get("sleep_wakeup")),
        "tags": tags,
    }


async def parse_report(text: str, allowed_tags: list[str]) -> dict:
    tag_line = ", ".join(allowed_tags) if allowed_tags else "(список пуст — верни пустой массив)"
    user_prompt = f"Допустимые теги: {tag_line}\n\nРасшифровка речи:\n{text}"

    url = hostgw.ollama_url()
    body = {
        "model": config.OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "format": "json",
        # Deterministic: this is extraction, not composition — creativity here
        # shows up as invented numbers.
        "options": {"temperature": 0},
    }

    try:
        async with httpx.AsyncClient(timeout=config.OLLAMA_TIMEOUT) as client:
            resp = await client.post(f"{url}/api/chat", json=body)
            resp.raise_for_status()
    except httpx.RequestError as exc:
        logger.warning("Ollama unreachable at %s (%s), re-resolving host gateway", url, exc)
        retry_url = hostgw.ollama_url(force_refresh=True)
        if retry_url == url:
            raise LLMError(f"Ollama недоступна: {exc}") from exc
        try:
            async with httpx.AsyncClient(timeout=config.OLLAMA_TIMEOUT) as client:
                resp = await client.post(f"{retry_url}/api/chat", json=body)
                resp.raise_for_status()
        except httpx.HTTPError as retry_exc:
            raise LLMError(f"Ollama недоступна: {retry_exc}") from retry_exc
    except httpx.HTTPStatusError as exc:
        raise LLMError(f"Ollama ответила {exc.response.status_code}") from exc

    content = resp.json().get("message", {}).get("content", "")
    data = _extract_json(content)
    if not data.get("summary"):
        # The model produced valid JSON but no usable summary — it either set it
        # to null or put the text under a key we don't read. Log the shape it
        # actually returned, since the caller can only see that the field came
        # back empty.
        logger.warning("Model returned no summary. Keys: %s | raw: %s", list(data), content[:400])
    return normalize(data, allowed_tags)
