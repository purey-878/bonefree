"""Admin schemas for API validation."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import date, datetime

from schemas.enums import (
    ADMIN_ROLES,
    CancellationOrigin,
    EntityStatus,
    FulfillmentMethod,
    IngredientType,
    OrderState,
    PaymentMethod,
    PaymentStatus,
    RefundMethod,
    RefundReason,
    RefundStatus,
    UserRole,
    UserStatus,
    enum_values,
    normalize_admin_role,
)
from .id_types import CategoryId, ProductId

ORDER_STATES = set(enum_values(OrderState))
KITCHEN_ORDER_STATES = {
    OrderState.CONFIRMED.value,
    OrderState.IN_PREPARATION.value,
    OrderState.READY.value,
}
INGREDIENT_TYPES = set(enum_values(IngredientType))


class AdminLogin(BaseModel):
    """Request model for admin login."""
    email: str
    password: str


class AdminResponse(BaseModel):
    """Response model for authenticated admin."""
    admin_id: int
    name: str
    email: str
    role: UserRole
    status: UserStatus

    model_config = ConfigDict(from_attributes=True)


class AdminTokenResponse(BaseModel):
    """Response model for admin authentication endpoints."""
    access_token: str
    token_type: str
    admin: AdminResponse


class StaffAdminCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = UserRole.MANAGER
    status: UserStatus = UserStatus.ACTIVE

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | UserRole) -> UserRole:
        normalized = normalize_admin_role(value)
        if normalized not in ADMIN_ROLES:
            raise ValueError("Role must be owner, manager, waiter, or chef.")
        return normalized


class StaffAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: Optional[str | UserRole]) -> Optional[UserRole]:
        if value is None:
            return value
        normalized = normalize_admin_role(value)
        if normalized not in ADMIN_ROLES:
            raise ValueError("Role must be owner, manager, waiter, or chef.")
        return normalized


class CustomerAdminResponse(BaseModel):
    customer_id: int
    name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    status: Optional[UserStatus] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerAdminCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    phone: Optional[str] = Field(None, max_length=20)
    tax_id: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    status: UserStatus = UserStatus.ACTIVE


class CustomerAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    phone: Optional[str] = Field(None, max_length=20)
    tax_id: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    status: Optional[UserStatus] = None


# Product Management Schemas
class ProductIngredientPayload(BaseModel):
    """Ingredient assignment for a product."""
    ingredient_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    type: IngredientType = IngredientType.NORMAL
    included_by_default: bool = True
    removable: bool = True
    substitutable: bool = False
    quantity: Optional[str] = Field(None, max_length=50)
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: str | IngredientType) -> IngredientType:
        if isinstance(value, IngredientType):
            return value
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Invalid ingredient type.")
        return IngredientType(normalized)


class IngredientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    type: IngredientType = IngredientType.NORMAL
    status: EntityStatus = EntityStatus.ACTIVE
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: str | IngredientType) -> IngredientType:
        if isinstance(value, IngredientType):
            return value
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Invalid ingredient type.")
        return IngredientType(normalized)


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    type: Optional[IngredientType] = None
    status: Optional[EntityStatus] = None
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: Optional[str | IngredientType]) -> Optional[IngredientType]:
        if value is None or isinstance(value, IngredientType):
            return value
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Invalid ingredient type.")
        return IngredientType(normalized)


class IngredientResponse(BaseModel):
    ingredient_id: int
    name: str
    type: IngredientType
    status: EntityStatus
    calories_per_gram: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class ProductIngredientResponse(BaseModel):
    ingredient_id: int
    name: str
    type: IngredientType
    included_by_default: bool = True
    removable: bool = True
    substitutable: bool = False
    quantity: Optional[str] = None
    calories_per_gram: Optional[float] = None


class ProductBase(BaseModel):
    """Base product schema for create/update."""
    name: str
    product_description: Optional[str] = None
    price: float
    stock: int
    category_id: CategoryId
    customizable: bool = True
    menu_tags: Optional[str] = None
    featured: bool = False
    discount_percentage: float = Field(0, ge=0, le=100)
    gluten_free: bool = False
    contains_alcohol: bool = False
    total_calories: Optional[float] = Field(None, ge=0)
    ingredients: List[ProductIngredientPayload] = Field(default_factory=list)

    @field_validator("menu_tags")
    @classmethod
    def normalize_menu_tags(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        tags: list[str] = []
        seen: set[str] = set()
        for tag in value.split(","):
            normalized = tag.strip()
            key = normalized.casefold()
            if normalized and key not in seen:
                tags.append(normalized[:40])
                seen.add(key)
        return ", ".join(tags) or None


class ProductCreate(ProductBase):
    """Schema for creating a product."""
    pass


class ProductUpdate(BaseModel):
    """Schema for updating a product."""
    name: Optional[str] = None
    product_description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    category_id: Optional[CategoryId] = None
    status: Optional[EntityStatus] = None
    customizable: Optional[bool] = None
    menu_tags: Optional[str] = None
    featured: Optional[bool] = None
    discount_percentage: Optional[float] = Field(None, ge=0, le=100)
    gluten_free: Optional[bool] = None
    contains_alcohol: Optional[bool] = None
    total_calories: Optional[float] = Field(None, ge=0)
    ingredients: Optional[List[ProductIngredientPayload]] = None

    @field_validator("menu_tags")
    @classmethod
    def normalize_menu_tags(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        tags: list[str] = []
        seen: set[str] = set()
        for tag in value.split(","):
            normalized = tag.strip()
            key = normalized.casefold()
            if normalized and key not in seen:
                tags.append(normalized[:40])
                seen.add(key)
        return ", ".join(tags) or None


class ProductImageResponse(BaseModel):
    """Response model for product image."""
    image_id: int
    image_path: str

    model_config = ConfigDict(from_attributes=True)


class ProductImageUploadResponse(BaseModel):
    message: str
    filename: str
    url: str
    image_path: str


class ProductAdminResponse(BaseModel):
    """Response model for product in admin context."""
    product_id: int
    product_display_id: str
    name: str
    product_description: Optional[str]
    price: float
    stock: int
    category_id: int
    category_display_id: str
    sold: Optional[int]
    status: Optional[EntityStatus]
    customizable: bool = True
    menu_tags: Optional[str] = None
    featured: bool = False
    discount_percentage: float = 0
    gluten_free: bool = False
    contains_alcohol: bool = False
    total_calories: Optional[float] = None
    deleted_at: Optional[datetime]
    images: Optional[List[ProductImageResponse]] = []
    ingredients: List[ProductIngredientResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Order Schemas
class CartItemResponse(BaseModel):
    """Response model for cart item."""
    product_id: int
    product_display_id: str
    name: str
    quantity: int
    price: float
    total: float
    customization: Optional[str] = None
    customization_summary: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    """Response model for order."""
    order_id: int
    customer_id: int
    customer_email: str
    customer_name: Optional[str]
    customer_phone: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    state: OrderState
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    total: float
    notes: Optional[str] = None
    fulfillment_method: FulfillmentMethod = FulfillmentMethod.PICKUP
    table_number: Optional[int] = None
    canceled_at: Optional[datetime] = None
    cancellation_origin: Optional[CancellationOrigin] = None
    refund_status: Optional[RefundStatus] = None
    refund_id: Optional[int] = None
    refund_amount: Optional[float] = None
    refund_reason: Optional[RefundReason] = None
    refund_notes: Optional[str] = None
    refund_processed_by: Optional[str] = None
    refund_processed_by_role: Optional[str] = None
    refund_date: Optional[datetime] = None
    total_items: int
    items: List[CartItemResponse]

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    state: OrderState

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str | OrderState) -> OrderState:
        if isinstance(value, OrderState):
            return value
        if value not in ORDER_STATES:
            raise ValueError("Invalid order state.")
        return OrderState(value)


class CounterPaymentResponse(BaseModel):
    message: str
    order: OrderResponse


class KitchenOrderResponse(BaseModel):
    """Reduced order response for kitchen preparation screens."""
    order_id: int
    created_at: datetime
    state: OrderState
    notes: Optional[str] = None
    fulfillment_method: FulfillmentMethod = FulfillmentMethod.PICKUP
    table_number: Optional[int] = None
    updated_at: Optional[datetime] = None
    total_items: int
    items: List[CartItemResponse]


class RefundOrderResponse(BaseModel):
    message: str
    order: OrderResponse


class RefundRequest(BaseModel):
    amount: float = Field(..., gt=0)
    reason: RefundReason
    notes: str = Field(..., min_length=1, max_length=1000)


class RefundResponse(BaseModel):
    refund_id: int
    order_id: int
    receipt_number: str
    order_number: str
    original_invoice_number: str
    customer_name: str
    customer_email: str
    amount: float
    reason: RefundReason
    notes: str
    processed_by: str
    processed_by_role: str
    date: datetime
    status: RefundStatus
    refund_method: RefundMethod

    model_config = ConfigDict(from_attributes=True)


# Analytics Schemas
class LowStockProduct(BaseModel):
    """Response for low stock product."""
    product_id: int
    product_display_id: str
    name: str
    stock: int
    price: float
    category: str


class PopularProduct(BaseModel):
    """Response for popular product."""
    product_id: int
    product_display_id: str
    name: str
    sold: int
    price: float
    category: str


class PeriodicSalesResponse(BaseModel):
    """Response for sales in a period."""
    period: str
    total_sales: float
    quantity_sold: int
    order_count: int


class SalesPerformanceResponse(BaseModel):
    """Response for sales performance analytics."""
    total_sales: float
    quantity_sold: int
    order_count: int
    period: str
    sales_by_day: List[PeriodicSalesResponse]


class DashboardSalesGraphs(BaseModel):
    """Sales graph data for dashboard overview."""
    by_hour: List[PeriodicSalesResponse]
    by_day: List[PeriodicSalesResponse]
    by_month: List[PeriodicSalesResponse]
    by_year: List[PeriodicSalesResponse]


class ProductAnalyticsResponse(BaseModel):
    """Analytics for a single product."""
    product_id: int
    product_display_id: str
    total_sales: float
    quantity_sold: int
    order_count: int
    current_price: float
    current_stock: int
    average_rating: Optional[float] = None
    total_reviews: int
    sales_by_day: List[PeriodicSalesResponse]


class AnalyticsSeriesPoint(BaseModel):
    """Point for a generic analytics chart."""
    period: str
    label: str
    value: float
    quantity_sold: int = 0
    order_count: int = 0


class AnalyticsSeriesResponse(BaseModel):
    """Generic analytics time series response."""
    metric: str
    range: str
    start_date: str
    end_date: str
    total: float
    points: List[AnalyticsSeriesPoint]


class DashboardAnalytics(BaseModel):
    """Dashboard analytics response."""
    total_products: int
    total_categories: int
    total_customers: int
    total_carts: int
    low_stock_products: List[LowStockProduct]
    popular_products: List[PopularProduct]
    sales_charts: DashboardSalesGraphs


class CategoryResponse(BaseModel):
    """Response model for category."""
    category_id: int
    category_display_id: str
    category_name: str
    category_description: Optional[str] = None
    status: Optional[EntityStatus] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryCreate(BaseModel):
    """Schema for creating a category."""
    category_name: str
    category_description: Optional[str] = None


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    category_name: Optional[str] = None
    category_description: Optional[str] = None
    status: Optional[EntityStatus] = None
