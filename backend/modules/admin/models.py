from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.base import AppBaseModel
from utils.datetime_utils import naive_utc_now


class AdminStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


class Admin(AppBaseModel):
    """Global platform administrator, deliberately outside organization scope."""

    __tablename__ = "admin"
    __table_args__ = (UniqueConstraint("email", name="uq_admin_email"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[AdminStatus] = mapped_column(
        SAEnum(AdminStatus, values_callable=_enum_values),
        nullable=False,
        default=AdminStatus.ACTIVE,
        server_default=AdminStatus.ACTIVE.value,
        index=True,
    )
    sessions: Mapped[list["AdminSession"]] = relationship(
        "AdminSession", back_populates="admin", cascade="all, delete-orphan"
    )


class AdminSession(AppBaseModel):
    """Authentication session reserved for future platform-admin routes."""

    __tablename__ = "admin_session"
    __table_args__ = (UniqueConstraint("token_hash", name="uq_admin_session_token_hash"),)

    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("admin.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    admin: Mapped[Admin] = relationship("Admin", back_populates="sessions")


__all__ = ["Admin", "AdminSession", "AdminStatus"]
