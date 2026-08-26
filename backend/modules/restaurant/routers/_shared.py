"""
Admin routes for product management and analytics.
"""

import logging
from decimal import Decimal
from fastapi import APIRouter, BackgroundTasks, Depends, Request, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import and_, desc, exists, extract, func, or_, select
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union

from database import get_db
from modules.auth.dependencies import rate_limit_staff_login, require_organization_feature, require_organization_header_context, require_organization_role
from modules.auth.models import ORGANIZATION_STAFF_ROLES, User, UserRole, UserStatus, normalize_user_role
from modules.restaurant.models import (
    EntityStatus, IngredientType, MediaOwnerType, OrderState, PaymentMethod,
    PaymentState, PaymentStatus, ReviewStatus,
    Product, Cart, CartProduct as CartItem,
    Category, Order, OrderProduct, Payment, ProductReview,
    Ingredient, ProductIngredient, CustomerBillingAddress, Media, MediaVariant, ProductMedia,
)
from modules.auth.services.authentication import (
    authenticate_staff_user,
    hash_password,
)
from modules.restaurant.schemas.owner import (
    AdminLogin, AdminTokenResponse,
    ProductCreate, ProductUpdate, ProductAdminResponse, ProductMediaUploadResponse,
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
from modules.auth.schemas.user import MessageResponse
from modules.restaurant.services.invoices import ensure_invoice_for_order
from modules.restaurant.services.order_customization import customization_lines
from modules.restaurant.services.product_availability import (
    effective_product_available,
    unavailable_base_ingredients,
    unavailable_base_product_ids,
)
from modules.restaurant.services.receipt_email import build_saved_order_receipt_payload, send_purchase_receipt
from modules.restaurant.services.media_storage import ALLOWED_IMAGE_TYPES, delete_storage_key, store_product_media_upload
from modules.restaurant.services.product_media import product_media_response, product_media_responses
from utils.id_format import format_category_id, format_product_id, parse_category_id, parse_product_id
from core.errors import AppHTTPException
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES

router = APIRouter(
    prefix="/admin",
    tags=["Admin Management"],
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
)
logger = logging.getLogger(__name__)

ADMIN_FEATURE_CONTEXT = Depends(require_organization_role(*ORGANIZATION_STAFF_ROLES))
CATALOG_FEATURE_DEPENDENCIES = [
    ADMIN_FEATURE_CONTEXT,
    Depends(require_organization_feature("catalog")),
]
ORDERING_FEATURE_DEPENDENCIES = [
    ADMIN_FEATURE_CONTEXT,
    Depends(require_organization_feature("ordering")),
]
CUSTOMER_ACCOUNT_FEATURE_DEPENDENCIES = [
    ADMIN_FEATURE_CONTEXT,
    Depends(require_organization_feature("customer_accounts")),
]
ANALYTICS_FEATURE_DEPENDENCIES = [
    ADMIN_FEATURE_CONTEXT,
    Depends(require_organization_feature("catalog")),
    Depends(require_organization_feature("ordering")),
]

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


def _product_staff_response(
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
            "media",
            "unavailable_base_ingredients",
        }
    }
    data["discount_percentage"] = float(product.discount_percentage or 0)
    ingredients = None if ingredient_lookup is None else ingredient_lookup.get(product.product_id)
    if ingredients is None:
        ingredients = _product_ingredient_lookup(db, [product.product_id]).get(product.product_id, [])
    data["ingredients"] = [ingredient.model_dump() for ingredient in ingredients]
    data["media"] = [item.model_dump() for item in product_media_responses(product)]
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
        ProductIngredient.__table__.delete().where(
            ProductIngredient.product_id == product_id,
            ProductIngredient.organization_id == db.info["organization_id"],
        )
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
    snapshot_name = (
        f"{order.customer_first_name or ''} {order.customer_last_name or ''}".strip()
    )
    related_customer_name = (
        f"{order.customer.name or ''} {order.customer.last_name or ''}".strip()
        if order.customer
        else None
    )
    return OrderResponse(
        order_id=order.order_id,
        customer_id=order.customer_id,
        is_guest=order.customer_id is None,
        customer_email=(
            order.customer_email
            or (order.customer.email if order.customer else None)
            or "Unknown"
        ),
        customer_name=snapshot_name or related_customer_name,
        customer_phone=(
            order.customer_phone
            or (order.customer.phone if order.customer else None)
        ),
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


def _ensure_order_status_allowed(current_staff: User, order: Order, next_status: str | OrderState) -> None:
    next_state = OrderState(next_status)
    if current_staff.role == UserRole.CHEF and next_state not in CHEF_ALLOWED_STATES:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    if current_staff.role in {UserRole.MANAGER, UserRole.OWNER} and next_state not in STAFF_ALLOWED_STATES:
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="invalid_order_state_transition", message="Order cannot be moved to the requested state.", details={"order_id": order.order_id, "next_state": str(next_state), "admin_role": str(current_staff.role)})
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
def _confirm_counter_payment(db: Session, order: Order, current_staff: User) -> bool:
    was_paid = order.payment_status == PaymentStatus.PAID
    if was_paid:
        return True
    order.payment_status = PaymentStatus.PAID

    now = datetime.utcnow()
    if order.payment:
        order.payment.state = PaymentState.APPROVED
        order.payment.paid_at = now
        order.payment.confirmed_by_user_id = current_staff.id
    else:
        db.add(Payment(
            order_id=order.order_id,
            method=PaymentMethod.COUNTER,
            state=PaymentState.APPROVED,
            value=order.total,
            transaction_reference=f"COUNTER-{now.strftime('%Y%m%d')}-{order.order_id:03d}",
            paid_at=now,
            confirmed_by_user_id=current_staff.id,
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



__all__ = [name for name in globals() if not name.startswith("__")]
