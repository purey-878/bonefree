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
    tax_id: Optional[str] = Field(None, max_length=20)
    table_number: Optional[int] = Field(None, ge=1, le=999)

    @field_validator("first_name", "last_name")
    @classmethod
    def check_name(cls, value: str) -> str:
        name = validate_name(value)
        if not name:
            raise ValueError("Introduza um name completo valido.")
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

    @field_validator("tax_id")
    @classmethod
    def check_nif(cls, value: Optional[str]) -> Optional[str]:
        return validate_nif(value)


class CheckoutItem(BaseModel):
    product_id: ProductId
    quantity: int = Field(..., ge=1)
    customization: Optional[ItemCustomization] = None


class CheckoutRequest(BaseModel):
    customer: CheckoutCustomer
    fulfillment_method: str = Field(..., pattern="^(dine_in|pickup|takeaway)$")
    payment_method: str = Field(..., pattern="^(card|cash|mbway|qr_pay)$")
    items: List[CheckoutItem] = []
    promo_code: Optional[str] = Field(None, max_length=50)


class CouponValidationRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    subtotal: Decimal = Field(..., ge=0)


class CouponValidationResponse(BaseModel):
    code: str
    discount: Decimal
    value: Decimal
    type: str
    minimum_order_value: Decimal


class CouponResponse(BaseModel):
    coupon_id: int
    code: str
    type: str
    value: Decimal
    minimum_order_value: Decimal
    expires_at: Optional[datetime] = None


class OrderItemResponse(BaseModel):
    product_id: int
    product_display_id: str
    product_name: str
    unit_price: Decimal
    quantity: int
    subtotal: Decimal
    customization: Optional[ItemCustomization] = None
    image: Optional[str] = None
    calorias: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    order_id: int
    order_number: str
    status: str
    payment_status: str
    can_cancel: bool = False
    cancellation_source: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    refund_status: str = "None"
    refund_amount: Optional[Decimal] = None
    refund_reason: Optional[str] = None
    refund_date: Optional[datetime] = None
    delivery_method: str
    payment_method: str
    subtotal: Decimal
    discount: Decimal = Decimal("0")
    delivery_fee: Decimal
    service_fee: Decimal
    total: Decimal
    coupon_code: Optional[str] = None
    generated_coupon: Optional[str] = None
    created_at: datetime
    items: List[OrderItemResponse]

    model_config = ConfigDict(from_attributes=True)
