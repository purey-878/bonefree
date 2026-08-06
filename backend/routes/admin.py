"""
Admin routes for product management and analytics.
"""

import os
import uuid
import logging
import csv
from decimal import Decimal
from io import StringIO
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_, select
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union

from database import get_db
from models import (
    Admin, Produto, Carrinho, CarrinhoProduto as CartItem, Cliente, ImagemProduto,
    Categoria, Encomenda, EncomendaProduto, Pagamento, ProdutoReview,
    Ingrediente, ProdutoIngrediente, Reembolso, ClienteEnderecoFatura,
)
from auth import (
    CHEF_ROLE,
    STAFF_ADMIN_ROLE,
    SUPER_ADMIN_ROLE,
    create_access_token,
    get_current_admin,
    hash_password,
    normalize_admin_role,
    require_chef_or_staff_or_super_admin,
    require_staff_admin_or_super_admin,
    require_super_admin,
    verify_password,
)
from schemas.admin import (
    AdminLogin, AdminTokenResponse,
    ProdutoCreate, ProdutoUpdate, ProdutoAdminResponse,
    IngredientCreate, IngredientResponse, IngredientUpdate, ProductIngredientPayload,
    ProductIngredientResponse,
    OrderResponse, CartItemResponse, ProdutoEstoqueMinimo,
    ProdutoPopular, VendaPeriodicaResponse, DashboardAnalytics,
    DashboardSalesGraphs,
    ProductAnalyticsResponse,
    AnalyticsSeriesPoint, AnalyticsSeriesResponse,
    CategoryCreate, CategoryResponse, CategoryUpdate, SalesPerformanceResponse,
    ClienteAdminCreate, ClienteAdminResponse, ClienteAdminUpdate,
    CounterPaymentResponse, KitchenOrderResponse, OrderStatusUpdate,
    RefundOrderResponse, RefundRequest, RefundResponse,
    StaffAdminCreate, StaffAdminUpdate, AdminResponse,
)
from services.invoices import ensure_invoice_for_order
from services.order_customization import customization_lines
from services.receipt_email import build_saved_order_receipt_payload, send_purchase_receipt
from services.refund_receipt import (
    REFUND_METHOD_TEXT,
    build_refund_receipt_payload,
    original_invoice_number,
    refund_receipt_number,
    send_refund_email,
)
from utils.id_format import format_category_id, format_product_id, parse_category_id, parse_product_id

router = APIRouter(prefix="/admin", tags=["Admin Management"])
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = PROJECT_ROOT / "uploads" / "images"
LEGACY_UPLOAD_DIR = PROJECT_ROOT / "public" / "assets" / "images" / "menu-images"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _image_filename(image_path: str) -> str:
    return Path(image_path).name


def _delete_uploaded_image_file(image_path: str) -> None:
    filename = _image_filename(image_path)
    for directory in (UPLOAD_DIR, LEGACY_UPLOAD_DIR):
        filepath = directory / filename
        try:
            if filepath.exists():
                filepath.unlink()
        except Exception:
            logger.exception("Failed to remove product image file %s", filepath)

KITCHEN_VISIBLE_STATES = ("confirmada", "em_preparacao", "pronta")
CHEF_ALLOWED_STATES = {"confirmada", "em_preparacao", "pronta"}
STAFF_ALLOWED_STATES = {"pendente", "confirmada", "em_preparacao", "pronta", "entregue", "cancelada"}


SalesStats = Dict[str, Union[float, int]]


@router.post("/login", response_model=AdminTokenResponse)
def admin_login(credentials: AdminLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == credentials.email).first()
    if not admin or not verify_password(credentials.password, admin.palavra_passe):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou palavra-passe inválido.")
    if admin.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de administrador está inativa.")

    admin.role = normalize_admin_role(admin.role)
    access_token = create_access_token(data={"sub": admin.email, "type": "admin"})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "admin": AdminResponse.model_validate(admin),
    }


@router.get("/me", response_model=AdminResponse)
def read_current_admin(current_admin: Admin = Depends(get_current_admin)):
    current_admin.role = normalize_admin_role(current_admin.role)
    return current_admin


def _empty_sales_stats() -> SalesStats:
    return {
        "total_vendas": 0.0,
        "quantidade_vendida": 0,
        "numero_pedidos": 0,
    }


def _format_money_pt(value: object) -> str:
    amount = Decimal(str(value or 0)).quantize(Decimal("0.01"))
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    whole, cents = f"{amount:.2f}".split(".")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    return f"{sign}{'.'.join(groups)},{cents} €"


def _shift_month(date_value: datetime, months: int) -> datetime:
    month_index = date_value.month - 1 + months
    year = date_value.year + month_index // 12
    month = month_index % 12 + 1
    return date_value.replace(year=year, month=month)


def _sales_point(periodo: str, stats: SalesStats) -> VendaPeriodicaResponse:
    return VendaPeriodicaResponse(
        periodo=periodo,
        total_vendas=float(stats["total_vendas"]),
        quantidade_vendida=int(stats["quantidade_vendida"]),
        numero_pedidos=int(stats["numero_pedidos"]),
    )


def _add_order_to_sales_bucket(
    buckets: Dict[str, SalesStats],
    bucket_key: str,
    order_total: float,
    item_quantity: int,
) -> None:
    if bucket_key not in buckets:
        return

    buckets[bucket_key]["total_vendas"] = float(buckets[bucket_key]["total_vendas"]) + order_total
    buckets[bucket_key]["quantidade_vendida"] = int(buckets[bucket_key]["quantidade_vendida"]) + item_quantity
    buckets[bucket_key]["numero_pedidos"] = int(buckets[bucket_key]["numero_pedidos"]) + 1


