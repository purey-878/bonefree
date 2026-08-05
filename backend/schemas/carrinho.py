"""Cart/Carrinho schemas for API validation."""

from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from decimal import Decimal
from .customization import ItemCustomization
from .id_types import ProductId


class CarrinhoItemOut(BaseModel):
    """Response model for a cart item."""
    cart_log_id: int
    id_produto: int
    id_produto_display: str
    nome: str
    preco: Decimal
    quantidade: int
    stock: int
    caminho_imagem: Optional[str] = None
    customizacao: Optional[ItemCustomization] = None
    subtotal: Decimal

    model_config = ConfigDict(from_attributes=True)


class CarrinhoOut(BaseModel):
    """Response model for the entire cart."""
    id_carrinho: Optional[int] = None
    itens: List[CarrinhoItemOut]
    total: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class AdicionarItemSchema(BaseModel):
    """Request model for adding an item to cart."""
    id_produto: ProductId
    quantidade: int = 1
    customizacao: Optional[ItemCustomization] = None


class AtualizarItemSchema(BaseModel):
    """Request model for updating cart item quantity."""
    id_produto: ProductId
    quantidade: int
    cart_log_id: Optional[int] = None


class GuestCartItem(BaseModel):
    """Model for guest cart items (localStorage)."""
    id_produto: ProductId
    quantidade: int
    customizacao: Optional[ItemCustomization] = None


class MergeCarrinhoSchema(BaseModel):
    """Request model for merging guest cart on login."""
    itens: List[GuestCartItem]


class MergeResultado(BaseModel):
    """Response model for cart merge operation."""
    merged: List[int]          # product ids successfully merged
    capped: List[int]          # product ids where qty was capped to stock
    skipped: List[int]         # product ids skipped (out of stock)
    carrinho: CarrinhoOut
