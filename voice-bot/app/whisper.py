"""Speech -> text. Knows nothing about Life Pilot (spec §3)."""
import asyncio
import logging
import shutil

import httpx

from app import config, hostgw

logger = logging.getLogger(__name__)


class TranscriptionError(RuntimeError):
    pass


async def _post(url: str, filename: str, audio: bytes, content_type: str) -> str:
    async with httpx.AsyncClient(timeout=config.WHISPER_TIMEOUT) as client:
        resp = await client.post(
            f"{url}/transcribe", files={"file": (filename, audio, content_type)}
        )
    resp.raise_for_status()
    payload = resp.json()
    text = (payload.get("text") or "").strip()
    if not text:
        raise TranscriptionError("Whisper вернул пустой текст")
    return text


async def _to_wav(audio: bytes) -> bytes:
    """Telegram ships voice notes as OGG/Opus. Most whisper servers shell out to
    ffmpeg and take that as-is, so we try the original first and only convert
    when the server rejects it — no point burning CPU on every message for a
    server that never needed it."""
    if shutil.which("ffmpeg") is None:
        raise TranscriptionError("Whisper не принял .oga, а ffmpeg в образе нет")

    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0", "-ar", "16000", "-ac", "1", "-f", "wav", "pipe:1",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate(audio)
    if proc.returncode != 0:
        raise TranscriptionError(f"ffmpeg не смог сконвертировать аудио: {err.decode(errors='replace')[:200]}")
    return out


async def transcribe(audio: bytes, filename: str = "voice.oga") -> str:
    url = hostgw.whisper_url()
    try:
        return await _post(url, filename, audio, "audio/ogg")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code < 500:
            logger.info("Whisper rejected %s (%s), retrying as WAV", filename, exc.response.status_code)
            wav = await _to_wav(audio)
            return await _post(url, "voice.wav", wav, "audio/wav")
        raise TranscriptionError(f"Whisper ответил {exc.response.status_code}") from exc
    except httpx.RequestError as exc:
        # A moved host gateway looks exactly like this, so re-resolve once
        # before giving up — that is the whole point of not caching forever.
        logger.warning("Whisper unreachable at %s (%s), re-resolving host gateway", url, exc)
        retry_url = hostgw.whisper_url(force_refresh=True)
        if retry_url == url:
            raise TranscriptionError(f"Whisper недоступен: {exc}") from exc
        try:
            return await _post(retry_url, filename, audio, "audio/ogg")
        except httpx.HTTPError as retry_exc:
            raise TranscriptionError(f"Whisper недоступен: {retry_exc}") from retry_exc
