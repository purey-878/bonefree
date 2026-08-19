"""Admin schemas for API validation."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import date, datetime
from .id_types import CategoryId, ProductId

ADMIN_ROLES = {"super_admin", "staff_admin", "chef"}
ORDER_STATES = {"pendente", "confirmada", "em_preparacao", "pronta", "entregue", "cancelada", "reembolsada"}
KITCHEN_ORDER_STATES = {"confirmada", "em_preparacao", "pronta"}
INGREDIENT_TYPES = {"INGREDIENTES_NORMAIS", "MOLHO", "EXTRA", "BEBIDA", "BASE", "ACOMPANHAMENTO"}


class AdminLogin(BaseModel):
    """Request model for admin login."""
    email: str
    password: str


class AdminResponse(BaseModel):
    """Response model for authenticated admin."""
    admin_id: int
    name: str
    email: str
    role: str
    status: int

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
    role: str = "staff_admin"
    status: int = 1

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ADMIN_ROLES:
            raise ValueError("A função deve ser super_admin, staff_admin ou chef.")
        return value


class StaffAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    role: Optional[str] = None
    status: Optional[int] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in ADMIN_ROLES:
            raise ValueError("A função deve ser super_admin, staff_admin ou chef.")
        return value


class ClienteAdminResponse(BaseModel):
    customer_id: int
    name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    status: Optional[int] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClienteAdminCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    phone: Optional[str] = Field(None, max_length=20)
    tax_id: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    status: int = 1


class ClienteAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    phone: Optional[str] = Field(None, max_length=20)
    tax_id: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)
    status: Optional[int] = None


# Product Management Schemas
class ProductIngredientPayload(BaseModel):
    """Ingredient assignment for a product."""
    ingredient_id: Optional[int] = None
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    type: str = "INGREDIENTES_NORMAIS"
    included_by_default: bool = True
    removable: bool = True
    substitutable: bool = False
    quantity: Optional[str] = Field(None, max_length=50)
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingredient inválido.")
        return normalized


class IngredientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    type: str = "INGREDIENTES_NORMAIS"
    status: int = 1
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingredient inválido.")
        return normalized


class IngredientUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    type: Optional[str] = None
    status: Optional[int] = None
    calories_per_gram: Optional[float] = Field(None, ge=0)

    @field_validator("type")
    @classmethod
    def validate_tipo(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingredient inválido.")
        return normalized


class IngredientResponse(BaseModel):
    ingredient_id: int
    name: str
    type: str
    status: int
    calories_per_gram: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class ProductIngredientResponse(BaseModel):
    ingredient_id: int
    name: str
    type: str
    included_by_default: bool = True
    removable: bool = True
    substitutable: bool = False
    quantity: Optional[str] = None
    calories_per_gram: Optional[float] = None


class ProdutoBase(BaseModel):
    """Base product schema for create/update."""
    name: str
    product_description: Optional[str] = None
    price: float
    stock: int
    category_id: CategoryId
    customizable: bool = True
    menu_tags: Optional[str] = None
    featured: bool = False
    desconto_percentual: float = Field(0, ge=0, le=100)
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


class ProdutoCreate(ProdutoBase):
    """Schema for creating a product."""
    pass


class ProdutoUpdate(BaseModel):
    """Schema for updating a product."""
    name: Optional[str] = None
    product_description: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None
    category_id: Optional[CategoryId] = None
    status: Optional[int] = None
    customizable: Optional[bool] = None
    menu_tags: Optional[str] = None
    featured: Optional[bool] = None
    desconto_percentual: Optional[float] = Field(None, ge=0, le=100)
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


class ImagemProdutoResponse(BaseModel):
    """Response model for product image."""
    id_imagem: int
    image_path: str

    model_config = ConfigDict(from_attributes=True)


class ProdutoAdminResponse(BaseModel):
    """Response model for product in admin context."""
    product_id: int
    id_produto_display: str
    name: str
    product_description: Optional[str]
    price: float
    stock: int
    category_id: int
    id_categoria_display: str
    sold: Optional[int]
    status: Optional[int]
    customizable: bool = True
    menu_tags: Optional[str] = None
    featured: bool = False
    desconto_percentual: float = 0
    gluten_free: bool = False
    contains_alcohol: bool = False
    total_calories: Optional[float] = None
    deleted_at: Optional[datetime]
    imagens: Optional[List[ImagemProdutoResponse]] = []
    ingredients: List[ProductIngredientResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Order Schemas
class CartItemResponse(BaseModel):
    """Response model for cart item."""
    product_id: int
    id_produto_display: str
    name: str
    quantity: int
    price: float
    total: float
    customization: Optional[str] = None
    customizacao_resumo: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    """Response model for order."""
    cart_id: int
    customer_id: int
    cliente_email: str
    cliente_nome: Optional[str]
    cliente_telefone: Optional[str] = None
    created_at: datetime
    state: str
    payment_method: str
    payment_status: str
    total: float
    notes: Optional[str] = None
    fulfillment_method: str = "pickup"
    table_number: Optional[int] = None
    canceled_at: Optional[datetime] = None
    cancellation_origin: Optional[str] = None
    refund_status: str = "None"
    refund_id: Optional[int] = None
    refund_amount: Optional[float] = None
    refund_reason: Optional[str] = None
    refund_notes: Optional[str] = None
    refund_processed_by: Optional[str] = None
    refund_processed_by_role: Optional[str] = None
    refund_date: Optional[datetime] = None
    total_items: int
    items: List[CartItemResponse]

    model_config = ConfigDict(from_attributes=True)


class OrderStatusUpdate(BaseModel):
    state: str

    @field_validator("state")
    @classmethod
    def validate_estado(cls, value: str) -> str:
        if value not in ORDER_STATES:
            raise ValueError("Estado do pedido inválido.")
        return value


class CounterPaymentResponse(BaseModel):
    message: str
    order: OrderResponse


class KitchenOrderResponse(BaseModel):
    """Reduced order response for kitchen preparation screens."""
    cart_id: int
    created_at: datetime
    state: str
    notes: Optional[str] = None
    fulfillment_method: str = "pickup"
    table_number: Optional[int] = None
    updated_at: Optional[datetime] = None
    total_items: int
    items: List[CartItemResponse]


class RefundOrderResponse(BaseModel):
    message: str
    order: OrderResponse


REFUND_REASONS = {
    "Customer changed mind",
    "Wrong order served",
    "Missing item",
    "Food quality issue",
    "Payment issue",
    "Duplicate payment",
    "Other",
}


class RefundRequest(BaseModel):
    amount: float = Field(..., gt=0)
    reason: str
    notes: str = Field(..., min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        if value not in REFUND_REASONS:
            raise ValueError("Motivo do refund inválido.")
        return value


class RefundResponse(BaseModel):
    refund_id: int
    order_id: int
    receipt_number: str
    order_number: str
    original_invoice_number: str
    customer_name: str
    customer_email: str
    amount: float
    reason: str
    notes: str
    processed_by: str
    processed_by_role: str
    date: datetime
    status: str
    refund_method: str

    model_config = ConfigDict(from_attributes=True)


# Analytics Schemas
class ProdutoEstoqueMinimo(BaseModel):
    """Response for low stock product."""
    product_id: int
    id_produto_display: str
    name: str
    stock: int
    price: float
    category: str


class ProdutoPopular(BaseModel):
    """Response for popular product."""
    product_id: int
    id_produto_display: str
    name: str
    sold: int
    price: float
    category: str


class VendaPeriodicaResponse(BaseModel):
    """Response for sales in a period."""
    periodo: str
    total_vendas: float
    quantidade_vendida: int
    numero_pedidos: int


class SalesPerformanceResponse(BaseModel):
    """Response for sales performance analytics."""
    total_vendas: float
    quantidade_vendida: int
    numero_pedidos: int
    periodo: str
    vendas_por_dia: List[VendaPeriodicaResponse]


class DashboardSalesGraphs(BaseModel):
    """Sales graph data for dashboard overview."""
    por_hora: List[VendaPeriodicaResponse]
    por_dia: List[VendaPeriodicaResponse]
    por_mes: List[VendaPeriodicaResponse]
    por_ano: List[VendaPeriodicaResponse]


class ProductAnalyticsResponse(BaseModel):
    """Analytics for a single product."""
    product_id: int
    id_produto_display: str
    total_vendas: float
    quantidade_vendida: int
    numero_pedidos: int
    preco_atual: float
    stock_atual: int
    rating_medio: Optional[float] = None
    total_reviews: int
    vendas_por_dia: List[VendaPeriodicaResponse]


class AnalyticsSeriesPoint(BaseModel):
    """Point for a generic analytics chart."""
    periodo: str
    label: str
    value: float
    quantidade_vendida: int = 0
    numero_pedidos: int = 0


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
    total_produtos: int
    total_categorias: int
    total_clientes: int
    total_carrinhos: int
    produtos_baixo_estoque: List[ProdutoEstoqueMinimo]
    produtos_populares: List[ProdutoPopular]
    graficos_vendas: DashboardSalesGraphs


class CategoryResponse(BaseModel):
    """Response model for category."""
    category_id: int
    id_categoria_display: str
    category_name: str
    category_description: Optional[str] = None
    status: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryCreate(BaseModel):
    """Schema for creating a category."""
    category_name: str
    category_description: Optional[str] = None


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    category_name: Optional[str] = None
    category_description: Optional[str] = None
    status: Optional[int] = None
