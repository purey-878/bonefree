"""Shared pagination response models."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field


ItemT = TypeVar("ItemT")


class PaginatedResponse(BaseModel, Generic[ItemT]):
    """Typed page envelope used by collection endpoints."""

    items: list[ItemT] = Field(default_factory=list)
    page: int = Field(ge=1)
    per_page: int = Field(ge=1, le=100)
    total: int = Field(ge=0)
    total_pages: int = Field(ge=0)


def total_pages(total: int, per_page: int) -> int:
    """Return the number of pages required for a collection."""

    return (total + per_page - 1) // per_page if total else 0
