from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, ForeignKey, Date, Text, UniqueConstraint
from app.models.base import Base
from datetime import datetime, date

class DailyReport(Base):
    __tablename__ = "daily_reports"
    __table_args__ = (UniqueConstraint("user_id", "date"), )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    productivity_score: Mapped[int]

    user = relationship("User", back_populates="reports")
    ratings = relationship("DailyRating", back_populates="report", cascade="all, delete-orphan")

class DailyRating(Base):
    __tablename__ = "daily_ratings"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    report_id: Mapped[int] = mapped_column(ForeignKey("daily_reports.id"))
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"))
    score: Mapped[int]
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)

    user = relationship("User", back_populates="ratings")
    report = relationship("DailyReport", back_populates="ratings")
    domain = relationship("Domain")
    # date: Mapped[Date] = mapped_column(nullable=False)  # This line is commented out in the original code