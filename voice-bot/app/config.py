"""Configuration, entirely from the environment — no secret is ever a default."""
import os


def _require(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value


def _int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    return int(raw) if raw else default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    return raw in ("1", "true", "yes", "on") if raw else default


# --- Telegram ---------------------------------------------------------------
TELEGRAM_BOT_TOKEN = _require("TELEGRAM_BOT_TOKEN")
# Personal service: exactly one человек may use it. In a private chat with a
# bot Telegram's chat.id and from.id are the same number, so this doubles as
# the chat id we hand to Life Pilot.
ALLOWED_TELEGRAM_ID = _require("ALLOWED_TELEGRAM_ID")

# api.telegram.org round-robins across ranges this ISP filters almost entirely;
# the backend diagnosed 149.154.167.220 as one of the few reachable addresses
# (see backend/app/modules/telegram/client.py for the full write-up). Pinning
# only changes the connect() target — Host header and TLS SNI still say
# api.telegram.org, so certificate validation is untouched.
TELEGRAM_PIN_IP = _bool("TELEGRAM_PIN_IP", True)
TELEGRAM_API_IP = os.getenv("TELEGRAM_API_IP", "149.154.167.220").strip()

# --- Life Pilot -------------------------------------------------------------
# Same compose project, so the service name resolves on the shared network.
LIFEPILOT_API_URL = os.getenv("LIFEPILOT_API_URL", "http://backend:8000").rstrip("/")
INTEGRATION_API_KEY = _require("INTEGRATION_API_KEY")

# --- GPU services on the Windows host ---------------------------------------
# Left unset these are built from the dynamically resolved host gateway; set
# them to bypass gateway discovery entirely.
WHISPER_URL = os.getenv("WHISPER_URL", "").strip()
OLLAMA_URL = os.getenv("OLLAMA_URL", "").strip()
WHISPER_PORT = _int("WHISPER_PORT", 8100)
OLLAMA_PORT = _int("OLLAMA_PORT", 11434)
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b").strip()
# Escape hatch: pin the Hyper-V host address instead of discovering it.
HOST_GW = os.getenv("HOST_GW", "").strip()
# Bind-mounted from the VM's /proc/net/route. Read from inside the container
# it would describe the docker bridge (i.e. the VM itself); mounted from the
# host namespace it describes the VM's own default route, whose gateway *is*
# the Hyper-V switch address we are looking for.
HOST_ROUTE_FILE = os.getenv("HOST_ROUTE_FILE", "/host/net/route").strip()

# --- Timeouts ---------------------------------------------------------------
# Whisper and Ollama are GPU services on a LAN hop: slow to start generating,
# fast once they do. Telegram is the throttled link (the backend measured a
# ~40s getMe), hence the separate, far more generous budget.
WHISPER_TIMEOUT = _int("WHISPER_TIMEOUT", 300)
OLLAMA_TIMEOUT = _int("OLLAMA_TIMEOUT", 300)
LIFEPILOT_TIMEOUT = _int("LIFEPILOT_TIMEOUT", 30)
TELEGRAM_TIMEOUT = _int("TELEGRAM_TIMEOUT", 120)

# --- Diary ------------------------------------------------------------------
# A report dictated at 00:30 is about the day that just ended, not the one that
# just started, so local times before this hour still count as the previous day.
DAY_ROLLOVER_HOUR = _int("DAY_ROLLOVER_HOUR", 4)

# --- Filler words -----------------------------------------------------------
_DEFAULT_FILLERS = "ну,это,эээ,как бы,типа,короче,в общем,блин,вот,значит,собственно,походу,реально"
FILLER_WORDS_FILE = os.getenv("FILLER_WORDS_FILE", "").strip()
FILLER_WORDS_RAW = os.getenv("FILLER_WORDS", _DEFAULT_FILLERS)
# On a named volume so the accumulated history survives container recreation.
FILLER_LOG_PATH = os.getenv("FILLER_LOG_PATH", "/data/fillers.jsonl").strip()

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").strip().upper()
