from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Life Pilot"
    environment: str = "development"

    database_url: str = "postgresql+psycopg://life_pilot:life_pilot@localhost:5432/life_pilot"

    secret_key: str = "change-me-in-production"
    access_token_expire_minutes: int = 60 * 24 * 7  # one week, single/family use
    algorithm: str = "HS256"

    # Closed-circle app: registration requires knowing this shared invite code.
    registration_code: str = "change-me-in-production"

    cors_origins: list[str] = ["http://localhost:3000"]

    upload_dir: str = "./uploads"

    investments_api_url: str = "http://localhost:8001"
    investments_api_key: str = ""

    # Reserved for a future machine-to-machine caller. Nothing reads it today:
    # the /api/integrations/* endpoints it guarded went away with the Telegram
    # bot, and browser voice input authenticates with the ordinary user JWT.
    integration_api_key: str = ""

    # --- Voice input: GPU services on the Windows host ---
    # Whisper and Ollama are not in the VM. The address of the host changes
    # whenever it reboots (Hyper-V Default Switch renumbers), so it is resolved
    # at runtime — see app/core/hostgw.py. Setting whisper_url/ollama_url
    # bypasses that entirely.
    host_gw: str = ""
    host_route_file: str = "/host/net/route"
    whisper_url: str = ""
    ollama_url: str = ""
    whisper_port: int = 8100
    ollama_port: int = 11434
    ollama_model: str = "qwen2.5:7b"
    # Whisper transcribes a minute of speech in seconds but queues behind other
    # GPU work; Ollama streams nothing back until the whole JSON is ready.
    whisper_timeout: int = 60
    ollama_timeout: int = 30

    telegram_bot_token: str = ""
    telegram_bot_username: str = ""  # без "@", для ссылки-приглашения t.me/<username>


settings = Settings()
