from pydantic import BaseModel


class TelegramLinkOut(BaseModel):
    linked: bool
    link_code: str | None = None
    deep_link: str | None = None  # https://t.me/<bot>?start=<code>, only when not yet linked


class TelegramStatusOut(BaseModel):
    linked: bool
