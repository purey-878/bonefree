"""Shared schemas for per-item order customizations."""

from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
from .id_types import ProductId


class CustomizationExtraSelection(BaseModel):
    option_id: int
    quantity: int = Field(1, ge=1)


class CustomizationSubstitutionSelection(BaseModel):
    id_ingrediente_original: int
    id_ingrediente_novo: int


class CustomizedCartItemRequest(BaseModel):
    product_id: ProductId
    quantity: int = Field(1, ge=1)
    ingredientes_removidos: List[int] = Field(default_factory=list)
    extras: List[CustomizationExtraSelection] = Field(default_factory=list)
    substituicoes: List[CustomizationSubstitutionSelection] = Field(default_factory=list)
    observacoes: Optional[str] = Field(None, max_length=255)


class CustomizationIngredientResponse(BaseModel):
    ingredient_id: int
    name: str
    type: str
    removable: bool
    substitutable: bool
    included_by_default: bool


class CustomizationOptionResponse(BaseModel):
    option_id: int
    ingredient_id: Optional[int] = None
    name: str
    type: str
    extra_price: Decimal
    max_quantity: int


class ProductCustomizationResponse(BaseModel):
    product_id: int
    id_produto_display: str
    name: str
    customizable: bool
    preco_base: Decimal
    ingredients: List[CustomizationIngredientResponse]
    ingredientes_removiveis: List[CustomizationIngredientResponse]
    ingredientes_substituiveis: List[CustomizationIngredientResponse]
    opcoes: dict[str, List[CustomizationOptionResponse]]


class ItemCustomization(BaseModel):
    """Customer choices applied to a single cart/order line."""

    remove: List[str] = Field(default_factory=list, max_length=12)
    add: List[str] = Field(default_factory=list, max_length=12)
    preferences: List[str] = Field(default_factory=list, max_length=12)
    note: Optional[str] = Field(default=None, max_length=280)
    ingredientes_removidos: List[int] = Field(default_factory=list, max_length=24)
    extras: List[CustomizationExtraSelection] = Field(default_factory=list, max_length=24)
    substituicoes: List[CustomizationSubstitutionSelection] = Field(default_factory=list, max_length=24)
    preco_unitario_final: Optional[Decimal] = None

    @field_validator("remove", "add", "preferences", mode="before")
    @classmethod
    def normalize_choice_list(cls, value):
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("As escolhas de customização devem ser uma lista.")

        normalized = []
        seen = set()
        for raw_item in value:
            item = str(raw_item).strip()
            if not item:
                continue
            item = item[:60]
            key = item.lower()
            if key not in seen:
                seen.add(key)
                normalized.append(item)
        return normalized

    @field_validator("note", mode="before")
    @classmethod
    def normalize_note(cls, value):
        if value is None:
            return None

        note = str(value).strip()
        return note or None


class ProductCustomizationOptions(BaseModel):
    """Selectable customization options generated for a product."""

    remove: List[str]
    add: List[str]
    preferences: List[str]
