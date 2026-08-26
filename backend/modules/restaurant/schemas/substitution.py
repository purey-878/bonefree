"""Schemas for unavailable-product substitutions and similar dishes."""

from pydantic import BaseModel
from typing import List, Optional


class ProductSuggestion(BaseModel):
    """Ranked product suggestion returned when an item is unavailable."""

    product_id: int
    product_display_id: str
    name: str
    category: str
    price: Optional[float]
    score: float
    reason: str


class AvailabilitySuggestionResponse(BaseModel):
    """Availability state plus replacement and alternative dish suggestions."""

    product_id: int
    product_display_id: str
    name: str
    available: bool
    availability_reason: str
    substitutes: List[ProductSuggestion]
    similar_dishes: List[ProductSuggestion]
