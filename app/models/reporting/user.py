from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer
from app.models.reporting.base import ReportingBase

class User(ReportingBase):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True)

    reports = relationship("DailyReport", back_populates="user")
    ratings = relationship("DailyRating", back_populates="user")
    domains = relationship("UserDomain", back_populates="user")
