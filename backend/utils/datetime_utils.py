from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return the current UTC datetime as a timezone-aware value."""
    return datetime.now(timezone.utc)


def naive_utc_now() -> datetime:
    """Return the current UTC datetime without tzinfo for legacy naive DB columns."""
    return utc_now().replace(tzinfo=None)


def to_naive_utc(value: datetime | None) -> datetime | None:
    """Convert an aware datetime to naive UTC, preserving None and naive values."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)