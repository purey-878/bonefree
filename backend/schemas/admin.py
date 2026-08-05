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
    id_admin: int
    nome: str
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
    nome: str = Field(..., min_length=1, max_length=100)
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
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
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
    id_cliente: int
    nome: Optional[str] = None
    apelido: Optional[str] = None
    email: str
    telefone: Optional[str] = None
    nif: Optional[str] = None
    morada: Optional[str] = None
    codigo_postal: Optional[str] = None
    cidade: Optional[str] = None
    status: Optional[int] = None
    data_criacao: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ClienteAdminCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=100)
    apelido: Optional[str] = Field(None, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    telefone: Optional[str] = Field(None, max_length=20)
    nif: Optional[str] = Field(None, max_length=20)
    morada: Optional[str] = Field(None, max_length=255)
    codigo_postal: Optional[str] = Field(None, max_length=20)
    cidade: Optional[str] = Field(None, max_length=100)
    status: int = 1


class ClienteAdminUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=100)
    apelido: Optional[str] = Field(None, max_length=100)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)
    telefone: Optional[str] = Field(None, max_length=20)
    nif: Optional[str] = Field(None, max_length=20)
    morada: Optional[str] = Field(None, max_length=255)
    codigo_postal: Optional[str] = Field(None, max_length=20)
    cidade: Optional[str] = Field(None, max_length=100)
    status: Optional[int] = None


# Product Management Schemas
class ProductIngredientPayload(BaseModel):
    """Ingredient assignment for a product."""
    id_ingrediente: Optional[int] = None
    nome: Optional[str] = Field(None, min_length=1, max_length=120)
    tipo: str = "INGREDIENTES_NORMAIS"
    incluido_por_defeito: bool = True
    removivel: bool = True
    substituivel: bool = False
    quantidade: Optional[str] = Field(None, max_length=50)
    calorias_por_grama: Optional[float] = Field(None, ge=0)

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingrediente inválido.")
        return normalized


class IngredientCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=120)
    tipo: str = "INGREDIENTES_NORMAIS"
    status: int = 1
    calorias_por_grama: Optional[float] = Field(None, ge=0)

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingrediente inválido.")
        return normalized


class IngredientUpdate(BaseModel):
    nome: Optional[str] = Field(None, min_length=1, max_length=120)
    tipo: Optional[str] = None
    status: Optional[int] = None
    calorias_por_grama: Optional[float] = Field(None, ge=0)

    @field_validator("tipo")
    @classmethod
    def validate_tipo(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = value.strip().upper()
        if normalized not in INGREDIENT_TYPES:
            raise ValueError("Tipo de ingrediente inválido.")
        return normalized


class IngredientResponse(BaseModel):
    id_ingrediente: int
    nome: str
    tipo: str
    status: int
    calorias_por_grama: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class ProductIngredientResponse(BaseModel):
    id_ingrediente: int
    nome: str
    tipo: str
    incluido_por_defeito: bool = True
    removivel: bool = True
    substituivel: bool = False
    quantidade: Optional[str] = None
    calorias_por_grama: Optional[float] = None


class ProdutoBase(BaseModel):
    """Base product schema for create/update."""
    nome: str
    descricao_produto: Optional[str] = None
    preco: float
    stock: int
    id_categoria: CategoryId
    customizavel: bool = True
    menu_tags: Optional[str] = None
    destaque: bool = False
    desconto_percentual: float = Field(0, ge=0, le=100)
    gluten_free: bool = False
    contains_alcohol: bool = False
    total_calorias: Optional[float] = Field(None, ge=0)
    ingredientes: List[ProductIngredientPayload] = Field(default_factory=list)

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
    nome: Optional[str] = None
    descricao_produto: Optional[str] = None
    preco: Optional[float] = None
    stock: Optional[int] = None
    id_categoria: Optional[CategoryId] = None
    status: Optional[int] = None
    customizavel: Optional[bool] = None
    menu_tags: Optional[str] = None
    destaque: Optional[bool] = None
    desconto_percentual: Optional[float] = Field(None, ge=0, le=100)
    gluten_free: Optional[bool] = None
    contains_alcohol: Optional[bool] = None
    total_calorias: Optional[float] = Field(None, ge=0)
    ingredientes: Optional[List[ProductIngredientPayload]] = None

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
    caminho_imagem: str

    model_config = ConfigDict(from_attributes=True)


class ProdutoAdminResponse(BaseModel):
    """Response model for product in admin context."""
    id_produto: int
    id_produto_display: str
    nome: str
    descricao_produto: Optional[str]
    preco: float
    stock: int
    id_categoria: int
    id_categoria_display: str
    vendido: Optional[int]
    status: Optional[int]
    customizavel: bool = True
    menu_tags: Optional[str] = None
    destaque: bool = False
    desconto_percentual: float = 0
    gluten_free: bool = False
    contains_alcohol: bool = False
    total_calorias: Optional[float] = None
    deleted_at: Optional[datetime]
    imagens: Optional[List[ImagemProdutoResponse]] = []
    ingredientes: List[ProductIngredientResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# Order Schemas
class CartItemResponse(BaseModel):
    """Response model for cart item."""
    id_produto: int
    id_produto_display: str
    nome: str
    quantidade: int
    preco: float
    total: float
    customizacao: Optional[str] = None
    customizacao_resumo: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OrderResponse(BaseModel):
    """Response model for order."""
    id_carrinho: int
    id_cliente: int
    cliente_email: str
    cliente_nome: Optional[str]
    cliente_telefone: Optional[str] = None
    data_criacao: datetime
    estado: str
    metodo_pagamento: str
    estado_pagamento: str
    total: float
    notas: Optional[str] = None
    fulfillment_method: str = "pickup"
    table_number: Optional[int] = None
    data_cancelamento: Optional[datetime] = None
    origem_cancelamento: Optional[str] = None
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
    estado: str

    @field_validator("estado")
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
    id_carrinho: int
    data_criacao: datetime
    estado: str
    notas: Optional[str] = None
    fulfillment_method: str = "pickup"
    table_number: Optional[int] = None
    data_atualizacao: Optional[datetime] = None
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
            raise ValueError("Motivo do reembolso inválido.")
        return value


class RefundResponse(BaseModel):
    id_reembolso: int
    id_encomenda: int
    refund_id: str
    order_id: str
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
    id_produto: int
    id_produto_display: str
    nome: str
    stock: int
    preco: float
    categoria: str


class ProdutoPopular(BaseModel):
    """Response for popular product."""
    id_produto: int
    id_produto_display: str
    nome: str
    vendido: int
    preco: float
    categoria: str


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
    id_produto: int
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
    valor: float
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
    id_categoria: int
    id_categoria_display: str
    nome_categoria: str
    descricao_categoria: Optional[str] = None
    status: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class CategoryCreate(BaseModel):
    """Schema for creating a category."""
    nome_categoria: str
    descricao_categoria: Optional[str] = None


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    nome_categoria: Optional[str] = None
    descricao_categoria: Optional[str] = None
    status: Optional[int] = None
