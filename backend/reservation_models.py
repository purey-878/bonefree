"""Catalog-independent restaurant reservations. Tokens and retry keys are never plaintext."""
from datetime import date, time
from decimal import Decimal
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column
from database import Base
from datetime import datetime
from utils.datetime_utils import naive_utc_now


class ReservationBase(Base):
    __abstract__ = True
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False)


class ReservationSettings(Base):
    __tablename__ = 'reservation_settings'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    __table_args__ = (CheckConstraint('id = 1', name='ck_reservation_settings_singleton'),)


class ReservationException(Base):
    __tablename__ = 'reservation_exception'
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    closed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    windows: Mapped[list] = mapped_column(JSON, nullable=False)


class ReservationPromotion(ReservationBase):
    __tablename__ = 'reservation_promotion'
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False)
    automatic: Mapped[bool] = mapped_column(Boolean, nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    __table_args__ = (CheckConstraint('percentage > 0 AND percentage <= 100', name='ck_reservation_promotion_percentage'), CheckConstraint('end_date >= start_date', name='ck_reservation_promotion_dates'))


class Reservation(ReservationBase):
    __tablename__ = 'reservation'
    reference: Mapped[str] = mapped_column(String(24), nullable=False, unique=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    token_salt: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(32))
    special_requests: Mapped[str | None] = mapped_column(Text)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    slot: Mapped[time] = mapped_column(Time, nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default='confirmed')
    promotion_id: Mapped[int | None] = mapped_column(ForeignKey('reservation_promotion.id', ondelete='SET NULL'))
    promotion_snapshot: Mapped[dict | None] = mapped_column(JSON)
    venue: Mapped[dict] = mapped_column(JSON, nullable=False)
    __table_args__ = (
        CheckConstraint('guests > 0 AND guests <= 100', name='ck_reservation_guests'),
        CheckConstraint("status IN ('confirmed','cancelled','completed','no_show')", name='ck_reservation_status'),
        Index('ix_reservation_capacity', 'day', 'slot', 'status'),
    )
