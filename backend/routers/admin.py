"""
Admin routes for product management and analytics.
"""

import os
import uuid
import logging
from decimal import Decimal
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, Depends, Request, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import and_, desc, exists, extract, func, or_, select
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union

from database import get_db
from dependencies import require_role
from schemas.enums import ADMIN_ROLES, EntityStatus, IngredientType, OrderState, PaymentMethod, PaymentState, PaymentStatus, ReviewStatus, UserRole, UserStatus, normalize_admin_role
from models import (
    Admin, Product, Cart, CartProduct as CartItem, Customer, ProductImage,
    Category, Order, OrderProduct, Payment, ProductReview,
    Ingredient, ProductIngredient, CustomerBillingAddress,
)
from services.auth_service import (
    CHEF_ROLE,
    STAFF_ADMIN_ROLE,
    SUPER_ADMIN_ROLE,
    authenticate_admin,
    hash_password,
)
from schemas.admin import (
    AdminLogin, AdminTokenResponse,
    ProductCreate, ProductUpdate, ProductAdminResponse, ProductImageUploadResponse,
    IngredientCreate, IngredientResponse, IngredientUpdate, ProductIngredientPayload,
    ProductIngredientResponse,
    OrderResponse, CartItemResponse, UnavailableProduct,
    PopularProduct, PeriodicSalesResponse, DashboardAnalytics,
    DashboardSalesGraphs,
    ProductAnalyticsResponse,
    AnalyticsSeriesPoint, AnalyticsSeriesResponse,
    CategoryCreate, CategoryResponse, CategoryUpdate, SalesPerformanceResponse,
    CustomerAdminCreate, CustomerAdminResponse, CustomerAdminUpdate,
    CounterPaymentResponse, KitchenOrderResponse, OrderStatusUpdate,
    StaffAdminCreate, StaffAdminUpdate, AdminResponse,
    AvailabilityUpdate,
)
from schemas.user import MessageResponse
from services.invoices import ensure_invoice_for_order
from services.order_customization import customization_lines
from services.product_availability import (
    effective_product_available,
    unavailable_base_ingredients,
    unavailable_base_product_ids,
)
from services.receipt_email import build_saved_order_receipt_payload, send_purchase_receipt
from utils.id_format import format_category_id, format_product_id, parse_category_id, parse_product_id
from core.errors import AppHTTPException

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

KITCHEN_VISIBLE_STATES = (OrderState.CONFIRMED, OrderState.IN_PREPARATION, OrderState.READY)
CHEF_ALLOWED_STATES = {OrderState.CONFIRMED, OrderState.IN_PREPARATION, OrderState.READY}
STAFF_ALLOWED_STATES = {
    OrderState.PENDING,
    OrderState.CONFIRMED,
    OrderState.IN_PREPARATION,
    OrderState.READY,
    OrderState.DELIVERED,
    OrderState.CANCELLED,
}


SalesStats = Dict[str, Union[float, int]]


@router.post("/login", response_model=AdminTokenResponse, operation_id="admin_management_admin_login")
def admin_login(credentials: AdminLogin, request: Request, db: Session = Depends(get_db)):
    admin = db.scalar(select(Admin).where(Admin.email == credentials.email))
    admin, access_token = authenticate_admin(db, admin, credentials.password, request)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "admin": AdminResponse.model_validate(admin),
    }


@router.get("/me", response_model=AdminResponse, operation_id="admin_management_read_current_admin")
def read_current_admin(current_admin: Admin = Depends(require_role(*ADMIN_ROLES))):
    current_admin.role = normalize_admin_role(current_admin.role)
    return current_admin


def _empty_sales_stats() -> SalesStats:
    return {
        "total_sales": 0.0,
        "quantity_sold": 0,
        "order_count": 0,
    }


def _shift_month(date_value: datetime, months: int) -> datetime:
    month_index = date_value.month - 1 + months
    year = date_value.year + month_index // 12
    month = month_index % 12 + 1
    return date_value.replace(year=year, month=month)


def _sales_point(period: str, stats: SalesStats) -> PeriodicSalesResponse:
    return PeriodicSalesResponse(
        period=period,
        total_sales=float(stats["total_sales"]),
        quantity_sold=int(stats["quantity_sold"]),
        order_count=int(stats["order_count"]),
    )


def _period_expressions(timestamp_column, granularity: str):
    parts = ["year"]
    if granularity in {"month", "day", "hour"}:
        parts.append("month")
    if granularity in {"day", "hour"}:
        parts.append("day")
    if granularity == "hour":
        parts.append("hour")
    expressions = [extract(part, timestamp_column) for part in parts]
    return parts, expressions


def _period_key_from_mapping(row, parts: List[str], granularity: str) -> str:
    values = {part: int(row[part]) for part in parts}
    if granularity == "hour":
        return f"{values['year']:04d}-{values['month']:02d}-{values['day']:02d} {values['hour']:02d}:00"
    if granularity == "day":
        return f"{values['year']:04d}-{values['month']:02d}-{values['day']:02d}"
    if granularity == "month":
        return f"{values['year']:04d}-{values['month']:02d}"
    return f"{values['year']:04d}"


def _sales_aggregate_rows(
    db: Session,
    start: datetime,
    end: datetime,
    granularity: str,
) -> list[tuple[str, float, int, int]]:
    """Aggregate sales without materializing Order and OrderProduct ORM graphs."""
    item_totals = (
        select(
            OrderProduct.order_id.label("order_id"),
            func.coalesce(func.sum(OrderProduct.quantity), 0).label("quantity_sold"),
        )
        .group_by(OrderProduct.order_id)
        .subquery()
    )
    parts, expressions = _period_expressions(Order.ordered_at, granularity)
    statement = (
        select(
            *(expression.label(part) for part, expression in zip(parts, expressions)),
            func.coalesce(func.sum(Order.total), 0).label("total_sales"),
            func.coalesce(func.sum(item_totals.c.quantity_sold), 0).label("quantity_sold"),
            func.count(Order.order_id).label("order_count"),
        )
        .outerjoin(item_totals, item_totals.c.order_id == Order.order_id)
        .where(Order.ordered_at >= start, Order.ordered_at <= end)
        .group_by(*expressions)
        .order_by(*expressions)
    )
    return [
        (
            _period_key_from_mapping(row, parts, granularity),
            float(row["total_sales"] or 0),
            int(row["quantity_sold"] or 0),
            int(row["order_count"] or 0),
        )
        for row in db.execute(statement).mappings()
    ]


