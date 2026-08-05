"""Schemas for stock-out substitutions and similar dish suggestions."""

from pydantic import BaseModel
from typing import List, Optional


class StockSuggestion(BaseModel):
    """Ranked product suggestion returned when an item is unavailable."""

    id_produto: int
    id_produto_display: str
    nome: str
    categoria: str
    preco: Optional[float]
    stock: int
    score: float
    reason: str


class AvailabilitySuggestionResponse(BaseModel):
    """Availability state plus replacement and alternative dish suggestions."""

    id_produto: int
    id_produto_display: str
    nome: str
    requested_quantity: int
    stock_threshold: int
    available: bool
    availability_reason: str
    substitutes: List[StockSuggestion]
    similar_dishes: List[StockSuggestion]
