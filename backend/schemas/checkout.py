"""Checkout/order schemas."""

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator

from schemas.enums import (
    CancellationOrigin,
    CheckoutPaymentMethod,
    CouponType,
    FulfillmentMethod,
    OrderState,
    PaymentMethod,
    PaymentStatus,
)
from .customization import ItemCustomization
from .media import ProductMediaResponse
from .id_types import ProductId
from utils.validation import normalize_phone, validate_email, validate_name, validate_portuguese_tax_id


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
            raise ValueError("Enter a valid full name.")
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
    def check_tax_id(cls, value: Optional[str]) -> Optional[str]:
        return validate_portuguese_tax_id(value)


class CheckoutItem(BaseModel):
    product_id: ProductId
    quantity: int = Field(..., ge=1, le=99)
    customization: Optional[ItemCustomization] = None


class CheckoutRequest(BaseModel):
    customer: CheckoutCustomer
    fulfillment_method: FulfillmentMethod
    payment_method: CheckoutPaymentMethod
    items: List[CheckoutItem] = []
    promo_code: Optional[str] = Field(None, max_length=50)


class CouponValidationRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    subtotal: Decimal = Field(..., ge=0)


class CouponValidationResponse(BaseModel):
    code: str
    discount: Decimal
    value: Decimal
    type: CouponType
    minimum_order_value: Decimal


class CouponResponse(BaseModel):
    coupon_id: int
    code: str
    type: CouponType
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
    media: Optional[ProductMediaResponse] = None
    calories: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    order_id: int
    order_number: str
    status: OrderState
    payment_status: PaymentStatus
    can_cancel: bool = False
    cancellation_source: Optional[CancellationOrigin] = None
    cancelled_at: Optional[datetime] = None
    delivery_method: FulfillmentMethod
    payment_method: PaymentMethod
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


class OrderCreateResponse(OrderResponse):
    order_access_token: Optional[str] = None
    order_access_expires_at: Optional[datetime] = None
