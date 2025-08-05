from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer
from app.models.base import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String, unique=True)

    reports = relationship("DailyReport", back_populates="user")
    ratings = relationship("DailyRating", back_populates="user")
    domains = relationship("UserDomain", back_populates="user")

# from sqlalchemy import Column, Integer, String, ForeignKey, Date, Boolean, Text, UniqueConstraint
# from sqlalchemy.orm import relationship, DeclarativeBase, Mapped, mapped_column

# class Base(DeclarativeBase):
#     pass

# # Этот класс используется для хранения информации о пользователях.
# # Он позволяет создавать и управлять пользователями, а также их отчетами и оценками.
# class User(Base):
#     __tablename__ = "users"
#     id: Mapped[int] = mapped_column(primary_key=True)
#     username: Mapped[str] = mapped_column(String, unique=True)

#     reports = relationship("DailyReport", back_populates="user")
#     ratings = relationship("DailyRating", back_populates="user")
#     domains = relationship("UserDomain", back_populates="user")

# # Этот класс используется для хранения сфер деятельности пользователей.
# # Он позволяет создавать и управлять сферами, которые могут быть связаны с пользователями.
# class Domain(Base):
#     __tablename__ = "domains"
#     id: Mapped[int] = mapped_column(primary_key=True)
#     name: Mapped[str] = mapped_column(String, unique=True)
#     is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)

#     user_domains = relationship("UserDomain", back_populates="domain")


# # Этот класс используется для связи пользователей с их сферами деятельности.
# # Он позволяет пользователям иметь несколько сфер и управлять ими.
# class UserDomain(Base):
#     __tablename__ = "user_domains"
#     id: Mapped[int] = mapped_column(primary_key=True)
#     user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True) # null для встроенных сфер
#     domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"))

#     user = relationship("User", back_populates="domains")
#     domain = relationship("Domain", back_populates="user_domains")


# # Этот класс используется для хранения ежедневных отчетов пользователей
# # и их оценок по различным сферам деятельности.
# class DailyReport(Base):
#     __tablename__ = "daily_reports"
#     __table_args__ = (UniqueConstraint("user_id", "date"), )

#     id: Mapped[int] = mapped_column(primary_key=True)
#     user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
#     date: Mapped[Date] = mapped_column(nullable=False)
#     summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
#     productivity_score: Mapped[int] = mapped_column(Integer)
    
#     user = relationship("User", back_populates="reports")
#     ratings = relationship("DailyRating", back_populates="report", cascade="all, delete-orphan")

# # Этот класс используется для хранения оценок пользователей по их ежедневным отчетам.
# # Он позволяет связывать отчеты с оценками и пользователями.    
# class DailyRating(Base):
#     __tablename__ = "daily_ratings"

#     id: Mapped[int] = mapped_column(primary_key=True)
#     user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
#     report_id: Mapped[int] = mapped_column(ForeignKey("daily_reports.id"))
#     domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"))
#     # date: Mapped[Date] = mapped_column(nullable=False)
#     score: Mapped[int] = mapped_column(Integer)
#     comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    
#     user = relationship("User", back_populates="ratings")
#     report = relationship("DailyReport", back_populates="ratings")
#     domain = relationship("Domain")