def _product_sales_aggregate_rows(
    db: Session,
    start: datetime,
    end: datetime,
    granularity: str,
    product_id: int | None = None,
) -> list[tuple[str, float, int, int, int]]:
    """Aggregate order lines while preserving line and distinct-order counters."""
    parts, expressions = _period_expressions(Order.ordered_at, granularity)
    statement = (
        select(
            *(expression.label(part) for part, expression in zip(parts, expressions)),
            func.coalesce(func.sum(OrderProduct.unit_price * OrderProduct.quantity), 0).label("total_sales"),
            func.coalesce(func.sum(OrderProduct.quantity), 0).label("quantity_sold"),
            func.count(OrderProduct.order_product_id).label("line_count"),
            func.count(func.distinct(OrderProduct.order_id)).label("distinct_order_count"),
        )
        .join(Order, OrderProduct.order_id == Order.order_id)
        .where(Order.ordered_at >= start, Order.ordered_at <= end)
        .group_by(*expressions)
        .order_by(*expressions)
    )
    if product_id is not None:
        statement = statement.where(OrderProduct.product_id == product_id)
    return [
        (
            _period_key_from_mapping(row, parts, granularity),
            float(row["total_sales"] or 0),
            int(row["quantity_sold"] or 0),
            int(row["line_count"] or 0),
            int(row["distinct_order_count"] or 0),
        )
        for row in db.execute(statement).mappings()
    ]


def _unavailable_product_rows(db: Session, limit: int) -> List[UnavailableProduct]:
    has_unavailable_base = exists(
        select(ProductIngredient.product_id)
        .join(Ingredient, Ingredient.ingredient_id == ProductIngredient.ingredient_id)
        .where(
            ProductIngredient.product_id == Product.product_id,
            Ingredient.type == IngredientType.BASE,
            or_(
                Ingredient.status == EntityStatus.INACTIVE,
                Ingredient.available.is_(False),
            ),
        )
    )
    rows = db.execute(
        select(
            Product.product_id,
            Product.name,
            Product.available,
            Product.price,
            Category.category_name,
            has_unavailable_base.label("has_unavailable_base"),
        )
        .outerjoin(Category, Category.category_id == Product.category_id)
        .where(
            Product.status == EntityStatus.ACTIVE,
            Product.deleted_at.is_(None),
            or_(Product.available.is_(False), has_unavailable_base),
        )
        .order_by(Product.name.asc())
        .limit(limit)
    ).all()
    return [
        UnavailableProduct(
            product_id=row.product_id,
            product_display_id=format_product_id(row.product_id),
            name=row.name,
            price=float(row.price),
            category=row.category_name or "",
            unavailable_reason=(
                "A required base ingredient is currently unavailable."
                if row.has_unavailable_base
                else "This item is currently unavailable."
            ),
        )
        for row in rows
    ]


def _popular_product_rows(db: Session, limit: int) -> List[PopularProduct]:
    rows = db.execute(
        select(
            Product.product_id,
            Product.name,
            Product.sold,
            Product.price,
            Category.category_name,
        )
        .outerjoin(Category, Category.category_id == Product.category_id)
        .where(Product.status == EntityStatus.ACTIVE)
        .order_by(desc(Product.sold))
        .limit(limit)
    ).all()
    return [
        PopularProduct(
            product_id=row.product_id,
            product_display_id=format_product_id(row.product_id),
            name=row.name,
            sold=row.sold or 0,
            price=float(row.price),
            category=row.category_name or "",
        )
        for row in rows
    ]


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

    windows = (
        (hourly_buckets, hourly_start, now + timedelta(hours=1) - timedelta(microseconds=1), "hour"),
        (
            daily_buckets,
            datetime.combine(daily_start, datetime.min.time()),
            datetime.combine(today, datetime.max.time()),
            "day",
        ),
        (
            monthly_buckets,
            monthly_start,
            _shift_month(datetime(today.year, today.month, 1), 1) - timedelta(microseconds=1),
            "month",
        ),
        (
            yearly_buckets,
            yearly_start,
            datetime(today.year + 1, 1, 1) - timedelta(microseconds=1),
            "year",
        ),
    )
    for buckets, start, end, granularity in windows:
        for period, total_sales, quantity_sold, order_count in _sales_aggregate_rows(
            db, start, end, granularity
        ):
            if period in buckets:
                buckets[period] = {
                    "total_sales": total_sales,
                    "quantity_sold": quantity_sold,
                    "order_count": order_count,
                }

    return DashboardSalesGraphs(
        by_hour=[_sales_point(key, hourly_buckets[key]) for key in hourly_keys],
        by_day=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
        by_month=[_sales_point(key, monthly_buckets[key]) for key in monthly_keys],
        by_year=[_sales_point(key, yearly_buckets[key]) for key in yearly_keys],
    )


def _parse_date_param(value: Optional[str], fallback: datetime) -> datetime:
    if not value:
        return fallback
    try:
        return datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_date", message="Date must use YYYY-MM-DD format.", details={"value": value})


def _parse_customer_created_at(value: Optional[object]) -> Optional[datetime]:
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
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_date_range", message="Start date must be before or equal to end date.", details={"start_date": start_date, "end_date": end_date})
        day_span = (end.date() - start.date()).days
        granularity = "day" if day_span <= 90 else "month" if day_span <= 730 else "year"
        return start, end.replace(hour=23, minute=59, second=59, microsecond=999999), granularity
    raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_analytics_range", message="Analytics range is invalid.", details={"range": range_key})


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
    return or_(Product.status == EntityStatus.ACTIVE, Product.status.is_(None))


def _ingredient_response(row: ProductIngredient) -> ProductIngredientResponse:
    ingredient = row.ingredient
    return ProductIngredientResponse(
        ingredient_id=row.ingredient_id,
        name=ingredient.name if ingredient else "",
        type=ingredient.type if ingredient else IngredientType.NORMAL,
        available=bool(ingredient and ingredient.available),
        included_by_default=bool(row.included_by_default),
        removable=bool(row.removable) and bool(ingredient and ingredient.type == IngredientType.NORMAL),
        substitutable=bool(row.substitutable),
        quantity=row.quantity,
        calories_per_gram=float(ingredient.calories_per_gram) if ingredient and ingredient.calories_per_gram is not None else None,
    )


