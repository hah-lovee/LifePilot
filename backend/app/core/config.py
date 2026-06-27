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


settings = Settings()
