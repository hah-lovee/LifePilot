from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Boolean, ForeignKey, Integer
from app.models.reporting.base import ReportingBase

class Domain(ReportingBase):
    __tablename__ = "domains"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False)

    user_domains = relationship("UserDomain", back_populates="domain")

class UserDomain(ReportingBase):
    __tablename__ = "user_domains"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    domain_id: Mapped[int] = mapped_column(ForeignKey("domains.id"))

    user = relationship("User", back_populates="domains")
    domain = relationship("Domain", back_populates="user_domains")
