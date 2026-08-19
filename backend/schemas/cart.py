"""Cart/Cart schemas for API validation."""

from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from decimal import Decimal
from .customization import ItemCustomization
from .id_types import ProductId


class CartItemOut(BaseModel):
    """Response model for a cart item."""
    cart_product_id: int
    product_id: int
    product_display_id: str
    name: str
    price: Decimal
    quantity: int
    stock: int
    image_path: Optional[str] = None
    customization: Optional[ItemCustomization] = None
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


class CartOut(BaseModel):
    """Response model for the entire cart."""
    cart_id: Optional[int] = None
    items: List[CartItemOut]
    total: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class AddItemSchema(BaseModel):
    """Request model for adding an item to cart."""
    product_id: ProductId
    quantity: int = 1
    customization: Optional[ItemCustomization] = None


class UpdateItemSchema(BaseModel):
    """Request model for updating cart item quantity."""
    product_id: ProductId
    quantity: int
    cart_product_id: Optional[int] = None


class GuestCartItem(BaseModel):
    """Model for guest cart items (localStorage)."""
    product_id: ProductId
    quantity: int
    customization: Optional[ItemCustomization] = None


class MergeCartSchema(BaseModel):
    """Request model for merging guest cart on login."""
    items: List[GuestCartItem]


class MergeResult(BaseModel):
    """Response model for cart merge operation."""
    merged: List[int]          # product ids successfully merged
    capped: List[int]          # product ids where qty was capped to stock
    skipped: List[int]         # product ids skipped (out of stock)
    cart: CartOut
