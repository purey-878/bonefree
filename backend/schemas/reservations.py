from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal
import re
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Locale = Literal['pt-PT', 'en-GB', 'de-DE']
ReservationStatus = Literal['confirmed', 'cancelled', 'completed', 'no_show']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    @field_validator('*', mode='before')
    @classmethod
    def reject_nulls(cls, value):
        if isinstance(value, str) and '\x00' in value:
            raise ValueError('Null characters are not allowed')
        return value


class BookingWindow(StrictModel):
    start: str = Field(pattern=r'^\d{2}:\d{2}$')
    end: str = Field(pattern=r'^\d{2}:\d{2}$')

    @model_validator(mode='after')
    def valid(self):
        try:
            start, end = time.fromisoformat(self.start), time.fromisoformat(self.end)
        except ValueError:
            raise ValueError('Invalid booking window')
        if start >= end:
            raise ValueError('Booking windows must end after they start on the same day')
        return self


def valid_windows(windows):
    ordered = sorted(windows, key=lambda w: w.start)
    if any(a.end > b.start for a, b in zip(ordered, ordered[1:])):
        raise ValueError('Booking windows must not overlap')
    return ordered


class BookingSettings(StrictModel):
    enabled: bool = False
    weekly: dict[int, list[BookingWindow]] = Field(default_factory=dict, max_length=7)
    interval_minutes: Literal[15, 30, 60] = 30
    minimum_notice_minutes: int = Field(default=60, ge=0, le=10080)
    horizon_days: int = Field(default=60, ge=1, le=365)
    min_guests: int = Field(default=1, ge=1, le=100)
    max_guests: int = Field(default=8, ge=1, le=100)
    max_reservations_per_slot: int = Field(default=10, ge=1, le=1000)
    max_guests_per_slot: int = Field(default=30, ge=1, le=1000)
    retention_days: int = Field(default=180, ge=30, le=730)

    @model_validator(mode='after')
    def valid(self):
        if self.min_guests > self.max_guests or self.max_guests > self.max_guests_per_slot:
            raise ValueError('Guest limits are inconsistent')
        if any(day not in range(7) or len(windows) > 8 for day, windows in self.weekly.items()):
            raise ValueError('Use weekdays 0 to 6 and at most eight windows per day')
        self.weekly = {day: valid_windows(windows) for day, windows in self.weekly.items()}
        return self


class SettingsResult(StrictModel):
    settings: BookingSettings
    conflicting_bookings: int = 0


class DateException(StrictModel):
    day: date
    closed: bool = True
    windows: list[BookingWindow] = Field(default_factory=list, max_length=8)

    @model_validator(mode='after')
    def valid(self):
        if self.closed and self.windows:
            raise ValueError('Closed dates cannot contain opening windows')
        if not self.closed and not self.windows:
            raise ValueError('Special opening dates require booking windows')
        self.windows = valid_windows(self.windows)
        return self


class PromotionText(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default='', max_length=500)
    scope: str = Field(min_length=1, max_length=180)
    conditions: str = Field(default='', max_length=1000)


class PromotionInput(PromotionText):
    enabled: bool = False
    automatic: bool = True
    percentage: Decimal = Field(gt=0, le=100, max_digits=5, decimal_places=2, allow_inf_nan=False)
    start_date: date
    end_date: date
    weekdays: list[int] = Field(default_factory=lambda: list(range(7)), min_length=1, max_length=7)
    windows: list[BookingWindow] = Field(default_factory=list, max_length=8)
    translations: dict[Literal['en-GB', 'de-DE'], PromotionText] = Field(default_factory=dict)

    @model_validator(mode='after')
    def valid(self):
        if self.end_date < self.start_date or any(day not in range(7) for day in self.weekdays) or len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError('Invalid promotion dates or weekdays')
        self.windows = valid_windows(self.windows)
        return self


class PromotionAdmin(PromotionInput):
    id: int


class Award(PromotionText):
    id: int
    percentage: str


class PublicSettings(StrictModel):
    enabled: bool
    timezone: str = 'Europe/Lisbon'
    today: date
    last_date: date
    min_guests: int
    max_guests: int


class Slot(StrictModel):
    time: str
    available: bool
    promotion: Award | None = None


class Availability(StrictModel):
    day: date
    slots: list[Slot]


class BookingInput(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    day: date
    time: str = Field(pattern=r'^\d{2}:\d{2}$')
    guests: int = Field(ge=1, le=100)
    email: EmailStr | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=32)
    special_requests: str | None = Field(default=None, max_length=1000)
    idempotency_key: str = Field(pattern=r'^[a-f0-9]{64}$')

    @field_validator('email', 'phone', 'special_requests', mode='before')
    @classmethod
    def empty_is_none(cls, value):
        return None if isinstance(value, str) and not value.strip() else value

    @field_validator('phone')
    @classmethod
    def phone_format(cls, value):
        if value and (not re.fullmatch(r'\+?[0-9 ()\-]{7,32}', value) or not 7 <= len(re.sub(r'\D', '', value)) <= 15):
            raise ValueError('Invalid phone number')
        return value

    @field_validator('time')
    @classmethod
    def valid_time(cls, value):
        time.fromisoformat(value)
        return value


class PrivateAccess(StrictModel):
    token: str = Field(pattern=r'^[a-f0-9]{64}$')
    locale: Locale = 'pt-PT'


class PassResponse(StrictModel):
    reference: str
    name: str
    day: date
    time: str
    guests: int
    status: ReservationStatus
    restaurant_name: str
    restaurant_address: str
    promotion: Award | None = None
    contact_provided: bool
    can_cancel: bool


class BookingCreated(PassResponse):
    confirmation_token: str


class AdminBooking(PassResponse):
    id: int
    email: str | None
    phone: str | None
    special_requests: str | None
    created_at: datetime


class BookingPage(StrictModel):
    items: list[AdminBooking]
    page: int
    per_page: int
    total: int
    total_pages: int


class StatusUpdate(StrictModel):
    status: ReservationStatus


class DeleteResult(StrictModel):
    deleted: int
