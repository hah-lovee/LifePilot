"""Telegram entry point.

This process is the *only* getUpdates consumer for the bot token. The Life
Pilot backend shares the token but is now send-only (its poller was removed);
sendMessage has no exclusivity, getUpdates does, and two pollers on one token
silently steal each other's updates.
"""
import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path

from aiogram import Bot, Dispatcher, F
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.exceptions import TelegramNetworkError
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from app import config, fillers, lifepilot, pipeline, telegram_net

logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("voice-bot")


def _build_ref() -> str:
    """Written into the image at build time (see Dockerfile). Logged on every
    start so "is the new code actually running?" is answered by the log rather
    than inferred from which wording a message happens to use."""
    try:
        return Path("/app/BUILD_REF").read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        return "dev"


# Telegram redelivers anything unconfirmed for up to 24h. After an outage that
# backlog is worse than useless: resolve_entry_date() stamps reports with
# *now*, so a two-day-old voice note would be filed under the wrong day.
MAX_MESSAGE_AGE = timedelta(hours=1)

# Reconnect backoff after a Telegram network failure. Capped at 5 minutes so an
# outage that ends overnight is picked up promptly; reset once polling has run
# long enough to count as genuinely working.
_MIN_BACKOFF = 5
_MAX_BACKOFF = 300
_STABLE_RUN = 120

HELP_TEXT = (
    "Наговори или напиши отчёт о дне — разберу и запишу в дневник Life Pilot.\n\n"
    "Понимаю настроение, бодрость, самочувствие (1-10), время отхода ко сну и подъёма, "
    "а также теги из твоего списка.\n"
    "Второй отчёт за тот же день дописывается к первому, ничего не затирая.\n\n"
    "Попутно считаю слова-паразиты и складываю статистику в отдельный файл.\n\n"
    "/fillers — какие слова считаю"
)

dp = Dispatcher()


def _is_owner(message: Message) -> bool:
    return message.from_user is not None and str(message.from_user.id) == config.ALLOWED_TELEGRAM_ID


def _is_stale(message: Message) -> bool:
    return datetime.now(timezone.utc) - message.date > MAX_MESSAGE_AGE


@dp.message(CommandStart())
async def handle_start(message: Message, command: CommandObject) -> None:
    """Account linking, forwarded to Life Pilot.

    Intentionally NOT restricted to the owner: this is the same flow the
    backend's poller used to serve, and Life Pilot is a multi-user app whose
    other members link Telegram to get habit reminders. The one-time code is
    the security boundary here, exactly as before — only the *report* pipeline
    below is owner-only.
    """
    chat_id = str(message.chat.id)
    code = (command.args or "").strip()

    if not code:
        if _is_owner(message):
            await message.answer(HELP_TEXT)
        else:
            await message.answer("Привет! Открой Life Pilot → Настройки, чтобы получить код привязки.")
        return

    try:
        result = await lifepilot.link_chat(chat_id, code)
    except lifepilot.LifePilotError as exc:
        logger.error("Linking failed for chat_id=%s: %s", chat_id, exc)
        await message.answer("Не удалось связаться с Life Pilot — попробуй ещё раз позже.")
        return

    if result["linked"]:
        await message.answer(f"Готово! Telegram привязан к аккаунту «{result['user_name']}».")
    else:
        await message.answer("Код не найден или уже использован — сгенерируй новый в Настройках.")


@dp.message(Command("help"))
async def handle_help(message: Message) -> None:
    if not _is_owner(message):
        await message.answer("Это личный бот. Доступ есть только у владельца.")
        return
    await message.answer(HELP_TEXT)


@dp.message(Command("fillers"))
async def handle_fillers(message: Message) -> None:
    if not _is_owner(message):
        await message.answer("Это личный бот. Доступ есть только у владельца.")
        return
    await message.answer("Считаю такие слова:\n" + ", ".join(fillers.FILLER_WORDS))


async def _telegram(call, *, what: str, attempts: int = 3):
    """Run one Telegram API call, re-probing the address between attempts.

    Every call to Telegram from here is individually unreliable: the address
    chosen when polling started routinely stops answering minutes later, and
    the failure looks like a connect that hangs until the timeout. Retrying
    without invalidating would just hammer the same dead address, so each
    attempt gets a freshly probed one.

    Deliberately wraps *every* call rather than the ones that have bitten us so
    far — twice now a single unguarded await has been enough to swallow a whole
    report.
    """
    for attempt in range(1, attempts + 1):
        try:
            return await call()
        except TelegramNetworkError as exc:
            if attempt == attempts:
                raise
            logger.warning("%s failed (%s); re-probing, attempt %d/%d", what, exc, attempt, attempts)
            telegram_net.invalidate()
    raise AssertionError("unreachable")


async def _download(bot: Bot, payload) -> bytes:
    async def once() -> bytes:
        buffer = BytesIO()
        await bot.download(payload, destination=buffer)
        return buffer.getvalue()

    return await _telegram(once, what="Voice download")


