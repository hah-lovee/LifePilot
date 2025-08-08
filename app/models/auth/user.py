from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, func
from app.models.auth.base import AuthBase
from datetime import datetime

class AuthUser(AuthBase):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())