def _product_ingredient_lookup(db: Session, product_ids: List[int]) -> Dict[int, List[ProductIngredientResponse]]:
    if not product_ids:
        return {}

    rows = db.scalars(
        select(ProductIngredient)
        .options(joinedload(ProductIngredient.ingredient))
        .where(ProductIngredient.product_id.in_(product_ids))
    ).all()
    lookup: Dict[int, List[ProductIngredientResponse]] = {product_id: [] for product_id in product_ids}
    for row in rows:
        lookup.setdefault(row.product_id, []).append(_ingredient_response(row))
    return lookup


def _product_admin_response(
    db: Session,
    product: Product,
    ingredient_lookup: Optional[Dict[int, List[ProductIngredientResponse]]] = None,
    unavailable_base_lookup: Optional[Dict[int, List[str]]] = None,
) -> ProductAdminResponse:
    data = {
        field_name: getattr(product, field_name)
        for field_name in ProductAdminResponse.model_fields
        if field_name not in {
            "discount_percentage",
            "effective_available",
            "ingredients",
            "unavailable_base_ingredients",
        }
    }
    data["discount_percentage"] = float(product.discount_percentage or 0)
    ingredients = None if ingredient_lookup is None else ingredient_lookup.get(product.product_id)
    if ingredients is None:
        ingredients = _product_ingredient_lookup(db, [product.product_id]).get(product.product_id, [])
    data["ingredients"] = [ingredient.model_dump() for ingredient in ingredients]
    if unavailable_base_lookup is None:
        unavailable_base_lookup = unavailable_base_ingredients(db, [product.product_id])
    unavailable_names = unavailable_base_lookup.get(product.product_id, [])
    data["unavailable_base_ingredients"] = unavailable_names
    data["effective_available"] = effective_product_available(
        product,
        {product.product_id} if unavailable_names else set(),
    )
    return ProductAdminResponse(**data)


def _find_or_create_ingredient(db: Session, payload: ProductIngredientPayload) -> Ingredient:
    if payload.ingredient_id is not None:
        ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == payload.ingredient_id))
        if not ingredient:
            raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})
        if ingredient.status == EntityStatus.INACTIVE:
            ingredient.status = EntityStatus.ACTIVE
        if payload.calories_per_gram is not None:
            ingredient.calories_per_gram = payload.calories_per_gram
        return ingredient

    name = (payload.name or "").strip()
    if not name:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="ingredient_name_required", message="Ingredient name is required.", details={"payload": payload.model_dump()})

    ingredient = db.scalar(select(Ingredient).where(func.lower(Ingredient.name) == name.lower()))
    if ingredient:
        if ingredient.status == EntityStatus.INACTIVE:
            ingredient.status = EntityStatus.ACTIVE
        if payload.calories_per_gram is not None:
            ingredient.calories_per_gram = payload.calories_per_gram
        return ingredient

    ingredient = Ingredient(
        name=name,
        type=payload.type,
        status=EntityStatus.ACTIVE,
        available=True,
        calories_per_gram=payload.calories_per_gram,
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _sync_product_ingredients(db: Session, product_id: int, ingredients: List[ProductIngredientPayload]) -> None:
    db.execute(
        ProductIngredient.__table__.delete().where(ProductIngredient.product_id == product_id)
    )
    seen_ingredient_ids: set[int] = set()
    for payload in ingredients:
        ingredient = _find_or_create_ingredient(db, payload)
        if ingredient.ingredient_id in seen_ingredient_ids:
            continue
        seen_ingredient_ids.add(ingredient.ingredient_id)
        db.add(ProductIngredient(
            product_id=product_id,
            ingredient_id=ingredient.ingredient_id,
            included_by_default=1 if payload.included_by_default else 0,
            removable=1 if payload.removable and ingredient.type == IngredientType.NORMAL else 0,
            substitutable=1 if payload.substitutable else 0,
            quantity=payload.quantity,
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


def _order_response(order: Order) -> OrderResponse:
    return OrderResponse(
        order_id=order.order_id,
        customer_id=order.customer_id,
        customer_email=order.customer.email if order.customer else "Unknown",
        customer_name=(
            f"{order.customer.name or ''} {order.customer.last_name or ''}".strip()
            if order.customer else None
        ),
        customer_phone=order.customer.phone if order.customer else None,
        created_at=order.ordered_at,
        state=order.state,
        payment_method=order.payment_method,
        payment_status=order.payment_status,
        total=float(order.total),
        notes=None,
        fulfillment_method=_order_fulfillment_method(order.notes),
        table_number=_order_table_number(order.notes),
        canceled_at=order.canceled_at,
        cancellation_origin=order.cancellation_origin,
        updated_at=order.updated_at,
        total_items=sum(item.quantity for item in order.items),
        items=[
            CartItemResponse(
                product_id=item.product_id,
                product_display_id=format_product_id(item.product_id),
                name=item.product_name_snapshot or (item.product.name if item.product else format_product_id(item.product_id)),
                quantity=item.quantity,
                price=float(item.unit_price),
                total=float(item.unit_price) * item.quantity,
                customization=item.customization,
                customization_summary=customization_lines(item.customization),
            )
            for item in order.items
        ],
    )


def _kitchen_order_response(order: Order) -> KitchenOrderResponse:
    order = _order_response(order)
    return KitchenOrderResponse(
        order_id=order.order_id,
        created_at=order.created_at,
        state=order.state,
        notes=order.notes,
        fulfillment_method=order.fulfillment_method,
        table_number=order.table_number,
        total_items=order.total_items,
        items=order.items,
    )


def _get_order_or_404(db: Session, order_id: int) -> Order:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items).joinedload(OrderProduct.product))
        .where(Order.order_id == order_id)
        .limit(1)
    )
    if not order:
        raise AppHTTPException(status_code=404, error="order_not_found", message="Order not found.", details={"reason": "request_failed"})
    return order


def _ensure_order_status_allowed(current_admin: Admin, order: Order, next_status: str | OrderState) -> None:
    next_state = OrderState(next_status)
    if current_admin.role == CHEF_ROLE and next_state not in CHEF_ALLOWED_STATES:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    if current_admin.role in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE} and next_state not in STAFF_ALLOWED_STATES:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_order_state_transition", message="Order cannot be moved to the requested state.", details={"order_id": order.order_id, "next_state": str(next_state), "admin_role": str(current_admin.role)})
    if order.payment_status == PaymentStatus.UNPAID and next_state not in {OrderState.PENDING, OrderState.CANCELLED}:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="payment_required", message="Counter payment must be confirmed before advancing the order.", details={"order_id": order.order_id, "next_state": str(next_state)})
    if order.payment_status == PaymentStatus.PAID and next_state == OrderState.CANCELLED:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="paid_order_cannot_be_cancelled", message="A paid order cannot be cancelled in the system.", details={"order_id": order.order_id})