def _build_dashboard_sales_graphs(db: Session) -> DashboardSalesGraphs:
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    today = now.date()

    hourly_start = now - timedelta(hours=23)
    daily_start = today - timedelta(days=29)
    monthly_start = _shift_month(datetime(today.year, today.month, 1), -11)
    yearly_start = datetime(today.year - 4, 1, 1)

    hourly_keys = [(hourly_start + timedelta(hours=index)).strftime("%Y-%m-%d %H:00") for index in range(24)]
    daily_keys = [(daily_start + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(30)]
    monthly_keys = [_shift_month(monthly_start, index).strftime("%Y-%m") for index in range(12)]
    yearly_keys = [str(today.year - 4 + index) for index in range(5)]

    hourly_buckets = {key: _empty_sales_stats() for key in hourly_keys}
    daily_buckets = {key: _empty_sales_stats() for key in daily_keys}
    monthly_buckets = {key: _empty_sales_stats() for key in monthly_keys}
    yearly_buckets = {key: _empty_sales_stats() for key in yearly_keys}

    orders = (
        db.query(Encomenda)
        .filter(Encomenda.data_encomenda >= yearly_start)
        .all()
    )

    for order in orders:
        order_date = order.data_encomenda
        if not order_date:
            continue

        order_total = float(order.total or 0)
        item_quantity = sum(item.quantidade for item in order.itens)

        if order_date >= hourly_start:
            _add_order_to_sales_bucket(
                hourly_buckets,
                order_date.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:00"),
                order_total,
                item_quantity,
            )
        if order_date.date() >= daily_start:
            _add_order_to_sales_bucket(
                daily_buckets,
                order_date.strftime("%Y-%m-%d"),
                order_total,
                item_quantity,
            )
        if order_date >= monthly_start:
            _add_order_to_sales_bucket(
                monthly_buckets,
                order_date.strftime("%Y-%m"),
                order_total,
                item_quantity,
            )
        if order_date >= yearly_start:
            _add_order_to_sales_bucket(
                yearly_buckets,
                order_date.strftime("%Y"),
                order_total,
                item_quantity,
            )

    return DashboardSalesGraphs(
        por_hora=[_sales_point(key, hourly_buckets[key]) for key in hourly_keys],
        por_dia=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
        por_mes=[_sales_point(key, monthly_buckets[key]) for key in monthly_keys],
        por_ano=[_sales_point(key, yearly_buckets[key]) for key in yearly_keys],
    )


def _parse_date_param(value: Optional[str], fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="As datas devem usar o formato YYYY-MM-DD.")


def _parse_cliente_created_at(value: Optional[object]) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    value = str(value)
    candidates = [value, value[:19], value[:10]]
    for candidate in candidates:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(candidate, fmt)
            except ValueError:
                continue
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _analytics_window(range_key: str, start_date: Optional[str], end_date: Optional[str]) -> tuple[datetime, datetime, str]:
    now = datetime.utcnow()
    if range_key == "day":
        return now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=23), now, "hour"
    if range_key == "month":
        return datetime.combine((now.date() - timedelta(days=29)), datetime.min.time()), now, "day"
    if range_key == "year":
        return _shift_month(datetime(now.year, now.month, 1), -11), now, "month"
    if range_key == "custom":
        start = _parse_date_param(start_date, datetime.combine((now.date() - timedelta(days=29)), datetime.min.time()))
        end = _parse_date_param(end_date, datetime.combine(now.date(), datetime.max.time()))
        if start > end:
            raise HTTPException(status_code=400, detail="A data inicial deve ser anterior a data final.")
        day_span = (end.date() - start.date()).days
        granularity = "day" if day_span <= 90 else "month" if day_span <= 730 else "year"
        return start, end.replace(hour=23, minute=59, second=59, microsecond=999999), granularity
    raise HTTPException(status_code=400, detail="O intervalo deve ser day, month, year ou custom.")


def _analytics_keys(start: datetime, end: datetime, granularity: str) -> List[str]:
    keys: List[str] = []
    cursor = start.replace(minute=0, second=0, microsecond=0) if granularity == "hour" else datetime(start.year, start.month, start.day)
    if granularity == "month":
        cursor = datetime(start.year, start.month, 1)
    if granularity == "year":
        cursor = datetime(start.year, 1, 1)

    while cursor <= end:
        if granularity == "hour":
            keys.append(cursor.strftime("%Y-%m-%d %H:00"))
            cursor += timedelta(hours=1)
        elif granularity == "day":
            keys.append(cursor.strftime("%Y-%m-%d"))
            cursor += timedelta(days=1)
        elif granularity == "month":
            keys.append(cursor.strftime("%Y-%m"))
            cursor = _shift_month(cursor, 1)
        else:
            keys.append(cursor.strftime("%Y"))
            cursor = cursor.replace(year=cursor.year + 1)
    return keys