async def _run(message: Message, *, text: str | None = None, payload=None, bot: Bot | None = None) -> None:
    # Best-effort: if the "working on it" message can't be delivered, that is no
    # reason to drop the report. Whisper, Ollama and Life Pilot are all on the
    # LAN and unaffected by whatever Telegram is doing, so the day's entry can
    # still be saved even when we can't say so.
    status = None
    try:
        status = await _telegram(lambda: message.answer("⏳ Обрабатываю…"), what="Status message")
    except TelegramNetworkError as exc:
        logger.warning("Could not send the status message (%s); processing anyway", exc)

    try:
        audio = await _download(bot, payload) if payload is not None else None
        reply = await pipeline.handle_report(str(message.chat.id), text=text, audio=audio)
    except TelegramNetworkError as exc:
        logger.warning("Telegram network error while handling a report: %s", exc)
        reply = "⚠️ Связь с Telegram оборвалась на полпути. Пришли голосовое ещё раз."
    except Exception as exc:  # noqa: BLE001 — surfaced to the user verbatim
        logger.exception("Report processing failed")
        reply = f"⚠️ Не получилось: {exc}"

    try:
        if status is not None:
            await _telegram(lambda: status.edit_text(reply), what="Reply")
        else:
            await _telegram(lambda: message.answer(reply), what="Reply")
    except Exception:  # noqa: BLE001
        # The report itself may well be saved by now, so log what the sender
        # was supposed to see rather than losing it with the failed delivery.
        logger.error("Could not deliver the reply. It said: %s", reply)


@dp.message(F.voice | F.audio)
async def handle_voice(message: Message, bot: Bot) -> None:
    if not _is_owner(message):
        await message.answer("Это личный бот. Доступ есть только у владельца.")
        return
    if _is_stale(message):
        logger.warning("Skipping stale voice message from %s", message.date)
        return
    await _run(message, payload=message.voice or message.audio, bot=bot)


@dp.message(F.text)
async def handle_text(message: Message) -> None:
    """Same pipeline minus Whisper — for when typing beats talking (spec §2.1)."""
    if not _is_owner(message):
        await message.answer("Это личный бот. Доступ есть только у владельца.")
        return
    if _is_stale(message):
        logger.warning("Skipping stale text message from %s", message.date)
        return
    # Everything above this handler is a registered command, so a leading slash
    # here means a typo — feeding it to the model would file nonsense as a
    # day report.
    if message.text.startswith("/"):
        await message.answer(f"Не знаю такой команды.\n\n{HELP_TEXT}")
        return
    await _run(message, text=message.text)


async def _make_bot() -> Bot:
    """Build a Bot routed through the proxy when that actually works today.

    The proxy runs on a PC whose VPN is not always on, and without the VPN it
    reaches Telegram no better than we do. So this is checked rather than
    assumed, and re-checked on every reconnect: with the proxy up we use it and
    address probing is pointless; without it we fall back to probing addresses
    directly, which is worse but not nothing.
    """
    proxy = config.TELEGRAM_PROXY or None
    if proxy:
        # Blocking socket work — off the event loop.
        usable = await asyncio.to_thread(telegram_net.proxy_usable, proxy)
        if usable:
            logger.info("Routing Telegram traffic through %s", proxy)
        else:
            logger.warning("Proxy %s not usable (VPN down?); falling back to direct", proxy)
            proxy = None

    telegram_net.set_pinning(proxy is None)
    session = AiohttpSession(timeout=config.TELEGRAM_TIMEOUT, proxy=proxy)
    return Bot(token=config.TELEGRAM_BOT_TOKEN, session=session)


async def main() -> None:
    telegram_net.install()
    logger.info(
        "Starting build=%s: model=%s, fillers=%d, log=%s",
        _build_ref(), config.OLLAMA_MODEL, len(fillers.FILLER_WORDS), config.FILLER_LOG_PATH,
    )

    bot = await _make_bot()
    backoff = _MIN_BACKOFF
    try:
        while True:
            started = time.monotonic()
            try:
                # Long polling rather than a webhook: the VM has no inbound
                # route from the internet, and Telegram is reachable outbound
                # only.
                await dp.start_polling(bot, polling_timeout=30)
                return  # clean shutdown (signal)
            except TelegramNetworkError as exc:
                # Retry in-process instead of letting the container die: on
                # this network Telegram outages are routine, and crash-looping
                # under restart:unless-stopped just burns the connect timeout
                # over and over while losing the resolved address each time.
                if time.monotonic() - started > _STABLE_RUN:
                    backoff = _MIN_BACKOFF  # it was working; treat this as fresh
                logger.warning("Telegram unreachable (%s). Reconnecting in %ds", exc, backoff)
                # The address that was working may have been filtered since —
                # force a re-probe rather than retrying the same dead IP.
                telegram_net.invalidate()
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, _MAX_BACKOFF)
                # Re-decide proxy vs direct: the VPN behind the proxy comes and
                # goes, and a reconnect is exactly when that may have changed.
                await bot.session.close()
                bot = await _make_bot()
    finally:
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