def _is_kitchen_visible(order: Order) -> bool:
    if order.state in KITCHEN_VISIBLE_STATES:
        return True
    return (
        order.payment_method == PaymentMethod.COUNTER
        and order.payment_status == PaymentStatus.PAID
        and order.state not in {OrderState.DELIVERED, OrderState.CANCELLED}
    )


# ─────────────────────────────────────────────────────────────
def _confirm_counter_payment(db: Session, order: Order, current_admin: Admin) -> bool:
    was_paid = order.payment_status == PaymentStatus.PAID
    if was_paid:
        return True
    order.payment_status = PaymentStatus.PAID

    now = datetime.utcnow()
    if order.payment:
        order.payment.state = PaymentState.APPROVED
        order.payment.paid_at = now
        order.payment.confirmed_by_admin_id = current_admin.admin_id
    else:
        db.add(Payment(
            order_id=order.order_id,
            method=PaymentMethod.COUNTER,
            state=PaymentState.APPROVED,
            value=order.total,
            transaction_reference=f"COUNTER-{now.strftime('%Y%m%d')}-{order.order_id:03d}",
            paid_at=now,
            confirmed_by_admin_id=current_admin.admin_id,
        ))

    ensure_invoice_for_order(db, order)
    return was_paid


def _staff_order_filter():
    today = datetime.utcnow().date()
    return or_(
        Order.state.in_((OrderState.PENDING, OrderState.CONFIRMED, OrderState.IN_PREPARATION, OrderState.READY)),
        (
            (Order.state == OrderState.DELIVERED)
            & (func.date(Order.updated_at) == today)
        ),
        (
            (Order.state == OrderState.CANCELLED)
            & (func.date(Order.updated_at) == today)
        ),
    )


# CATEGORIES
# ─────────────────────────────────────────────────────────────

