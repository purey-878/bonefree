"""Checkout/order schemas."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator
from .customization import ItemCustomization
from .id_types import ProductId
from utils.validation import normalize_phone, validate_email, validate_name, validate_nif


class CheckoutCustomer(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=80)
    email: str = Field(..., min_length=3, max_length=150)
    phone: Optional[str] = Field(None, max_length=30)
    nif: Optional[str] = Field(None, max_length=20)
    table_number: Optional[int] = Field(None, ge=1, le=999)

    @field_validator("first_name", "last_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        name = validate_name(value)
        if not name:
            raise ValueError("Introduza um nome completo valido.")
        return name

    @field_validator("email")
    @classmethod
    def check_email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: Optional[str]) -> Optional[str]:
        phone = normalize_phone(value)
        return phone

    @field_validator("nif")
    @classmethod
    def check_nif(cls, value: Optional[str]) -> Optional[str]:
        return validate_nif(value)


class CheckoutItem(BaseModel):
    id_produto: ProductId
    quantidade: int = Field(..., ge=1)
    customizacao: Optional[ItemCustomization] = None


class CheckoutRequest(BaseModel):
    customer: CheckoutCustomer
    fulfillment_method: str = Field(..., pattern="^(dine_in|pickup|takeaway)$")
    payment_method: str = Field(..., pattern="^(card|cash|mbway|qr_pay)$")
    items: List[CheckoutItem] = []
    promo_code: Optional[str] = Field(None, max_length=50)


class CouponValidationRequest(BaseModel):
    codigo: str = Field(..., min_length=1, max_length=50)
    subtotal: Decimal = Field(..., ge=0)


class CouponValidationResponse(BaseModel):
    codigo: str
    desconto: Decimal
    valor: Decimal
    tipo: str
    valor_minimo_pedido: Decimal


class CouponResponse(BaseModel):
    id_cupom: int
    codigo: str
    tipo: str
    valor: Decimal
    valor_minimo_pedido: Decimal
    expira_em: Optional[datetime] = None


class OrderItemResponse(BaseModel):
    id_produto: int
    id_produto_display: str
    nome_produto: str
    preco_unitario: Decimal
    quantidade: int
    subtotal: Decimal
    customizacao: Optional[ItemCustomization] = None
    imagem: Optional[str] = None
    calorias: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    id_pedido: int
    numero_pedido: str
    status: str
    estado_pagamento: str
    can_cancel: bool = False
    cancellation_source: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    refund_status: str = "None"
    refund_amount: Optional[Decimal] = None
    refund_reason: Optional[str] = None
    refund_date: Optional[datetime] = None
    metodo_entrega: str
    metodo_pagamento: str
    subtotal: Decimal
    desconto: Decimal = Decimal("0")
    taxa_entrega: Decimal
    taxa_servico: Decimal
    total: Decimal
    cupom_codigo: Optional[str] = None
    cupom_gerado: Optional[str] = None
    data_criacao: datetime
    itens: List[OrderItemResponse]

    model_config = ConfigDict(from_attributes=True)