def _analytics_key(value: datetime, granularity: str) -> str:
    if granularity == "hour":
        return value.replace(minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:00")
    if granularity == "day":
        return value.strftime("%Y-%m-%d")
    if granularity == "month":
        return value.strftime("%Y-%m")
    return value.strftime("%Y")


def _analytics_label(key: str, granularity: str) -> str:
    if granularity == "hour":
        return key[11:]
    if granularity == "day":
        return key[5:]
    if granularity == "month":
        return datetime.strptime(f"{key}-01", "%Y-%m-%d").strftime("%b %Y")
    return key


def active_product_filter():
    return or_(Produto.status == 1, Produto.status.is_(None))


def _ingredient_response(row: ProdutoIngrediente) -> ProductIngredientResponse:
    ingredient = row.ingrediente
    return ProductIngredientResponse(
        id_ingrediente=row.id_ingrediente,
        nome=ingredient.nome if ingredient else "",
        tipo=ingredient.tipo if ingredient else "INGREDIENTES_NORMAIS",
        incluido_por_defeito=bool(row.incluido_por_defeito),
        removivel=bool(row.removivel) and bool(ingredient and ingredient.tipo == "INGREDIENTES_NORMAIS"),
        substituivel=bool(row.substituivel),
        quantidade=row.quantidade,
        calorias_por_grama=float(ingredient.calorias_por_grama) if ingredient and ingredient.calorias_por_grama is not None else None,
    )


def _product_ingredient_lookup(db: Session, product_ids: List[int]) -> Dict[int, List[ProductIngredientResponse]]:
    if not product_ids:
        return {}

    rows = (
        db.query(ProdutoIngrediente)
        .options(joinedload(ProdutoIngrediente.ingrediente))
        .filter(ProdutoIngrediente.id_produto.in_(product_ids))
        .all()
    )
    lookup: Dict[int, List[ProductIngredientResponse]] = {product_id: [] for product_id in product_ids}
    for row in rows:
        lookup.setdefault(row.id_produto, []).append(_ingredient_response(row))
    return lookup


def _product_admin_response(
    db: Session,
    produto: Produto,
    ingredient_lookup: Optional[Dict[int, List[ProductIngredientResponse]]] = None,
) -> ProdutoAdminResponse:
    data = ProdutoAdminResponse.model_validate(produto).model_dump()
    ingredients = None if ingredient_lookup is None else ingredient_lookup.get(produto.id_produto)
    if ingredients is None:
        ingredients = _product_ingredient_lookup(db, [produto.id_produto]).get(produto.id_produto, [])
    data["ingredientes"] = [ingredient.model_dump() for ingredient in ingredients]
    return ProdutoAdminResponse(**data)


def _find_or_create_ingredient(db: Session, payload: ProductIngredientPayload) -> Ingrediente:
    if payload.id_ingrediente is not None:
        ingredient = db.query(Ingrediente).filter(Ingrediente.id_ingrediente == payload.id_ingrediente).first()
        if not ingredient:
            raise HTTPException(status_code=404, detail=f"Ingrediente {payload.id_ingrediente} não encontrado.")
        if ingredient.status == 0:
            ingredient.status = 1
        if payload.calorias_por_grama is not None:
            ingredient.calorias_por_grama = payload.calorias_por_grama
        return ingredient

    name = (payload.nome or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Novos ingredientes precisam de um nome.")

    ingredient = db.query(Ingrediente).filter(func.lower(Ingrediente.nome) == name.lower()).first()
    if ingredient:
        if ingredient.status == 0:
            ingredient.status = 1
        if payload.calorias_por_grama is not None:
            ingredient.calorias_por_grama = payload.calorias_por_grama
        return ingredient

    ingredient = Ingrediente(
        nome=name,
        tipo=payload.tipo,
        status=1,
        calorias_por_grama=payload.calorias_por_grama,
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _sync_product_ingredients(db: Session, product_id: int, ingredients: List[ProductIngredientPayload]) -> None:
    db.query(ProdutoIngrediente).filter(ProdutoIngrediente.id_produto == product_id).delete(synchronize_session=False)
    seen_ingredient_ids: set[int] = set()
    for payload in ingredients:
        ingredient = _find_or_create_ingredient(db, payload)
        if ingredient.id_ingrediente in seen_ingredient_ids:
            continue
        seen_ingredient_ids.add(ingredient.id_ingrediente)
        db.add(ProdutoIngrediente(
            id_produto=product_id,
            id_ingrediente=ingredient.id_ingrediente,
            incluido_por_defeito=1 if payload.incluido_por_defeito else 0,
            removivel=1 if payload.removivel and ingredient.tipo == "INGREDIENTES_NORMAIS" else 0,
            substituivel=1 if payload.substituivel else 0,
            quantidade=payload.quantidade,
        ))


def _public_order_note(notes: str | None) -> str | None:
    if not notes:
        return None

    prefix = "notes="
    for part in notes.split(" | "):
        if part.startswith(prefix):
            value = part.removeprefix(prefix).strip()
            return value or None
    return None


def _order_note_value(notes: str | None, key: str) -> str | None:
    if not notes:
        return None
    prefix = f"{key}="
    for part in notes.split(" | "):
        if part.startswith(prefix):
            return part.removeprefix(prefix).strip() or None
    return None


def _order_table_number(notes: str | None) -> int | None:
    value = _order_note_value(notes, "table_number")
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def _order_fulfillment_method(notes: str | None) -> str:
    value = _order_note_value(notes, "fulfillment")
    if value in {"dine_in", "pickup", "takeaway"}:
        return value
    return "pickup"


def _order_response(encomenda: Encomenda) -> OrderResponse:
    latest_refund = _latest_refund(encomenda)
    return OrderResponse(
        id_carrinho=encomenda.id_encomenda,
        id_cliente=encomenda.id_cliente,
        cliente_email=encomenda.cliente.email if encomenda.cliente else "Unknown",
        cliente_nome=(
            f"{encomenda.cliente.nome or ''} {encomenda.cliente.apelido or ''}".strip()
            if encomenda.cliente else None
        ),
        cliente_telefone=encomenda.cliente.telefone if encomenda.cliente else None,
        data_criacao=encomenda.data_encomenda,
        estado=encomenda.estado,
        metodo_pagamento=encomenda.metodo_pagamento,
        estado_pagamento=encomenda.estado_pagamento,
        total=float(encomenda.total),
        notas=None,
        fulfillment_method=_order_fulfillment_method(encomenda.notas),
        table_number=_order_table_number(encomenda.notas),
        data_cancelamento=encomenda.data_cancelamento,
        origem_cancelamento=encomenda.origem_cancelamento,
        refund_status="Approved" if latest_refund else "None",
        refund_id=latest_refund.id_reembolso if latest_refund else None,
        refund_amount=float(latest_refund.valor) if latest_refund else None,
        refund_reason=latest_refund.motivo if latest_refund else None,
        refund_notes=latest_refund.notas if latest_refund else None,
        refund_processed_by=latest_refund.admin.nome if latest_refund and latest_refund.admin else None,
        refund_processed_by_role=latest_refund.admin.role if latest_refund and latest_refund.admin else None,
        refund_date=latest_refund.data_reembolso if latest_refund else None,
        data_atualizacao=encomenda.data_atualizacao,
        total_items=sum(item.quantidade for item in encomenda.itens),
        items=[
            CartItemResponse(
                id_produto=item.id_produto,
                id_produto_display=format_product_id(item.id_produto),
                nome=item.nome_produto_snapshot or (item.produto.nome if item.produto else format_product_id(item.id_produto)),
                quantidade=item.quantidade,
                preco=float(item.preco_unitario),
                total=float(item.preco_unitario) * item.quantidade,
                customizacao=item.customizacao,
                customizacao_resumo=customization_lines(item.customizacao),
            )
            for item in encomenda.itens
        ],
    )


def _latest_refund(encomenda: Encomenda) -> Reembolso | None:
    refunds = sorted(encomenda.reembolsos or [], key=lambda refund: refund.data_reembolso or datetime.min, reverse=True)
    return refunds[0] if refunds else None


def _refund_response(refund: Reembolso) -> RefundResponse:
    order = refund.encomenda
    customer = order.cliente if order else None
    admin = refund.admin
    customer_name = (
        f"{customer.nome or ''} {customer.apelido or ''}".strip()
        if customer else "Cliente"
    ) or "Cliente"
    return RefundResponse(
        id_reembolso=refund.id_reembolso,
        id_encomenda=refund.id_encomenda,
        refund_id=refund.recibo_numero,
        order_id=f"ENC-{refund.id_encomenda:06d}",
        original_invoice_number=original_invoice_number(order),
        customer_name=customer_name,
        customer_email=customer.email if customer else "",
        amount=float(refund.valor),
        reason=refund.motivo,
        notes=refund.notas,
        processed_by=admin.nome if admin else "Staff",
        processed_by_role=admin.role if admin else "staff_admin",
        date=refund.data_reembolso,
        status=refund.status,
        refund_method=REFUND_METHOD_TEXT,
    )


def _kitchen_order_response(encomenda: Encomenda) -> KitchenOrderResponse:
    order = _order_response(encomenda)
    return KitchenOrderResponse(
        id_carrinho=order.id_carrinho,
        data_criacao=order.data_criacao,
        estado=order.estado,
        notas=order.notas,
        fulfillment_method=order.fulfillment_method,
        table_number=order.table_number,
        total_items=order.total_items,
        items=order.items,
    )


def _get_order_or_404(db: Session, order_id: int) -> Encomenda:
    encomenda = (
        db.query(Encomenda)
        .options(joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto))
        .filter(Encomenda.id_encomenda == order_id)
        .first()
    )
    if not encomenda:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    return encomenda


def _ensure_order_status_allowed(current_admin: Admin, next_status: str) -> None:
    if current_admin.role == CHEF_ROLE and next_status not in CHEF_ALLOWED_STATES:
        raise HTTPException(status_code=403, detail="O chef so pode atualizar o estado de preparacao da cozinha.")
    if current_admin.role == SUPER_ADMIN_ROLE and next_status == "reembolsada":
        return
    if current_admin.role in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE} and next_status not in STAFF_ALLOWED_STATES:
        raise HTTPException(status_code=400, detail="Estado do pedido inválido.")


def _is_kitchen_visible(encomenda: Encomenda) -> bool:
    if encomenda.estado in KITCHEN_VISIBLE_STATES:
        return True
    return (
        encomenda.metodo_pagamento == "balcao"
        and encomenda.estado_pagamento == "pago"
        and encomenda.estado not in {"entregue", "cancelada"}
    )


# ─────────────────────────────────────────────────────────────
def _confirm_counter_payment(db: Session, encomenda: Encomenda, current_admin: Admin) -> bool:
    was_paid = encomenda.estado_pagamento == "pago"
    encomenda.estado_pagamento = "pago"

    now = datetime.utcnow()
    if encomenda.pagamento:
        encomenda.pagamento.estado = "aprovado"
        encomenda.pagamento.data_pagamento = now
        encomenda.pagamento.confirmado_por_admin_id = current_admin.id_admin
    else:
        db.add(Pagamento(
            id_encomenda=encomenda.id_encomenda,
            metodo="balcao",
            estado="aprovado",
            valor=encomenda.total,
            referencia_transacao=f"BAL-{now.strftime('%Y%m%d')}-{encomenda.id_encomenda:03d}",
            data_pagamento=now,
            confirmado_por_admin_id=current_admin.id_admin,
        ))

    ensure_invoice_for_order(db, encomenda)
    return was_paid


def _staff_order_filter():
    today = datetime.utcnow().date()
    return or_(
        Encomenda.estado.in_(("pendente", "confirmada", "em_preparacao", "pronta")),
        (
            (Encomenda.estado == "entregue")
            & (func.date(Encomenda.data_atualizacao) == today)
        ),
        (
            (Encomenda.estado == "cancelada")
            & (func.date(Encomenda.data_atualizacao) == today)
        ),
    )


# CATEGORIES
# ─────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(
    include_inactive: bool = Query(False),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Categoria)
    if not include_inactive:
        query = query.filter(Categoria.status == 1)
    return query.order_by(Categoria.nome_categoria.asc()).all()


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category: CategoryCreate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    new_category = Categoria(
        nome_categoria=category.nome_categoria,
        descricao_categoria=category.descricao_categoria,
        id_admin=current_admin.id_admin,
        status=1,
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.query(Categoria).filter(Categoria.id_categoria == parsed_category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    if category_update.nome_categoria is not None:
        category.nome_categoria = category_update.nome_categoria
    if category_update.descricao_categoria is not None:
        category.descricao_categoria = category_update.descricao_categoria
    if category_update.status is not None:
        category.status = category_update.status

    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", response_model=CategoryResponse)
def delete_category(
    category_id: str,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.query(Categoria).filter(Categoria.id_categoria == parsed_category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    active_products = (
        db.query(func.count(Produto.id_produto))
        .filter(Produto.id_categoria == parsed_category_id, active_product_filter(), Produto.deleted_at.is_(None))
        .scalar()
        or 0
    )
    if active_products > 0:
        raise HTTPException(status_code=400, detail="Não é possível desativar uma categoria com produtos ativos.")

    category.status = 0
    db.commit()
    db.refresh(category)
    return category


# ─────────────────────────────────────────────────────────────
# PRODUCTS
# ─────────────────────────────────────────────────────────────

# INGREDIENTS

@router.get("/ingredients", response_model=List[IngredientResponse])
def list_ingredients(
    include_inactive: bool = Query(False),
    customization_only: bool = Query(False),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Ingrediente)
    if not include_inactive:
        query = query.filter(Ingrediente.status == 1)
    if customization_only:
        drink_category_ids = select(Categoria.id_categoria).where(
            Categoria.nome_categoria.ilike("%bebida%")
        )
        non_drink_ingredient_ids = (
            select(ProdutoIngrediente.id_ingrediente)
            .join(Produto, Produto.id_produto == ProdutoIngrediente.id_produto)
            .where(~Produto.id_categoria.in_(drink_category_ids))
        )
        linked_ingredient_ids = select(ProdutoIngrediente.id_ingrediente)
        query = query.filter(
            Ingrediente.tipo != "BEBIDA",
            or_(
                Ingrediente.id_ingrediente.in_(non_drink_ingredient_ids),
                ~Ingrediente.id_ingrediente.in_(linked_ingredient_ids),
            ),
        )
    return query.order_by(Ingrediente.tipo.asc(), Ingrediente.nome.asc()).all()


@router.post("/ingredients", response_model=IngredientResponse, status_code=status.HTTP_201_CREATED)
def create_ingredient(
    ingredient: IngredientCreate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    name = ingredient.nome.strip()
    existing = db.query(Ingrediente).filter(func.lower(Ingrediente.nome) == name.lower()).first()
    if existing:
        if existing.status == 0:
            existing.status = 1
            existing.tipo = ingredient.tipo
            if "calorias_por_grama" in getattr(ingredient, "model_fields_set", set()):
                existing.calorias_por_grama = ingredient.calorias_por_grama
            db.commit()
            db.refresh(existing)
            return existing
        raise HTTPException(status_code=400, detail="O ingrediente já existe.")

    new_ingredient = Ingrediente(
        nome=name,
        tipo=ingredient.tipo,
        status=ingredient.status,
        calorias_por_grama=ingredient.calorias_por_grama,
    )
    db.add(new_ingredient)
    db.commit()
    db.refresh(new_ingredient)
    return new_ingredient


@router.put("/ingredients/{ingredient_id}", response_model=IngredientResponse)
def update_ingredient(
    ingredient_id: int,
    ingredient_update: IngredientUpdate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    ingredient = db.query(Ingrediente).filter(Ingrediente.id_ingrediente == ingredient_id).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingrediente não encontrado.")

    if ingredient_update.nome is not None:
        name = ingredient_update.nome.strip()
        existing = (
            db.query(Ingrediente)
            .filter(func.lower(Ingrediente.nome) == name.lower(), Ingrediente.id_ingrediente != ingredient_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="O nome do ingrediente já existe.")
        ingredient.nome = name
    if ingredient_update.tipo is not None:
        ingredient.tipo = ingredient_update.tipo
    if ingredient_update.status is not None:
        ingredient.status = ingredient_update.status
    if "calorias_por_grama" in getattr(ingredient_update, "model_fields_set", set()):
        ingredient.calorias_por_grama = ingredient_update.calorias_por_grama

    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.delete("/ingredients/{ingredient_id}", response_model=IngredientResponse)
def delete_ingredient(
    ingredient_id: int,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    ingredient = db.query(Ingrediente).filter(Ingrediente.id_ingrediente == ingredient_id).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Ingrediente não encontrado.")

    ingredient.status = 0
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.post("/products", response_model=ProdutoAdminResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    produto: ProdutoCreate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    category = db.query(Categoria).filter(Categoria.id_categoria == produto.id_categoria, Categoria.status == 1).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoria não encontrada.")

    new_produto = Produto(
        nome=produto.nome,
        descricao_produto=produto.descricao_produto,
        preco=produto.preco,
        stock=produto.stock,
        id_categoria=produto.id_categoria,
        id_admin=current_admin.id_admin,
        vendido=0,
        status=1,
        customizavel=1 if produto.customizavel else 0,
        menu_tags=produto.menu_tags,
        destaque=1 if produto.destaque else 0,
        desconto_percentual=produto.desconto_percentual,
        gluten_free=1 if produto.gluten_free else 0,
        contains_alcohol=1 if produto.contains_alcohol else 0,
        total_calorias=produto.total_calorias,
    )
    db.add(new_produto)
    db.flush()
    _sync_product_ingredients(db, new_produto.id_produto, produto.ingredientes)
    db.commit()
    db.refresh(new_produto)

    saved_product = db.query(Produto).options(joinedload(Produto.imagens)).filter(
        Produto.id_produto == new_produto.id_produto
    ).first()
    return _product_admin_response(db, saved_product)


@router.get("/products", response_model=List[ProdutoAdminResponse])
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    name: str = Query(None),
    category: str = Query(None),
    min_price: float = Query(None),
    max_price: float = Query(None),
    destaque: bool = Query(None),
    gluten_free: bool = Query(None),
    contains_alcohol: bool = Query(None),
    include_deleted: bool = Query(False),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Produto).options(joinedload(Produto.imagens))

    if not include_deleted:
        query = query.filter(active_product_filter(), Produto.deleted_at.is_(None))

    if name:
        query = query.filter(Produto.nome.ilike(f"%{name}%"))

    if category:
        query = query.filter(Produto.id_categoria == parse_category_id(category))

    if min_price is not None:
        query = query.filter(Produto.preco >= min_price)

    if max_price is not None:
        query = query.filter(Produto.preco <= max_price)

    if destaque is not None:
        query = query.filter(Produto.destaque == (1 if destaque else 0))

    if gluten_free is not None:
        query = query.filter(Produto.gluten_free == (1 if gluten_free else 0))

    if contains_alcohol is not None:
        query = query.filter(Produto.contains_alcohol == (1 if contains_alcohol else 0))

    produtos = query.offset(skip).limit(limit).all()
    ingredient_lookup = _product_ingredient_lookup(db, [produto.id_produto for produto in produtos])
    return [_product_admin_response(db, produto, ingredient_lookup) for produto in produtos]


@router.get("/products/{product_id}", response_model=ProdutoAdminResponse)
def get_product(
    product_id: str,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    produto = db.query(Produto).options(joinedload(Produto.imagens)).filter(
        Produto.id_produto == parsed_product_id,
        Produto.status == 1
    ).first()

    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    return _product_admin_response(db, produto)


@router.get("/products/{product_id}/analytics", response_model=ProductAnalyticsResponse)
def get_product_analytics(
    product_id: str,
    days: int = Query(30, ge=1, le=365),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    produto = db.query(Produto).filter(Produto.id_produto == parsed_product_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    daily_keys = [(start_date + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(days)]
    daily_buckets = {key: _empty_sales_stats() for key in daily_keys}

    items = (
        db.query(EncomendaProduto)
        .join(Encomenda, EncomendaProduto.id_encomenda == Encomenda.id_encomenda)
        .filter(
            EncomendaProduto.id_produto == parsed_product_id,
            func.date(Encomenda.data_encomenda) >= start_date,
            func.date(Encomenda.data_encomenda) <= end_date,
        )
        .all()
    )

    total_vendas = 0.0
    quantidade_vendida = 0
    order_ids = set()

    for item in items:
        item_total = float(item.preco_unitario or 0) * item.quantidade
        total_vendas += item_total
        quantidade_vendida += item.quantidade
        order_ids.add(item.id_encomenda)

        if item.encomenda and item.encomenda.data_encomenda:
            date_key = item.encomenda.data_encomenda.strftime("%Y-%m-%d")
            if date_key in daily_buckets:
                daily_buckets[date_key]["total_vendas"] = float(daily_buckets[date_key]["total_vendas"]) + item_total
                daily_buckets[date_key]["quantidade_vendida"] = int(daily_buckets[date_key]["quantidade_vendida"]) + item.quantidade
                daily_buckets[date_key]["numero_pedidos"] = int(daily_buckets[date_key]["numero_pedidos"]) + 1

    rating_medio = (
        db.query(func.avg(ProdutoReview.rating))
        .filter(ProdutoReview.id_produto == parsed_product_id, ProdutoReview.status == "aprovado")
        .scalar()
    )
    total_reviews = (
        db.query(func.count(ProdutoReview.id_review))
        .filter(ProdutoReview.id_produto == parsed_product_id)
        .scalar()
        or 0
    )

    return ProductAnalyticsResponse(
        id_produto=parsed_product_id,
        id_produto_display=format_product_id(parsed_product_id),
        total_vendas=total_vendas,
        quantidade_vendida=quantidade_vendida,
        numero_pedidos=len(order_ids),
        preco_atual=float(produto.preco),
        stock_atual=produto.stock,
        rating_medio=float(rating_medio) if rating_medio is not None else None,
        total_reviews=total_reviews,
        vendas_por_dia=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
    )


@router.put("/products/{product_id}", response_model=ProdutoAdminResponse)
def update_product(
    product_id: str,
    produto_update: ProdutoUpdate,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    produto = db.query(Produto).filter(
        Produto.id_produto == parsed_product_id,
        Produto.status == 1
    ).first()

    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    if produto_update.nome is not None:
        produto.nome = produto_update.nome
    if produto_update.descricao_produto is not None:
        produto.descricao_produto = produto_update.descricao_produto
    if produto_update.preco is not None:
        produto.preco = produto_update.preco
    if produto_update.stock is not None:
        produto.stock = produto_update.stock
    if produto_update.id_categoria is not None:
        category = db.query(Categoria).filter(Categoria.id_categoria == produto_update.id_categoria, Categoria.status == 1).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoria não encontrada.")
        produto.id_categoria = produto_update.id_categoria
    if produto_update.status is not None:
        produto.status = produto_update.status
    if produto_update.customizavel is not None:
        produto.customizavel = 1 if produto_update.customizavel else 0
    if "menu_tags" in getattr(produto_update, "model_fields_set", set()):
        produto.menu_tags = produto_update.menu_tags
    if produto_update.destaque is not None:
        produto.destaque = 1 if produto_update.destaque else 0
    if produto_update.desconto_percentual is not None:
        produto.desconto_percentual = produto_update.desconto_percentual
    if produto_update.gluten_free is not None:
        produto.gluten_free = 1 if produto_update.gluten_free else 0
    if produto_update.contains_alcohol is not None:
        produto.contains_alcohol = 1 if produto_update.contains_alcohol else 0
    if "total_calorias" in getattr(produto_update, "model_fields_set", set()):
        produto.total_calorias = produto_update.total_calorias
    if produto_update.ingredientes is not None:
        _sync_product_ingredients(db, parsed_product_id, produto_update.ingredientes)

    db.commit()
    db.refresh(produto)
    return _product_admin_response(db, produto)


@router.post("/products/{product_id}/toggle-status", response_model=ProdutoAdminResponse)
def toggle_product_status(
    product_id: str,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    produto = db.query(Produto).filter(Produto.id_produto == parsed_product_id).first()

    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    if produto.deleted_at is not None:
        produto.status = 1
        produto.deleted_at = None
    else:
        produto.status = 0 if produto.status == 1 else 1
    db.commit()
    db.refresh(produto)

    return _product_admin_response(db, produto)


@router.delete("/products/{product_id}", response_model=ProdutoAdminResponse)
def delete_product(
    product_id: str,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    produto = db.query(Produto).filter(Produto.id_produto == parsed_product_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    produto.status = 0
    produto.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(produto)
    return _product_admin_response(db, produto)


@router.post("/products/{product_id}/image")
def upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = Query(True),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    # Verify product exists
    produto = db.query(Produto).filter(Produto.id_produto == parsed_product_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    
    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Tipo de ficheiro inválido. Permitidos: JPEG, PNG, WebP, AVIF, GIF.")
    
    try:
        # Generate unique filename
        file_ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
        unique_filename = f"{format_product_id(parsed_product_id)}_{uuid.uuid4().hex}.{file_ext}"
        filepath = UPLOAD_DIR / unique_filename
        public_image_path = f"/uploads/images/{unique_filename}"
        
        # Save file
        with open(filepath, "wb") as f:
            f.write(file.file.read())
        
        if replace_existing:
            # Delete old images for this product
            old_images = db.query(ImagemProduto).filter(ImagemProduto.id_produto == parsed_product_id).all()
            for old_img in old_images:
                _delete_uploaded_image_file(old_img.caminho_imagem)
                db.delete(old_img)
            db.commit()
        
        # Create new image record
        new_image = ImagemProduto(
            id_produto=parsed_product_id,
            caminho_imagem=public_image_path
        )
        db.add(new_image)
        db.commit()
        
        return {
            "message": "Image uploaded successfully",
            "filename": unique_filename,
            "url": public_image_path,
            "caminho_imagem": public_image_path,
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao carregar imagem: {str(e)}")


@router.delete("/products/{product_id}/images/{image_id}")
def delete_product_image(
    product_id: str,
    image_id: int,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    image = db.query(ImagemProduto).filter(
        ImagemProduto.id_produto == parsed_product_id,
        ImagemProduto.id_imagem == image_id,
    ).first()
    if not image:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")

    _delete_uploaded_image_file(image.caminho_imagem)

    db.delete(image)
    db.commit()
    return {"message": "Imagem removida com sucesso."}


# ─────────────────────────────────────────────────────────────
# ORDERS
# ─────────────────────────────────────────────────────────────

@router.get("/orders", response_model=List[OrderResponse])
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db)
):
    encomendas = (
        db.query(Encomenda)
        .order_by(Encomenda.data_encomenda.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_order_response(encomenda) for encomenda in encomendas]


@router.get("/staff/orders", response_model=List[OrderResponse])
def list_staff_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    encomendas = (
        db.query(Encomenda)
        .filter(_staff_order_filter())
        .order_by(Encomenda.data_encomenda.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_order_response(encomenda) for encomenda in encomendas]


@router.get("/kitchen/orders", response_model=List[KitchenOrderResponse])
def list_kitchen_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_admin: Admin = Depends(require_chef_or_staff_or_super_admin),
    db: Session = Depends(get_db),
):
    encomendas = (
        db.query(Encomenda)
        .filter(
            or_(
                Encomenda.estado.in_(KITCHEN_VISIBLE_STATES),
                (
                    (Encomenda.metodo_pagamento == "balcao")
                    & (Encomenda.estado_pagamento == "pago")
                    & (Encomenda.estado.notin_(("entregue", "cancelada")))
                ),
            )
        )
        .order_by(Encomenda.data_encomenda.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_kitchen_order_response(encomenda) for encomenda in encomendas]


@router.get("/kitchen/orders/{order_id}", response_model=KitchenOrderResponse)
def get_kitchen_order(
    order_id: int,
    current_admin: Admin = Depends(require_chef_or_staff_or_super_admin),
    db: Session = Depends(get_db),
):
    encomenda = _get_order_or_404(db, order_id)
    if not _is_kitchen_visible(encomenda):
        raise HTTPException(status_code=404, detail="Pedido da cozinha não encontrado.")
    return _kitchen_order_response(encomenda)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    return _order_response(_get_order_or_404(db, order_id))


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_chef_or_staff_or_super_admin),
    db: Session = Depends(get_db),
):
    encomenda = _get_order_or_404(db, order_id)
    if current_admin.role == CHEF_ROLE and not _is_kitchen_visible(encomenda):
        raise HTTPException(status_code=403, detail="O chef so pode atualizar pedidos ativos da cozinha.")
    _ensure_order_status_allowed(current_admin, body.estado)
    should_confirm_counter_payment = (
        current_admin.role in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE}
        and encomenda.metodo_pagamento == "balcao"
        and encomenda.estado_pagamento == "nao_pago"
        and body.estado not in {"pendente", "reembolsada"}
    )
    was_paid = False
    if should_confirm_counter_payment:
        was_paid = _confirm_counter_payment(db, encomenda, current_admin)
    encomenda.estado = body.estado
    encomenda.id_admin = current_admin.id_admin
    encomenda.data_atualizacao = datetime.utcnow()
    db.commit()
    db.refresh(encomenda)
    if should_confirm_counter_payment and not was_paid:
        try:
            receipt_payload = build_saved_order_receipt_payload(encomenda)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for counter order %s.", encomenda.id_encomenda)
    return _order_response(encomenda)


@router.post("/orders/{order_id}/mark-paid", response_model=CounterPaymentResponse)
@router.post("/orders/{order_id}/pay-counter", response_model=CounterPaymentResponse)
def pay_counter_order(
    order_id: int,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    encomenda = _get_order_or_404(db, order_id)
    if encomenda.metodo_pagamento != "balcao":
        raise HTTPException(status_code=400, detail="Aqui só pedidos com pagamento ao balcão podem ser marcados como pagos.")
    if encomenda.estado_pagamento == "reembolsado":
        raise HTTPException(status_code=400, detail="Pedidos reembolsados não podem ser marcados como pagos.")

    was_paid = _confirm_counter_payment(db, encomenda, current_admin)
    if encomenda.estado not in KITCHEN_VISIBLE_STATES and encomenda.estado not in {"entregue", "cancelada"}:
        encomenda.estado = "confirmada"
    encomenda.id_admin = current_admin.id_admin
    encomenda.data_atualizacao = datetime.utcnow()
    db.commit()
    db.refresh(encomenda)
    if not was_paid:
        try:
            receipt_payload = build_saved_order_receipt_payload(encomenda)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for counter order %s.", encomenda.id_encomenda)

    return CounterPaymentResponse(message="Pedido ao balcão marcado como pago.", order=_order_response(encomenda))


@router.post("/orders/{order_id}/refund", response_model=RefundOrderResponse)
def refund_order(
    order_id: int,
    body: RefundRequest,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    encomenda = _get_order_or_404(db, order_id)
    if encomenda.estado_pagamento == "reembolsado":
        raise HTTPException(status_code=400, detail="O pedido já foi reembolsado.")
    if encomenda.estado_pagamento != "pago":
        raise HTTPException(status_code=400, detail="Apenas pedidos pagos podem ser reembolsados.")
    if Decimal(str(body.amount)) > Decimal(str(encomenda.total)):
        raise HTTPException(status_code=400, detail="O valor do reembolso não pode exceder o total do pedido.")

    encomenda.estado_pagamento = "reembolsado"
    encomenda.estado = "reembolsada"
    encomenda.id_admin = current_admin.id_admin
    encomenda.data_atualizacao = datetime.utcnow()
    if encomenda.pagamento:
        encomenda.pagamento.estado = "reembolsado"

    refund = Reembolso(
        id_encomenda=encomenda.id_encomenda,
        id_pagamento=encomenda.pagamento.id_pagamento if encomenda.pagamento else None,
        id_admin=current_admin.id_admin,
        valor=Decimal(str(body.amount)).quantize(Decimal("0.01")),
        motivo=body.reason,
        notas=body.notes.strip(),
        status="aprovado",
        metodo="Original payment method",
        recibo_numero=f"RR-TMP-{uuid.uuid4().hex[:12].upper()}",
        data_reembolso=datetime.utcnow(),
    )
    db.add(refund)
    db.flush()
    refund.recibo_numero = refund_receipt_number(refund)
    db.commit()
    db.refresh(refund)
    db.refresh(encomenda)

    try:
        receipt_payload = build_refund_receipt_payload(refund)
        background_tasks.add_task(send_refund_email, receipt_payload)
    except Exception:
        logger.exception("Failed to schedule refund email for order %s.", encomenda.id_encomenda)

    return RefundOrderResponse(message="Pedido reembolsado.", order=_order_response(encomenda))


@router.get("/refunds", response_model=List[RefundResponse])
def list_refunds(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    staff_member: Optional[int] = Query(None),
    reason: Optional[str] = Query(None),
    refund_status: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Reembolso)
        .join(Reembolso.encomenda)
        .join(Encomenda.cliente)
        .join(Reembolso.admin)
    )
    if date_from:
        query = query.filter(func.date(Reembolso.data_reembolso) >= _parse_date_param(date_from, datetime.utcnow()).date())
    if date_to:
        query = query.filter(func.date(Reembolso.data_reembolso) <= _parse_date_param(date_to, datetime.utcnow()).date())
    if staff_member:
        query = query.filter(Reembolso.id_admin == staff_member)
    if reason:
        query = query.filter(Reembolso.motivo == reason)
    if refund_status:
        query = query.filter(Reembolso.status == refund_status)

    refunds = query.order_by(Reembolso.data_reembolso.desc()).all()
    return [_refund_response(refund) for refund in refunds]


@router.get("/refunds/export")
def export_refunds(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    staff_member: Optional[int] = Query(None),
    reason: Optional[str] = Query(None),
    refund_status: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_staff_admin_or_super_admin),
    db: Session = Depends(get_db),
):
    refunds = list_refunds(date_from, date_to, staff_member, reason, refund_status, current_admin, db)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID do Reembolso", "ID do Pedido", "Cliente", "Valor", "Motivo", "Processado Por", "Data", "Estado"])
    for refund in refunds:
        writer.writerow([
            refund.refund_id,
            refund.order_id,
            refund.customer_name,
            _format_money_pt(refund.amount),
            refund.reason,
            refund.processed_by,
            refund.date.strftime("%Y-%m-%d %H:%M"),
            refund.status,
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=\"bonefree-refunds.csv\""},
    )


# CLIENTES

def _cliente_address_payload(body) -> dict:
    return {
        "morada": getattr(body, "morada", None),
        "codigo_postal": getattr(body, "codigo_postal", None),
        "cidade": getattr(body, "cidade", None),
    }


def _cliente_address_has_data(payload: dict) -> bool:
    return any(str(payload.get(field) or "").strip() for field in ("morada", "codigo_postal", "cidade"))


def _sync_cliente_invoice_address(db: Session, cliente: Cliente, payload: dict) -> None:
    current_address = cliente.endereco_fatura
    if not _cliente_address_has_data(payload):
        if current_address:
            db.delete(current_address)
            cliente.endereco_fatura = None
        return

    address = current_address or ClienteEnderecoFatura(cliente_id=cliente.id_cliente)
    address.morada = payload.get("morada") or None
    address.codigo_postal = payload.get("codigo_postal") or None
    address.cidade = payload.get("cidade") or None
    address.pais = "Portugal"
    if not current_address:
        db.add(address)
        cliente.endereco_fatura = address


def _cliente_admin_response(cliente: Cliente) -> dict:
    address = cliente.endereco_fatura
    return {
        "id_cliente": cliente.id_cliente,
        "nome": cliente.nome,
        "apelido": cliente.apelido,
        "email": cliente.email,
        "telefone": cliente.telefone,
        "nif": cliente.nif,
        "morada": address.morada if address else None,
        "codigo_postal": address.codigo_postal if address else None,
        "cidade": address.cidade if address else None,
        "status": cliente.status,
        "data_criacao": cliente.data_criacao,
    }


@router.get("/clientes", response_model=List[ClienteAdminResponse])
def list_clientes(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Cliente).options(joinedload(Cliente.endereco_fatura))
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(Cliente.nome.ilike(pattern), Cliente.apelido.ilike(pattern), Cliente.email.ilike(pattern)))
    clientes = query.order_by(Cliente.id_cliente.desc()).offset(skip).limit(limit).all()
    return [_cliente_admin_response(cliente) for cliente in clientes]


@router.post("/clientes", response_model=ClienteAdminResponse, status_code=status.HTTP_201_CREATED)
def create_cliente(
    body: ClienteAdminCreate,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.query(Cliente).filter(Cliente.email == email).first():
        raise HTTPException(status_code=400, detail="O email do cliente já existe.")

    cliente = Cliente(
        nome=body.nome,
        apelido=body.apelido,
        email=email,
        palavra_passe=hash_password(body.password),
        telefone=body.telefone,
        nif=body.nif,
        status=body.status,
        data_criacao=datetime.utcnow(),
    )
    db.add(cliente)
    db.flush()
    _sync_cliente_invoice_address(db, cliente, _cliente_address_payload(body))
    db.commit()
    db.refresh(cliente)
    return _cliente_admin_response(cliente)


@router.put("/clientes/{cliente_id}", response_model=ClienteAdminResponse)
def update_cliente(
    cliente_id: int,
    body: ClienteAdminUpdate,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(Cliente)
        .options(joinedload(Cliente.endereco_fatura))
        .filter(Cliente.id_cliente == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.query(Cliente).filter(Cliente.email == email, Cliente.id_cliente != cliente_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="O email do cliente já existe.")
        cliente.email = email

    for field in ("nome", "apelido", "telefone", "nif", "status"):
        value = getattr(body, field)
        if value is not None:
            setattr(cliente, field, value)
    if {"morada", "codigo_postal", "cidade"}.intersection(body.model_fields_set):
        _sync_cliente_invoice_address(db, cliente, _cliente_address_payload(body))
    if body.password:
        cliente.palavra_passe = hash_password(body.password)

    db.commit()
    db.refresh(cliente)
    return _cliente_admin_response(cliente)


@router.delete("/clientes/{cliente_id}", response_model=ClienteAdminResponse)
def delete_cliente(
    cliente_id: int,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    cliente = (
        db.query(Cliente)
        .options(joinedload(Cliente.endereco_fatura))
        .filter(Cliente.id_cliente == cliente_id)
        .first()
    )
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado.")
    cliente.status = 0
    db.commit()
    db.refresh(cliente)
    return _cliente_admin_response(cliente)


# STAFF ADMINS

@router.get("/staff", response_model=List[AdminResponse])
def list_staff_admins(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    admins = db.query(Admin).order_by(Admin.id_admin.asc()).all()
    for admin in admins:
        if admin.role == "admin":
            admin.role = "staff_admin"
    return admins


@router.post("/staff", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
def create_staff_admin(
    body: StaffAdminCreate,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.query(Admin).filter(Admin.email == email).first():
        raise HTTPException(status_code=400, detail="O email do administrador já existe.")

    admin = Admin(
        nome=body.nome,
        email=email,
        palavra_passe=hash_password(body.password),
        data_criacao=datetime.utcnow().date(),
        status=body.status,
        role=body.role,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@router.put("/staff/{admin_id}", response_model=AdminResponse)
def update_staff_admin(
    admin_id: int,
    body: StaffAdminUpdate,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    admin = db.query(Admin).filter(Admin.id_admin == admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Administrador não encontrado.")

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.query(Admin).filter(Admin.email == email, Admin.id_admin != admin_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="O email do administrador já existe.")
        admin.email = email
    if body.nome is not None:
        admin.nome = body.nome
    if body.role is not None:
        admin.role = body.role
    if body.status is not None:
        admin.status = body.status
    if body.password:
        admin.palavra_passe = hash_password(body.password)

    db.commit()
    db.refresh(admin)
    return admin


@router.delete("/staff/{admin_id}", response_model=AdminResponse)
def delete_staff_admin(
    admin_id: int,
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    if admin_id == current_admin.id_admin:
        raise HTTPException(status_code=400, detail="Não pode desativar a sua própria conta de administrador.")
    admin = db.query(Admin).filter(Admin.id_admin == admin_id).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Administrador não encontrado.")
    admin.status = 0
    db.commit()
    db.refresh(admin)
    return admin


# ─────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────

@router.get("/analytics/dashboard", response_model=DashboardAnalytics)
def get_dashboard_analytics(
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    # Count totals
    total_produtos = db.query(func.count(Produto.id_produto)).filter(Produto.status == 1).scalar() or 0
    total_categorias = db.query(func.count(Categoria.id_categoria)).filter(Categoria.status == 1).scalar() or 0
    total_clientes = db.query(func.count(Cliente.id_cliente)).filter(Cliente.status == 1).scalar() or 0
    total_carrinhos = db.query(func.count(Carrinho.id_carrinho)).scalar() or 0
    
    # Get low-stock products
    produtos_baixo_estoque = [
        ProdutoEstoqueMinimo(
            id_produto=p.id_produto,
            id_produto_display=format_product_id(p.id_produto),
            nome=p.nome,
            stock=p.stock,
            preco=float(p.preco),
            categoria=p.categoria.nome_categoria if p.categoria else "",
        )
        for p in db.query(Produto)
            .filter(Produto.status == 1)
            .order_by(Produto.stock.asc())
            .limit(5)
            .all()
    ]
    
    # Get popular products
    produtos_populares = [
        ProdutoPopular(
            id_produto=p.id_produto,
            id_produto_display=format_product_id(p.id_produto),
            nome=p.nome,
            vendido=p.vendido or 0,
            preco=float(p.preco),
            categoria=p.categoria.nome_categoria if p.categoria else "",
        )
        for p in db.query(Produto)
            .filter(Produto.status == 1)
            .order_by(desc(Produto.vendido))
            .limit(5)
            .all()
    ]
    
    return DashboardAnalytics(
        total_produtos=total_produtos,
        total_categorias=total_categorias,
        total_clientes=total_clientes,
        total_carrinhos=total_carrinhos,
        produtos_baixo_estoque=produtos_baixo_estoque,
        produtos_populares=produtos_populares,
        graficos_vendas=_build_dashboard_sales_graphs(db),
    )

@router.get("/analytics/low-stock", response_model=List[ProdutoEstoqueMinimo])
def get_low_stock_products(
    limit: int = Query(5, ge=1, le=100),
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    produtos = (
        db.query(Produto)
        .filter(Produto.status == 1)
        .order_by(Produto.stock.asc())
        .limit(limit)
        .all()
    )

    return [
        ProdutoEstoqueMinimo(
            id_produto=p.id_produto,
            id_produto_display=format_product_id(p.id_produto),
            nome=p.nome,
            stock=p.stock,
            preco=float(p.preco),
            categoria=p.categoria.nome_categoria if p.categoria else "",
        )
        for p in produtos
    ]


@router.get("/analytics/popular-products", response_model=List[ProdutoPopular])
def get_popular_products(
    limit: int = Query(5, ge=1, le=20),
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    produtos = (
        db.query(Produto)
        .filter(Produto.status == 1)
        .order_by(desc(Produto.vendido))
        .limit(limit)
        .all()
    )

    return [
        ProdutoPopular(
            id_produto=p.id_produto,
            id_produto_display=format_product_id(p.id_produto),
            nome=p.nome,
            vendido=p.vendido or 0,
            preco=float(p.preco),
            categoria=p.categoria.nome_categoria if p.categoria else "",
        )
        for p in produtos
    ]


@router.get("/analytics/series", response_model=AnalyticsSeriesResponse)
def get_analytics_series(
    metric: str = Query(..., pattern="^(sales|orders|clients|products)$"),
    range: str = Query("month", pattern="^(day|month|year|custom)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    start, end, granularity = _analytics_window(range, start_date, end_date)
    keys = _analytics_keys(start, end, granularity)
    buckets = {
        key: {
            "valor": 0.0,
            "quantidade_vendida": 0,
            "numero_pedidos": 0,
        }
        for key in keys
    }

    if metric in {"sales", "orders"}:
        orders = (
            db.query(Encomenda)
            .filter(Encomenda.data_encomenda >= start, Encomenda.data_encomenda <= end)
            .all()
        )
        for order in orders:
            key = _analytics_key(order.data_encomenda, granularity)
            if key not in buckets:
                continue
            buckets[key]["valor"] += float(order.total or 0) if metric == "sales" else 1
            buckets[key]["numero_pedidos"] += 1
            buckets[key]["quantidade_vendida"] += sum(item.quantidade for item in order.itens)

    elif metric == "products":
        items = (
            db.query(EncomendaProduto)
            .join(Encomenda, EncomendaProduto.id_encomenda == Encomenda.id_encomenda)
            .filter(Encomenda.data_encomenda >= start, Encomenda.data_encomenda <= end)
            .all()
        )
        for item in items:
            if not item.encomenda:
                continue
            key = _analytics_key(item.encomenda.data_encomenda, granularity)
            if key not in buckets:
                continue
            buckets[key]["valor"] += item.quantidade
            buckets[key]["quantidade_vendida"] += item.quantidade
            buckets[key]["numero_pedidos"] += 1

    else:
        clientes = db.query(Cliente).all()
        for cliente in clientes:
            created_at = _parse_cliente_created_at(cliente.data_criacao)
            if not created_at or created_at < start or created_at > end:
                continue
            key = _analytics_key(created_at, granularity)
            if key not in buckets:
                continue
            buckets[key]["valor"] += 1

    points = [
        AnalyticsSeriesPoint(
            periodo=key,
            label=_analytics_label(key, granularity),
            valor=float(buckets[key]["valor"]),
            quantidade_vendida=int(buckets[key]["quantidade_vendida"]),
            numero_pedidos=int(buckets[key]["numero_pedidos"]),
        )
        for key in keys
    ]

    return AnalyticsSeriesResponse(
        metric=metric,
        range=range,
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
        total=sum(point.valor for point in points),
        points=points,
    )


@router.get("/analytics/sales-performance", response_model=SalesPerformanceResponse)
def get_sales_performance(
    days: int = Query(7, ge=1, le=90),
    current_admin: Admin = Depends(require_super_admin),
    db: Session = Depends(get_db)
):
    """Get sales performance over specified number of days."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    encomendas = db.query(Encomenda).filter(
        func.date(Encomenda.data_encomenda) >= start_date,
        func.date(Encomenda.data_encomenda) <= end_date
    ).all()

    total_vendas = 0.0
    quantidade_vendida = 0
    numero_pedidos = 0
    vendas_por_dia_dict = {}

    for encomenda in encomendas:
        numero_pedidos += 1
        date_key = encomenda.data_encomenda.strftime("%Y-%m-%d")
        if date_key not in vendas_por_dia_dict:
            vendas_por_dia_dict[date_key] = {
                "total_vendas": 0.0,
                "quantidade_vendida": 0,
                "numero_pedidos": 0
            }

        total_vendas += float(encomenda.total)
        vendas_por_dia_dict[date_key]["total_vendas"] += float(encomenda.total)
        vendas_por_dia_dict[date_key]["numero_pedidos"] += 1

        for item in encomenda.itens:
            quantidade_vendida += item.quantidade
            vendas_por_dia_dict[date_key]["quantidade_vendida"] += item.quantidade
    
    # Build sorted list of daily sales
    vendas_por_dia = [
        VendaPeriodicaResponse(
            periodo=date_str,
            total_vendas=stats["total_vendas"],
            quantidade_vendida=stats["quantidade_vendida"],
            numero_pedidos=stats["numero_pedidos"]
        )
        for date_str, stats in sorted(vendas_por_dia_dict.items())
    ]
    
    periodo = f"{start_date} a {end_date}"
    
    return SalesPerformanceResponse(
        total_vendas=total_vendas,
        quantidade_vendida=quantidade_vendida,
        numero_pedidos=numero_pedidos,
        periodo=periodo,
        vendas_por_dia=vendas_por_dia
    )