@router.get(
    "/categories",
    response_model=List[CategoryResponse],
    operation_id="admin_management_list_categories",
)
def list_categories(
    include_inactive: bool = Query(False),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    stmt = select(Category)
    if not include_inactive:
        stmt = stmt.where(Category.status == EntityStatus.ACTIVE)
    return db.scalars(stmt.order_by(Category.category_name.asc())).all()


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_category",
)
def create_category(
    category: CategoryCreate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    new_category = Category(
        category_name=category.category_name,
        category_description=category.category_description,
        admin_id=current_admin.admin_id,
        status=EntityStatus.ACTIVE,
    )
    db.add(new_category)
    db.commit()
    db.refresh(new_category)
    return new_category


@router.put(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    operation_id="admin_management_update_category",
)
def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.scalar(select(Category).where(Category.category_id == parsed_category_id))
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    if category_update.category_name is not None:
        category.category_name = category_update.category_name
    if category_update.category_description is not None:
        category.category_description = category_update.category_description
    if category_update.status is not None:
        category.status = category_update.status

    db.commit()
    db.refresh(category)
    return category


@router.delete(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    operation_id="admin_management_delete_category",
)
def delete_category(
    category_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.scalar(select(Category).where(Category.category_id == parsed_category_id))
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    active_products = db.scalar(
        select(func.count(Product.product_id)).where(
            Product.category_id == parsed_category_id,
            active_product_filter(),
            Product.deleted_at.is_(None),
        )
    ) or 0
    if active_products > 0:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="category_has_active_products", message="Category cannot be archived while it has active products.", details={"category_id": category.category_id, "active_products": active_products})

    category.status = EntityStatus.INACTIVE
    db.commit()
    db.refresh(category)
    return category


# ─────────────────────────────────────────────────────────────
# PRODUCTS
# ─────────────────────────────────────────────────────────────

# INGREDIENTS

@router.get(
    "/ingredients",
    response_model=List[IngredientResponse],
    operation_id="admin_management_list_ingredients",
)
def list_ingredients(
    include_inactive: bool = Query(False),
    customization_only: bool = Query(False),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    stmt = select(Ingredient)
    if not include_inactive:
        stmt = stmt.where(Ingredient.status == EntityStatus.ACTIVE)
    if customization_only:
        drink_category_ids = select(Category.category_id).where(
            Category.category_name.ilike("%bebida%")
        )
        non_drink_ingredient_ids = (
            select(ProductIngredient.ingredient_id)
            .join(Product, Product.product_id == ProductIngredient.product_id)
            .where(~Product.category_id.in_(drink_category_ids))
        )
        linked_ingredient_ids = select(ProductIngredient.ingredient_id)
        stmt = stmt.where(
            Ingredient.type != IngredientType.DRINK,
            or_(
                Ingredient.ingredient_id.in_(non_drink_ingredient_ids),
                ~Ingredient.ingredient_id.in_(linked_ingredient_ids),
            ),
        )
    return db.scalars(stmt.order_by(Ingredient.type.asc(), Ingredient.name.asc())).all()


@router.post(
    "/ingredients",
    response_model=IngredientResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_ingredient",
)
def create_ingredient(
    ingredient: IngredientCreate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    name = ingredient.name.strip()
    existing = db.scalar(select(Ingredient).where(func.lower(Ingredient.name) == name.lower()))
    if existing:
        if existing.status == EntityStatus.INACTIVE:
            existing.status = EntityStatus.ACTIVE
            existing.type = ingredient.type
            existing.available = ingredient.available
            if "calories_per_gram" in getattr(ingredient, "model_fields_set", set()):
                existing.calories_per_gram = ingredient.calories_per_gram
            db.commit()
            db.refresh(existing)
            return existing
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_ingredient_name", message="An ingredient with this name already exists.", details={"name": name})

    new_ingredient = Ingredient(
        name=name,
        type=ingredient.type,
        status=ingredient.status,
        available=ingredient.available,
        calories_per_gram=ingredient.calories_per_gram,
    )
    db.add(new_ingredient)
    db.commit()
    db.refresh(new_ingredient)
    return new_ingredient


@router.put(
    "/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
    operation_id="admin_management_update_ingredient",
)
def update_ingredient(
    ingredient_id: int,
    ingredient_update: IngredientUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    if ingredient_update.name is not None:
        name = ingredient_update.name.strip()
        existing = (
            db.scalar(
                select(Ingredient).where(
                    func.lower(Ingredient.name) == name.lower(),
                    Ingredient.ingredient_id != ingredient_id,
                ).limit(1)
            )
        )
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_ingredient_name", message="An ingredient with this name already exists.", details={"name": name})
        ingredient.name = name
    if ingredient_update.type is not None:
        ingredient.type = ingredient_update.type
    if ingredient_update.status is not None:
        ingredient.status = ingredient_update.status
    if ingredient_update.available is not None:
        ingredient.available = ingredient_update.available
    if "calories_per_gram" in getattr(ingredient_update, "model_fields_set", set()):
        ingredient.calories_per_gram = ingredient_update.calories_per_gram

    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.put(
    "/ingredients/{ingredient_id}/availability",
    response_model=IngredientResponse,
    operation_id="admin_management_set_ingredient_availability",
)
def set_ingredient_availability(
    ingredient_id: int,
    availability: AvailabilityUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    ingredient.available = availability.available
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.delete(
    "/ingredients/{ingredient_id}",
    response_model=IngredientResponse,
    operation_id="admin_management_delete_ingredient",
)
def delete_ingredient(
    ingredient_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    ingredient = db.scalar(select(Ingredient).where(Ingredient.ingredient_id == ingredient_id))
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    ingredient.status = EntityStatus.INACTIVE
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.post(
    "/products",
    response_model=ProductAdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_product",
)
def create_product(
    product: ProductCreate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    category = db.scalar(
        select(Category).where(
            Category.category_id == product.category_id,
            Category.status == EntityStatus.ACTIVE,
        )
    )
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    new_product = Product(
        name=product.name,
        product_description=product.product_description,
        price=product.price,
        available=product.available,
        category_id=product.category_id,
        admin_id=current_admin.admin_id,
        sold=0,
        status=EntityStatus.ACTIVE,
        customizable=1 if product.customizable else 0,
        menu_tags=product.menu_tags,
        featured=1 if product.featured else 0,
        discount_percentage=product.discount_percentage,
        gluten_free=1 if product.gluten_free else 0,
        contains_alcohol=1 if product.contains_alcohol else 0,
        total_calories=product.total_calories,
    )
    db.add(new_product)
    db.flush()
    _sync_product_ingredients(db, new_product.product_id, product.ingredients)
    db.commit()
    db.refresh(new_product)

    saved_product = db.scalar(
        select(Product).options(selectinload(Product.images)).where(
            Product.product_id == new_product.product_id
        ).limit(1)
    )
    return _product_admin_response(db, saved_product)


@router.get(
    "/products",
    response_model=List[ProductAdminResponse],
    operation_id="admin_management_list_products",
)
def list_products(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    name: str = Query(None),
    category: str = Query(None),
    min_price: float = Query(None),
    max_price: float = Query(None),
    featured: bool = Query(None),
    gluten_free: bool = Query(None),
    contains_alcohol: bool = Query(None),
    include_deleted: bool = Query(False),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    stmt = select(Product).options(selectinload(Product.images))

    if not include_deleted:
        stmt = stmt.where(active_product_filter(), Product.deleted_at.is_(None))

    if name:
        stmt = stmt.where(Product.name.ilike(f"%{name}%"))

    if category:
        stmt = stmt.where(Product.category_id == parse_category_id(category))

    if min_price is not None:
        stmt = stmt.where(Product.price >= min_price)

    if max_price is not None:
        stmt = stmt.where(Product.price <= max_price)

    if featured is not None:
        stmt = stmt.where(Product.featured == (1 if featured else 0))

    if gluten_free is not None:
        stmt = stmt.where(Product.gluten_free == (1 if gluten_free else 0))

    if contains_alcohol is not None:
        stmt = stmt.where(Product.contains_alcohol == (1 if contains_alcohol else 0))

    products = db.scalars(stmt.offset(skip).limit(limit)).unique().all()
    product_ids = [product.product_id for product in products]
    ingredient_lookup = _product_ingredient_lookup(db, product_ids)
    unavailable_base_lookup = unavailable_base_ingredients(db, product_ids)
    return [
        _product_admin_response(db, product, ingredient_lookup, unavailable_base_lookup)
        for product in products
    ]


@router.get(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_get_product",
)
def get_product(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).options(selectinload(Product.images)).where(
            Product.product_id == parsed_product_id,
            Product.status == EntityStatus.ACTIVE,
        ).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    return _product_admin_response(db, product)


@router.get(
    "/products/{product_id}/analytics",
    response_model=ProductAnalyticsResponse,
    operation_id="admin_management_get_product_analytics",
)
def get_product_analytics(
    product_id: str,
    days: int = Query(30, ge=1, le=365),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(select(Product).where(Product.product_id == parsed_product_id))
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    daily_keys = [(start_date + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(days)]
    daily_buckets = {key: _empty_sales_stats() for key in daily_keys}

    total_sales = 0.0
    quantity_sold = 0
    order_count = 0
    for date_key, daily_sales, daily_quantity, line_count, distinct_order_count in _product_sales_aggregate_rows(
        db,
        datetime.combine(start_date, datetime.min.time()),
        datetime.combine(end_date, datetime.max.time()),
        "day",
        parsed_product_id,
    ):
        total_sales += daily_sales
        quantity_sold += daily_quantity
        order_count += distinct_order_count
        if date_key in daily_buckets:
            daily_buckets[date_key] = {
                "total_sales": daily_sales,
                "quantity_sold": daily_quantity,
                "order_count": line_count,
            }

    average_rating = db.scalar(
        select(func.avg(ProductReview.rating)).where(
            ProductReview.product_id == parsed_product_id,
            ProductReview.status == ReviewStatus.APPROVED,
        )
    )
    total_reviews = db.scalar(
        select(func.count(ProductReview.review_id)).where(ProductReview.product_id == parsed_product_id)
    ) or 0

    return ProductAnalyticsResponse(
        product_id=parsed_product_id,
        product_display_id=format_product_id(parsed_product_id),
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_count=order_count,
        current_price=float(product.price),
        effective_available=effective_product_available(
            product,
            unavailable_base_product_ids(db, [parsed_product_id]),
        ),
        average_rating=float(average_rating) if average_rating is not None else None,
        total_reviews=total_reviews,
        sales_by_day=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
    )


@router.put(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_update_product",
)
def update_product(
    product_id: str,
    product_update: ProductUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(
            Product.product_id == parsed_product_id,
            Product.status == EntityStatus.ACTIVE,
        ).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    if product_update.name is not None:
        product.name = product_update.name
    if product_update.product_description is not None:
        product.product_description = product_update.product_description
    if product_update.price is not None:
        product.price = product_update.price
    if product_update.available is not None:
        product.available = product_update.available
    if product_update.category_id is not None:
        category = db.scalar(
            select(Category).where(
                Category.category_id == product_update.category_id,
                Category.status == EntityStatus.ACTIVE,
            )
        )
        if not category:
            raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})
        product.category_id = product_update.category_id
    if product_update.status is not None:
        product.status = product_update.status
    if product_update.customizable is not None:
        product.customizable = 1 if product_update.customizable else 0
    if "menu_tags" in getattr(product_update, "model_fields_set", set()):
        product.menu_tags = product_update.menu_tags
    if product_update.featured is not None:
        product.featured = 1 if product_update.featured else 0
    if product_update.discount_percentage is not None:
        product.discount_percentage = product_update.discount_percentage
    if product_update.gluten_free is not None:
        product.gluten_free = 1 if product_update.gluten_free else 0
    if product_update.contains_alcohol is not None:
        product.contains_alcohol = 1 if product_update.contains_alcohol else 0
    if "total_calories" in getattr(product_update, "model_fields_set", set()):
        product.total_calories = product_update.total_calories
    if product_update.ingredients is not None:
        _sync_product_ingredients(db, parsed_product_id, product_update.ingredients)

    db.commit()
    db.refresh(product)
    return _product_admin_response(db, product)


@router.put(
    "/products/{product_id}/availability",
    response_model=ProductAdminResponse,
    operation_id="admin_management_set_product_availability",
)
def set_product_availability(
    product_id: str,
    availability: AvailabilityUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(select(Product).where(Product.product_id == parsed_product_id))
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    product.available = availability.available
    db.commit()
    db.refresh(product)
    return _product_admin_response(db, product)


@router.post(
    "/products/{product_id}/toggle-status",
    response_model=ProductAdminResponse,
    operation_id="admin_management_toggle_product_status",
)
def toggle_product_status(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    if product.deleted_at is not None:
        product.status = EntityStatus.ACTIVE
        product.deleted_at = None
    else:
        product.status = EntityStatus.INACTIVE if product.status == EntityStatus.ACTIVE else EntityStatus.ACTIVE
    db.commit()
    db.refresh(product)

    return _product_admin_response(db, product)


@router.delete(
    "/products/{product_id}",
    response_model=ProductAdminResponse,
    operation_id="admin_management_delete_product",
)
def delete_product(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    product.status = EntityStatus.INACTIVE
    product.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return _product_admin_response(db, product)


@router.post(
    "/products/{product_id}/image",
    response_model=ProductImageUploadResponse,
    operation_id="admin_management_upload_product_image",
)
def upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = Query(True),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    # Verify product exists
    product = db.scalar(
        select(Product).where(Product.product_id == parsed_product_id).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    # Validate file type
    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"}
    if file.content_type not in allowed_types:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_image_type", message="Image type is not supported.", details={"content_type": file.content_type, "allowed_types": sorted(allowed_types)})

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
            old_images = db.scalars(select(ProductImage).where(ProductImage.product_id == parsed_product_id)).all()
            for old_img in old_images:
                _delete_uploaded_image_file(old_img.image_path)
                db.delete(old_img)
            db.commit()

        # Create new image record
        new_image = ProductImage(
            product_id=parsed_product_id,
            image_path=public_image_path
        )
        db.add(new_image)
        db.commit()

        return {
            "message": "Image uploaded successfully",
            "filename": unique_filename,
            "url": public_image_path,
            "image_path": public_image_path,
        }

    except Exception as e:
        db.rollback()
        raise AppHTTPException(status_code=500, error="internal_server_error", message="Internal server error.", details={"reason": "request_failed"})


@router.delete(
    "/products/{product_id}/images/{image_id}",
    response_model=MessageResponse,
    operation_id="admin_management_delete_product_image",
)
def delete_product_image(
    product_id: str,
    image_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    image = db.scalar(
        select(ProductImage).where(
            ProductImage.product_id == parsed_product_id,
            ProductImage.image_id == image_id,
        )
    )
    if not image:
        raise AppHTTPException(status_code=404, error="image_not_found", message="Image not found.", details={"reason": "request_failed"})

    _delete_uploaded_image_file(image.image_path)

    db.delete(image)
    db.commit()
    return {"message": "Image removed successfully."}


# ─────────────────────────────────────────────────────────────
# ORDERS
# ─────────────────────────────────────────────────────────────

@router.get(
    "/orders",
    response_model=List[OrderResponse],
    operation_id="admin_management_list_orders",
)
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    orders = db.scalars(
        select(Order)
        .order_by(Order.ordered_at.desc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_order_response(order) for order in orders]


@router.get(
    "/staff/orders",
    response_model=List[OrderResponse],
    operation_id="admin_management_list_staff_orders",
)
def list_staff_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .where(_staff_order_filter())
        .order_by(Order.ordered_at.asc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_order_response(order) for order in orders]


@router.get(
    "/kitchen/orders",
    response_model=List[KitchenOrderResponse],
    operation_id="admin_management_list_kitchen_orders",
)
def list_kitchen_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    orders = db.scalars(
        select(Order)
        .where(
            or_(
                Order.state.in_(KITCHEN_VISIBLE_STATES),
                (
                    (Order.payment_method == PaymentMethod.COUNTER)
                    & (Order.payment_status == PaymentStatus.PAID)
                    & (Order.state.notin_((OrderState.DELIVERED, OrderState.CANCELLED)))
                ),
            )
        )
        .order_by(Order.ordered_at.asc())
        .offset(skip)
        .limit(limit)
    ).unique().all()

    return [_kitchen_order_response(order) for order in orders]


@router.get(
    "/kitchen/orders/{order_id}",
    response_model=KitchenOrderResponse,
    operation_id="admin_management_get_kitchen_order",
)
def get_kitchen_order(
    order_id: int,
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=404, error="order_not_found", message="Order not found.", details={"reason": "request_failed"})
    return _kitchen_order_response(order)


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    operation_id="admin_management_get_order",
)
def get_order(
    order_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return _order_response(_get_order_or_404(db, order_id))


@router.patch(
    "/orders/{order_id}/status",
    response_model=OrderResponse,
    operation_id="admin_management_update_order_status",
)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if current_admin.role == CHEF_ROLE and not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    _ensure_order_status_allowed(current_admin, order, body.state)
    order.state = body.state
    order.admin_id = current_admin.admin_id
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    return _order_response(order)


@router.post(
    "/orders/{order_id}/pay-counter",
    response_model=CounterPaymentResponse,
    operation_id="admin_management_pay_counter_order",
)
def pay_counter_order(
    order_id: int,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if order.payment_method != PaymentMethod.COUNTER:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_payment_method", message="Order payment method does not allow counter payment confirmation.", details={"order_id": order.order_id, "payment_method": str(order.payment_method)})
    if order.payment_status == PaymentStatus.PAID:
        return CounterPaymentResponse(message="Counter order marked as paid.", order=_order_response(order))
    if order.state in {OrderState.CANCELLED, OrderState.DELIVERED}:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_order_state_transition", message="This order can no longer be paid at the counter.", details={"order_id": order.order_id, "state": str(order.state)})

    was_paid = _confirm_counter_payment(db, order, current_admin)
    if order.state not in KITCHEN_VISIBLE_STATES and order.state not in {OrderState.DELIVERED, OrderState.CANCELLED}:
        order.state = OrderState.CONFIRMED
    order.admin_id = current_admin.admin_id
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    if not was_paid:
        try:
            receipt_payload = build_saved_order_receipt_payload(order)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for counter order %s.", order.order_id)

    return CounterPaymentResponse(message="Counter order marked as paid.", order=_order_response(order))


# CUSTOMERS

def _customer_address_payload(body) -> dict:
    return {
        "address": getattr(body, "address", None),
        "postal_code": getattr(body, "postal_code", None),
        "city": getattr(body, "city", None),
    }


def _customer_address_has_data(payload: dict) -> bool:
    return any(str(payload.get(field) or "").strip() for field in ("address", "postal_code", "city"))


def _sync_customer_invoice_address(db: Session, customer: Customer, payload: dict) -> None:
    current_address = customer.billing_address
    if not _customer_address_has_data(payload):
        if current_address:
            db.delete(current_address)
            customer.billing_address = None
        return

    address = current_address or CustomerBillingAddress(customer_id=customer.customer_id)
    address.address = payload.get("address") or None
    address.postal_code = payload.get("postal_code") or None
    address.city = payload.get("city") or None
    address.country = "Portugal"
    if not current_address:
        db.add(address)
        customer.billing_address = address


def _customer_admin_response(customer: Customer) -> dict:
    address = customer.billing_address
    return {
        "customer_id": customer.customer_id,
        "name": customer.name,
        "last_name": customer.last_name,
        "email": customer.email,
        "phone": customer.phone,
        "tax_id": customer.tax_id,
        "address": address.address if address else None,
        "postal_code": address.postal_code if address else None,
        "city": address.city if address else None,
        "status": customer.status,
        "created_at": customer.created_at,
    }


@router.get(
    "/customers",
    response_model=List[CustomerAdminResponse],
    operation_id="admin_management_list_customers",
)
def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    stmt = select(Customer).options(joinedload(Customer.billing_address)).where(Customer.role == UserRole.CLIENT)
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(or_(Customer.name.ilike(pattern), Customer.last_name.ilike(pattern), Customer.email.ilike(pattern)))
    customers = db.scalars(stmt.order_by(Customer.customer_id.desc()).offset(skip).limit(limit)).unique().all()
    return [_customer_admin_response(customer) for customer in customers]


@router.post(
    "/customers",
    response_model=CustomerAdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_customer",
)
def create_customer(
    body: CustomerAdminCreate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.scalar(select(Customer).where(Customer.email == email)):
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_customer_email", message="This email is already associated with an existing customer.", details={"email": email})

    customer = Customer(
        name=body.name,
        last_name=body.last_name,
        email=email,
        password=hash_password(body.password),
        phone=body.phone,
        tax_id=body.tax_id,
        status=body.status,
        role=UserRole.CLIENT,
        created_at=datetime.utcnow(),
    )
    db.add(customer)
    db.flush()
    _sync_customer_invoice_address(db, customer, _customer_address_payload(body))
    db.commit()
    db.refresh(customer)
    return _customer_admin_response(customer)


@router.put(
    "/customers/{customer_id}",
    response_model=CustomerAdminResponse,
    operation_id="admin_management_update_customer",
)
def update_customer(
    customer_id: int,
    body: CustomerAdminUpdate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(Customer)
        .options(joinedload(Customer.billing_address))
        .where(Customer.customer_id == customer_id, Customer.role == UserRole.CLIENT)
        .limit(1)
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.scalar(
            select(Customer).where(Customer.email == email, Customer.customer_id != customer_id)
        )
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_customer_email", message="This email is already associated with an existing customer.", details={"email": email})
        customer.email = email

    for field in ("name", "last_name", "phone", "tax_id", "status"):
        value = getattr(body, field)
        if value is not None:
            setattr(customer, field, value)
    if {"address", "postal_code", "city"}.intersection(body.model_fields_set):
        _sync_customer_invoice_address(db, customer, _customer_address_payload(body))
    if body.password:
        customer.password = hash_password(body.password)

    db.commit()
    db.refresh(customer)
    return _customer_admin_response(customer)


@router.delete(
    "/customers/{customer_id}",
    response_model=CustomerAdminResponse,
    operation_id="admin_management_delete_customer",
)
def delete_customer(
    customer_id: int,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    customer = db.scalar(
        select(Customer)
        .options(joinedload(Customer.billing_address))
        .where(Customer.customer_id == customer_id, Customer.role == UserRole.CLIENT)
        .limit(1)
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})
    customer.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(customer)
    return _customer_admin_response(customer)


# STAFF ADMINS

@router.get(
    "/staff",
    response_model=List[AdminResponse],
    operation_id="admin_management_list_staff_admins",
)
def list_staff_admins(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    admins = db.scalars(
        select(Admin).where(Admin.role.in_(ADMIN_ROLES)).order_by(Admin.admin_id.asc())
    ).all()
    for admin in admins:
        admin.role = normalize_admin_role(admin.role)
    return admins


@router.post(
    "/staff",
    response_model=AdminResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_management_create_staff_admin",
)
def create_staff_admin(
    body: StaffAdminCreate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.scalar(select(Admin).where(Admin.email == email)):
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_admin_email", message="This email is already associated with an existing admin.", details={"email": email})

    admin = Admin(
        name=body.name,
        email=email,
        password=hash_password(body.password),
        created_at=datetime.utcnow().date(),
        status=body.status,
        role=body.role,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@router.put(
    "/staff/{admin_id}",
    response_model=AdminResponse,
    operation_id="admin_management_update_staff_admin",
)
def update_staff_admin(
    admin_id: int,
    body: StaffAdminUpdate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    admin = db.scalar(select(Admin).where(Admin.admin_id == admin_id, Admin.role.in_(ADMIN_ROLES)))
    if not admin:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.scalar(select(Admin).where(Admin.email == email, Admin.admin_id != admin_id))
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_admin_email", message="This email is already associated with an existing admin.", details={"email": email})
        admin.email = email
    if body.name is not None:
        admin.name = body.name
    if body.role is not None:
        admin.role = body.role
    if body.status is not None:
        admin.status = body.status
    if body.password:
        admin.password = hash_password(body.password)

    db.commit()
    db.refresh(admin)
    return admin


@router.delete(
    "/staff/{admin_id}",
    response_model=AdminResponse,
    operation_id="admin_management_delete_staff_admin",
)
def delete_staff_admin(
    admin_id: int,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    if admin_id == current_admin.admin_id:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="cannot_delete_current_admin", message="Current admin account cannot be deleted.", details={"admin_id": admin_id})
    admin = db.scalar(select(Admin).where(Admin.admin_id == admin_id, Admin.role.in_(ADMIN_ROLES)))
    if not admin:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})
    admin.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(admin)
    return admin


# ─────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────

@router.get(
    "/analytics/dashboard",
    response_model=DashboardAnalytics,
    operation_id="admin_management_get_dashboard_analytics",
)
def get_dashboard_analytics(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    total_products, total_categories, total_customers, total_carts = db.execute(
        select(
            select(func.count(Product.product_id))
            .where(Product.status == EntityStatus.ACTIVE)
            .scalar_subquery(),
            select(func.count(Category.category_id))
            .where(Category.status == EntityStatus.ACTIVE)
            .scalar_subquery(),
            select(func.count(Customer.customer_id))
            .where(Customer.status == UserStatus.ACTIVE, Customer.role == UserRole.CLIENT)
            .scalar_subquery(),
            select(func.count(Cart.cart_id)).scalar_subquery(),
        )
    ).one()

    return DashboardAnalytics(
        total_products=total_products,
        total_categories=total_categories,
        total_customers=total_customers,
        total_carts=total_carts,
        unavailable_products=_unavailable_product_rows(db, 5),
        popular_products=_popular_product_rows(db, 5),
        sales_charts=_build_dashboard_sales_graphs(db),
    )

@router.get(
    "/analytics/popular-products",
    response_model=List[PopularProduct],
    operation_id="admin_management_get_popular_products",
)
def get_popular_products(
    limit: int = Query(5, ge=1, le=20),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    return _popular_product_rows(db, limit)


@router.get(
    "/analytics/series",
    response_model=AnalyticsSeriesResponse,
    operation_id="admin_management_get_analytics_series",
)
def get_analytics_series(
    metric: str = Query(..., pattern="^(sales|orders|clients|products)$"),
    range: str = Query("month", pattern="^(day|month|year|custom)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    start, end, granularity = _analytics_window(range, start_date, end_date)
    keys = _analytics_keys(start, end, granularity)
    buckets = {
        key: {
            "value": 0.0,
            "quantity_sold": 0,
            "order_count": 0,
        }
        for key in keys
    }

    if metric in {"sales", "orders"}:
        for key, total_sales, quantity_sold, order_count in _sales_aggregate_rows(
            db, start, end, granularity
        ):
            if key not in buckets:
                continue
            buckets[key]["value"] = total_sales if metric == "sales" else order_count
            buckets[key]["order_count"] = order_count
            buckets[key]["quantity_sold"] = quantity_sold

    elif metric == "products":
        for key, _total_sales, quantity_sold, line_count, _distinct_order_count in _product_sales_aggregate_rows(
            db, start, end, granularity
        ):
            if key not in buckets:
                continue
            buckets[key]["value"] = quantity_sold
            buckets[key]["quantity_sold"] = quantity_sold
            buckets[key]["order_count"] = line_count

    else:
        customer_dates = db.scalars(select(Customer.created_at).where(Customer.role == UserRole.CLIENT)).all()
        for customer_date in customer_dates:
            created_at = _parse_customer_created_at(customer_date)
            if not created_at or created_at < start or created_at > end:
                continue
            key = _analytics_key(created_at, granularity)
            if key not in buckets:
                continue
            buckets[key]["value"] += 1

    points = [
        AnalyticsSeriesPoint(
            period=key,
            label=_analytics_label(key, granularity),
            value=float(buckets[key]["value"]),
            quantity_sold=int(buckets[key]["quantity_sold"]),
            order_count=int(buckets[key]["order_count"]),
        )
        for key in keys
    ]

    return AnalyticsSeriesResponse(
        metric=metric,
        range=range,
        start_date=start.strftime("%Y-%m-%d"),
        end_date=end.strftime("%Y-%m-%d"),
        total=sum(point.value for point in points),
        points=points,
    )


@router.get(
    "/analytics/sales-performance",
    response_model=SalesPerformanceResponse,
    operation_id="admin_management_get_sales_performance",
)
def get_sales_performance(
    days: int = Query(7, ge=1, le=90),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    """Get sales performance over specified number of days."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)

    total_sales = 0.0
    quantity_sold = 0
    order_count = 0
    sales_by_day_by_date = {}

    for date_key, daily_sales, daily_quantity, daily_order_count in _sales_aggregate_rows(
        db,
        datetime.combine(start_date, datetime.min.time()),
        datetime.combine(end_date, datetime.max.time()),
        "day",
    ):
        total_sales += daily_sales
        quantity_sold += daily_quantity
        order_count += daily_order_count
        sales_by_day_by_date[date_key] = {
            "total_sales": daily_sales,
            "quantity_sold": daily_quantity,
            "order_count": daily_order_count,
        }

    # Build sorted list of daily sales
    sales_by_day = [
        PeriodicSalesResponse(
            period=date_str,
            total_sales=stats["total_sales"],
            quantity_sold=stats["quantity_sold"],
            order_count=stats["order_count"]
        )
        for date_str, stats in sorted(sales_by_day_by_date.items())
    ]

    period = f"{start_date} a {end_date}"

    return SalesPerformanceResponse(
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_count=order_count,
        period=period,
        sales_by_day=sales_by_day
    )
