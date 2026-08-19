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
from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status, Query, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_, select
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union

from database import get_db
from dependencies import get_current_admin, require_role
from enums import ADMIN_ROLES, EntityStatus, IngredientType, OrderState, PaymentMethod, PaymentState, PaymentStatus, RefundMethod, RefundStatus, ReviewStatus, UserRole, UserStatus, normalize_admin_role
from models import (
    Admin, Product, Cart, CartProduct as CartItem, Customer, ProductImage,
    Category, Order, OrderProduct, Payment, ProductReview,
    Ingredient, ProductIngredient, Refund, CustomerBillingAddress,
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
    ProductCreate, ProductUpdate, ProductAdminResponse,
    IngredientCreate, IngredientResponse, IngredientUpdate, ProductIngredientPayload,
    ProductIngredientResponse,
    OrderResponse, CartItemResponse, LowStockProduct,
    PopularProduct, VendaPeriodicaResponse, DashboardAnalytics,
    DashboardSalesGraphs,
    ProductAnalyticsResponse,
    AnalyticsSeriesPoint, AnalyticsSeriesResponse,
    CategoryCreate, CategoryResponse, CategoryUpdate, SalesPerformanceResponse,
    CustomerAdminCreate, CustomerAdminResponse, CustomerAdminUpdate,
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


@router.post("/login", response_model=AdminTokenResponse)
def admin_login(credentials: AdminLogin, request: Request, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == credentials.email).first()
    admin, access_token = authenticate_admin(db, admin, credentials.password, request)
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
        "total_sales": 0.0,
        "quantity_sold": 0,
        "order_numbers": 0,
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


def _sales_point(period: str, stats: SalesStats) -> VendaPeriodicaResponse:
    return VendaPeriodicaResponse(
        period=period,
        total_sales=float(stats["total_sales"]),
        quantity_sold=int(stats["quantity_sold"]),
        order_numbers=int(stats["order_numbers"]),
    )


def _add_order_to_sales_bucket(
    buckets: Dict[str, SalesStats],
    bucket_key: str,
    order_total: float,
    item_quantity: int,
) -> None:
    if bucket_key not in buckets:
        return

    buckets[bucket_key]["total_sales"] = float(buckets[bucket_key]["total_sales"]) + order_total
    buckets[bucket_key]["quantity_sold"] = int(buckets[bucket_key]["quantity_sold"]) + item_quantity
    buckets[bucket_key]["order_numbers"] = int(buckets[bucket_key]["order_numbers"]) + 1


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
        db.query(Order)
        .filter(Order.ordered_at >= yearly_start)
        .all()
    )

    for order in orders:
        order_date = order.ordered_at
        if not order_date:
            continue

        order_total = float(order.total or 0)
        item_quantity = sum(item.quantity for item in order.items)

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
        included_by_default=bool(row.included_by_default),
        removable=bool(row.removable) and bool(ingredient and ingredient.type == IngredientType.NORMAL),
        substitutable=bool(row.substitutable),
        quantity=row.quantity,
        calories_per_gram=float(ingredient.calories_per_gram) if ingredient and ingredient.calories_per_gram is not None else None,
    )


def _product_ingredient_lookup(db: Session, product_ids: List[int]) -> Dict[int, List[ProductIngredientResponse]]:
    if not product_ids:
        return {}

    rows = (
        db.query(ProductIngredient)
        .options(joinedload(ProductIngredient.ingredient))
        .filter(ProductIngredient.product_id.in_(product_ids))
        .all()
    )
    lookup: Dict[int, List[ProductIngredientResponse]] = {product_id: [] for product_id in product_ids}
    for row in rows:
        lookup.setdefault(row.product_id, []).append(_ingredient_response(row))
    return lookup


def _product_admin_response(
    db: Session,
    product: Product,
    ingredient_lookup: Optional[Dict[int, List[ProductIngredientResponse]]] = None,
) -> ProductAdminResponse:
    data = ProductAdminResponse.model_validate(product).model_dump()
    ingredients = None if ingredient_lookup is None else ingredient_lookup.get(product.product_id)
    if ingredients is None:
        ingredients = _product_ingredient_lookup(db, [product.product_id]).get(product.product_id, [])
    data["ingredients"] = [ingredient.model_dump() for ingredient in ingredients]
    return ProductAdminResponse(**data)


def _find_or_create_ingredient(db: Session, payload: ProductIngredientPayload) -> Ingredient:
    if payload.ingredient_id is not None:
        ingredient = db.query(Ingredient).filter(Ingredient.ingredient_id == payload.ingredient_id).first()
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

    ingredient = db.query(Ingredient).filter(func.lower(Ingredient.name) == name.lower()).first()
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
        calories_per_gram=payload.calories_per_gram,
    )
    db.add(ingredient)
    db.flush()
    return ingredient


def _sync_product_ingredients(db: Session, product_id: int, ingredients: List[ProductIngredientPayload]) -> None:
    db.query(ProductIngredient).filter(ProductIngredient.product_id == product_id).delete(synchronize_session=False)
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
    latest_refund = _latest_refund(order)
    return OrderResponse(
        cart_id=order.order_id,
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
        refund_status="Approved" if latest_refund else "None",
        refund_id=latest_refund.refund_id if latest_refund else None,
        refund_amount=float(latest_refund.value) if latest_refund else None,
        refund_reason=latest_refund.reason if latest_refund else None,
        refund_notes=latest_refund.notes if latest_refund else None,
        refund_processed_by=latest_refund.admin.name if latest_refund and latest_refund.admin else None,
        refund_processed_by_role=normalize_admin_role(latest_refund.admin.role) if latest_refund and latest_refund.admin else None,
        refund_date=latest_refund.refunded_at if latest_refund else None,
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


def _latest_refund(order: Order) -> Refund | None:
    refunds = sorted(order.refunds or [], key=lambda refund: refund.refunded_at or datetime.min, reverse=True)
    return refunds[0] if refunds else None


def _refund_response(refund: Refund) -> RefundResponse:
    order = refund.order
    customer = order.customer if order else None
    admin = refund.admin
    customer_name = (
        f"{customer.name or ''} {customer.last_name or ''}".strip()
        if customer else "Customer"
    ) or "Customer"
    return RefundResponse(
        refund_id=refund.refund_id,
        order_id=refund.order_id,
        receipt_number=refund.receipt_number,
        order_number=f"ENC-{refund.order_id:06d}",
        original_invoice_number=original_invoice_number(order),
        customer_name=customer_name,
        customer_email=customer.email if customer else "",
        amount=float(refund.value),
        reason=refund.reason,
        notes=refund.notes,
        processed_by=admin.name if admin else "Staff",
        processed_by_role=normalize_admin_role(admin.role) if admin else UserRole.MANAGER,
        date=refund.refunded_at,
        status=refund.status,
        refund_method=REFUND_METHOD_TEXT,
    )


def _kitchen_order_response(order: Order) -> KitchenOrderResponse:
    order = _order_response(order)
    return KitchenOrderResponse(
        cart_id=order.cart_id,
        created_at=order.created_at,
        state=order.state,
        notes=order.notes,
        fulfillment_method=order.fulfillment_method,
        table_number=order.table_number,
        total_items=order.total_items,
        items=order.items,
    )


def _get_order_or_404(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderProduct.product))
        .filter(Order.order_id == order_id)
        .first()
    )
    if not order:
        raise AppHTTPException(status_code=404, error="order_not_found", message="Order not found.", details={"reason": "request_failed"})
    return order


def _ensure_order_status_allowed(current_admin: Admin, next_status: str | OrderState) -> None:
    next_state = OrderState(next_status)
    if current_admin.role == CHEF_ROLE and next_state not in CHEF_ALLOWED_STATES:
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    if current_admin.role == SUPER_ADMIN_ROLE and next_state == OrderState.REFUNDED:
        return
    if current_admin.role in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE} and next_state not in STAFF_ALLOWED_STATES:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_order_state_transition", message="Order cannot be moved to the requested state.", details={"order_id": order.order_id, "next_state": str(next_state), "admin_role": str(current_admin.role)})


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
            transaction_reference=f"BAL-{now.strftime('%Y%m%d')}-{order.order_id:03d}",
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

@router.get("/categories", response_model=List[CategoryResponse])
def list_categories(
    include_inactive: bool = Query(False),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    query = db.query(Category)
    if not include_inactive:
        query = query.filter(Category.status == EntityStatus.ACTIVE)
    return query.order_by(Category.category_name.asc()).all()


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
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


@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: str,
    category_update: CategoryUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.query(Category).filter(Category.category_id == parsed_category_id).first()
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


@router.delete("/categories/{category_id}", response_model=CategoryResponse)
def delete_category(
    category_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_category_id = parse_category_id(category_id)
    category = db.query(Category).filter(Category.category_id == parsed_category_id).first()
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    active_products = (
        db.query(func.count(Product.product_id))
        .filter(Product.category_id == parsed_category_id, active_product_filter(), Product.deleted_at.is_(None))
        .scalar()
        or 0
    )
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

@router.get("/ingredients", response_model=List[IngredientResponse])
def list_ingredients(
    include_inactive: bool = Query(False),
    customization_only: bool = Query(False),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    query = db.query(Ingredient)
    if not include_inactive:
        query = query.filter(Ingredient.status == EntityStatus.ACTIVE)
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
        query = query.filter(
            Ingredient.type != IngredientType.DRINK,
            or_(
                Ingredient.ingredient_id.in_(non_drink_ingredient_ids),
                ~Ingredient.ingredient_id.in_(linked_ingredient_ids),
            ),
        )
    return query.order_by(Ingredient.type.asc(), Ingredient.name.asc()).all()


@router.post("/ingredients", response_model=IngredientResponse, status_code=status.HTTP_201_CREATED)
def create_ingredient(
    ingredient: IngredientCreate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    name = ingredient.name.strip()
    existing = db.query(Ingredient).filter(func.lower(Ingredient.name) == name.lower()).first()
    if existing:
        if existing.status == EntityStatus.INACTIVE:
            existing.status = EntityStatus.ACTIVE
            existing.type = ingredient.type
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
        calories_per_gram=ingredient.calories_per_gram,
    )
    db.add(new_ingredient)
    db.commit()
    db.refresh(new_ingredient)
    return new_ingredient


@router.put("/ingredients/{ingredient_id}", response_model=IngredientResponse)
def update_ingredient(
    ingredient_id: int,
    ingredient_update: IngredientUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    ingredient = db.query(Ingredient).filter(Ingredient.ingredient_id == ingredient_id).first()
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    if ingredient_update.name is not None:
        name = ingredient_update.name.strip()
        existing = (
            db.query(Ingredient)
            .filter(func.lower(Ingredient.name) == name.lower(), Ingredient.ingredient_id != ingredient_id)
            .first()
        )
        if existing:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="duplicate_ingredient_name", message="An ingredient with this name already exists.", details={"name": name})
        ingredient.name = name
    if ingredient_update.type is not None:
        ingredient.type = ingredient_update.type
    if ingredient_update.status is not None:
        ingredient.status = ingredient_update.status
    if "calories_per_gram" in getattr(ingredient_update, "model_fields_set", set()):
        ingredient.calories_per_gram = ingredient_update.calories_per_gram

    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.delete("/ingredients/{ingredient_id}", response_model=IngredientResponse)
def delete_ingredient(
    ingredient_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    ingredient = db.query(Ingredient).filter(Ingredient.ingredient_id == ingredient_id).first()
    if not ingredient:
        raise AppHTTPException(status_code=404, error="ingredient_not_found", message="Ingredient not found.", details={"reason": "request_failed"})

    ingredient.status = EntityStatus.INACTIVE
    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.post("/products", response_model=ProductAdminResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product: ProductCreate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(Category.category_id == product.category_id, Category.status == EntityStatus.ACTIVE).first()
    if not category:
        raise AppHTTPException(status_code=404, error="category_not_found", message="Category not found.", details={"reason": "request_failed"})

    new_product = Product(
        name=product.name,
        product_description=product.product_description,
        price=product.price,
        stock=product.stock,
        category_id=product.category_id,
        admin_id=current_admin.admin_id,
        sold=0,
        status=EntityStatus.ACTIVE,
        customizable=1 if product.customizable else 0,
        menu_tags=product.menu_tags,
        featured=1 if product.featured else 0,
        discount_percentual=product.discount_percentual,
        gluten_free=1 if product.gluten_free else 0,
        contains_alcohol=1 if product.contains_alcohol else 0,
        total_calories=product.total_calories,
    )
    db.add(new_product)
    db.flush()
    _sync_product_ingredients(db, new_product.product_id, product.ingredients)
    db.commit()
    db.refresh(new_product)

    saved_product = db.query(Product).options(joinedload(Product.images)).filter(
        Product.product_id == new_product.product_id
    ).first()
    return _product_admin_response(db, saved_product)


@router.get("/products", response_model=List[ProductAdminResponse])
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
    query = db.query(Product).options(joinedload(Product.images))

    if not include_deleted:
        query = query.filter(active_product_filter(), Product.deleted_at.is_(None))

    if name:
        query = query.filter(Product.name.ilike(f"%{name}%"))

    if category:
        query = query.filter(Product.category_id == parse_category_id(category))

    if min_price is not None:
        query = query.filter(Product.price >= min_price)

    if max_price is not None:
        query = query.filter(Product.price <= max_price)

    if featured is not None:
        query = query.filter(Product.featured == (1 if featured else 0))

    if gluten_free is not None:
        query = query.filter(Product.gluten_free == (1 if gluten_free else 0))

    if contains_alcohol is not None:
        query = query.filter(Product.contains_alcohol == (1 if contains_alcohol else 0))

    products = query.offset(skip).limit(limit).all()
    ingredient_lookup = _product_ingredient_lookup(db, [product.product_id for product in products])
    return [_product_admin_response(db, product, ingredient_lookup) for product in products]


@router.get("/products/{product_id}", response_model=ProductAdminResponse)
def get_product(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.query(Product).options(joinedload(Product.images)).filter(
        Product.product_id == parsed_product_id,
        Product.status == EntityStatus.ACTIVE
    ).first()

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    return _product_admin_response(db, product)


@router.get("/products/{product_id}/analytics", response_model=ProductAnalyticsResponse)
def get_product_analytics(
    product_id: str,
    days: int = Query(30, ge=1, le=365),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.query(Product).filter(Product.product_id == parsed_product_id).first()
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    daily_keys = [(start_date + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(days)]
    daily_buckets = {key: _empty_sales_stats() for key in daily_keys}

    items = (
        db.query(OrderProduct)
        .join(Order, OrderProduct.order_id == Order.order_id)
        .filter(
            OrderProduct.product_id == parsed_product_id,
            func.date(Order.ordered_at) >= start_date,
            func.date(Order.ordered_at) <= end_date,
        )
        .all()
    )

    total_sales = 0.0
    quantity_sold = 0
    order_ids = set()

    for item in items:
        item_total = float(item.unit_price or 0) * item.quantity
        total_sales += item_total
        quantity_sold += item.quantity
        order_ids.add(item.order_id)

        if item.order and item.order.ordered_at:
            date_key = item.order.ordered_at.strftime("%Y-%m-%d")
            if date_key in daily_buckets:
                daily_buckets[date_key]["total_sales"] = float(daily_buckets[date_key]["total_sales"]) + item_total
                daily_buckets[date_key]["quantity_sold"] = int(daily_buckets[date_key]["quantity_sold"]) + item.quantity
                daily_buckets[date_key]["order_numbers"] = int(daily_buckets[date_key]["order_numbers"]) + 1

    average_rating = (
        db.query(func.avg(ProductReview.rating))
        .filter(ProductReview.product_id == parsed_product_id, ProductReview.status == ReviewStatus.APPROVED)
        .scalar()
    )
    total_reviews = (
        db.query(func.count(ProductReview.review_id))
        .filter(ProductReview.product_id == parsed_product_id)
        .scalar()
        or 0
    )

    return ProductAnalyticsResponse(
        product_id=parsed_product_id,
        product_display_id=format_product_id(parsed_product_id),
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_numbers=len(order_ids),
        current_price=float(product.price),
        current_stock=product.stock,
        average_rating=float(average_rating) if average_rating is not None else None,
        total_reviews=total_reviews,
        vendas_por_dia=[_sales_point(key, daily_buckets[key]) for key in daily_keys],
    )


@router.put("/products/{product_id}", response_model=ProductAdminResponse)
def update_product(
    product_id: str,
    product_update: ProductUpdate,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.query(Product).filter(
        Product.product_id == parsed_product_id,
        Product.status == EntityStatus.ACTIVE
    ).first()

    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    if product_update.name is not None:
        product.name = product_update.name
    if product_update.product_description is not None:
        product.product_description = product_update.product_description
    if product_update.price is not None:
        product.price = product_update.price
    if product_update.stock is not None:
        product.stock = product_update.stock
    if product_update.category_id is not None:
        category = db.query(Category).filter(Category.category_id == product_update.category_id, Category.status == EntityStatus.ACTIVE).first()
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
    if product_update.discount_percentual is not None:
        product.discount_percentual = product_update.discount_percentual
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


@router.post("/products/{product_id}/toggle-status", response_model=ProductAdminResponse)
def toggle_product_status(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.query(Product).filter(Product.product_id == parsed_product_id).first()

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


@router.delete("/products/{product_id}", response_model=ProductAdminResponse)
def delete_product(
    product_id: str,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    product = db.query(Product).filter(Product.product_id == parsed_product_id).first()
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    product.status = EntityStatus.INACTIVE
    product.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return _product_admin_response(db, product)


@router.post("/products/{product_id}/image")
def upload_product_image(
    product_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = Query(True),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    parsed_product_id = parse_product_id(product_id)
    # Verify product exists
    product = db.query(Product).filter(Product.product_id == parsed_product_id).first()
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
            old_images = db.query(ProductImage).filter(ProductImage.product_id == parsed_product_id).all()
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


@router.delete("/products/{product_id}/images/{image_id}")
def delete_product_image(
    product_id: str,
    image_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    image = db.query(ProductImage).filter(
        ProductImage.product_id == parsed_product_id,
        ProductImage.image_id == image_id,
    ).first()
    if not image:
        raise AppHTTPException(status_code=404, error="image_not_found", message="Image not found.", details={"reason": "request_failed"})

    _delete_uploaded_image_file(image.image_path)

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
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    orders = (
        db.query(Order)
        .order_by(Order.ordered_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_order_response(order) for order in orders]


@router.get("/staff/orders", response_model=List[OrderResponse])
def list_staff_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(_staff_order_filter())
        .order_by(Order.ordered_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    return [_order_response(order) for order in orders]


@router.get("/kitchen/orders", response_model=List[KitchenOrderResponse])
def list_kitchen_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(
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
        .all()
    )

    return [_kitchen_order_response(order) for order in orders]


@router.get("/kitchen/orders/{order_id}", response_model=KitchenOrderResponse)
def get_kitchen_order(
    order_id: int,
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=404, error="order_not_found", message="Order not found.", details={"reason": "request_failed"})
    return _kitchen_order_response(order)


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_order(
    order_id: int,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    return _order_response(_get_order_or_404(db, order_id))


@router.patch("/orders/{order_id}/status", response_model=OrderResponse)
def update_order_status(
    order_id: int,
    body: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_role(CHEF_ROLE, STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if current_admin.role == CHEF_ROLE and not _is_kitchen_visible(order):
        raise AppHTTPException(status_code=403, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
    _ensure_order_status_allowed(current_admin, body.state)
    should_confirm_counter_payment = (
        current_admin.role in {STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE}
        and order.payment_method == PaymentMethod.COUNTER
        and order.payment_status == PaymentStatus.UNPAID
        and body.state not in {OrderState.PENDING, OrderState.REFUNDED}
    )
    was_paid = False
    if should_confirm_counter_payment:
        was_paid = _confirm_counter_payment(db, order, current_admin)
    order.state = body.state
    order.admin_id = current_admin.admin_id
    order.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(order)
    if should_confirm_counter_payment and not was_paid:
        try:
            receipt_payload = build_saved_order_receipt_payload(order)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for counter order %s.", order.order_id)
    return _order_response(order)


@router.post("/orders/{order_id}/mark-paid", response_model=CounterPaymentResponse)
@router.post("/orders/{order_id}/pay-counter", response_model=CounterPaymentResponse)
def pay_counter_order(
    order_id: int,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if order.payment_method != PaymentMethod.COUNTER:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_payment_method", message="Order payment method does not allow counter payment confirmation.", details={"order_id": order.order_id, "payment_method": str(order.payment_method)})
    if order.payment_status == PaymentStatus.REFUNDED:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="order_already_refunded", message="Order has already been refunded.", details={"order_id": order.order_id})

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

    return CounterPaymentResponse(message="Pedido ao balcão marcado como pago.", order=_order_response(order))


@router.post("/orders/{order_id}/refund", response_model=RefundOrderResponse)
def refund_order(
    order_id: int,
    body: RefundRequest,
    background_tasks: BackgroundTasks,
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    order = _get_order_or_404(db, order_id)
    if order.payment_status == PaymentStatus.REFUNDED:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="order_already_refunded", message="Order has already been refunded.", details={"order_id": order.order_id})
    if order.payment_status != PaymentStatus.PAID:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="order_not_paid", message="Only paid orders can be refunded.", details={"order_id": order.order_id, "payment_status": str(order.payment_status)})
    if Decimal(str(body.amount)) > Decimal(str(order.total)):
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="refund_amount_exceeds_order_total", message="Refund amount cannot exceed order total.", details={"order_id": order.order_id, "amount": str(body.amount), "total": str(order.total)})

    order.payment_status = PaymentStatus.REFUNDED
    order.state = OrderState.REFUNDED
    order.admin_id = current_admin.admin_id
    order.updated_at = datetime.utcnow()
    if order.payment:
        order.payment.state = PaymentState.REFUNDED

    refund = Refund(
        order_id=order.order_id,
        payment_id=order.payment.payment_id if order.payment else None,
        admin_id=current_admin.admin_id,
        value=Decimal(str(body.amount)).quantize(Decimal("0.01")),
        reason=body.reason,
        notes=body.notes.strip(),
        status=RefundStatus.APPROVED,
        method=RefundMethod.ORIGINAL_PAYMENT_METHOD,
        receipt_number=f"RR-TMP-{uuid.uuid4().hex[:12].upper()}",
        refunded_at=datetime.utcnow(),
    )
    db.add(refund)
    db.flush()
    refund.receipt_number = refund_receipt_number(refund)
    db.commit()
    db.refresh(refund)
    db.refresh(order)

    try:
        receipt_payload = build_refund_receipt_payload(refund)
        background_tasks.add_task(send_refund_email, receipt_payload)
    except Exception:
        logger.exception("Failed to schedule refund email for order %s.", order.order_id)

    return RefundOrderResponse(message="Pedido reembolsado.", order=_order_response(order))


@router.get("/refunds", response_model=List[RefundResponse])
def list_refunds(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    staff_member: Optional[int] = Query(None),
    reason: Optional[str] = Query(None),
    refund_status: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Refund)
        .join(Refund.order)
        .join(Order.customer)
        .join(Refund.admin)
    )
    if date_from:
        query = query.filter(func.date(Refund.refunded_at) >= _parse_date_param(date_from, datetime.utcnow()).date())
    if date_to:
        query = query.filter(func.date(Refund.refunded_at) <= _parse_date_param(date_to, datetime.utcnow()).date())
    if staff_member:
        query = query.filter(Refund.admin_id == staff_member)
    if reason:
        query = query.filter(Refund.reason == reason)
    if refund_status:
        query = query.filter(Refund.status == refund_status)

    refunds = query.order_by(Refund.refunded_at.desc()).all()
    return [_refund_response(refund) for refund in refunds]


@router.get("/refunds/export")
def export_refunds(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    staff_member: Optional[int] = Query(None),
    reason: Optional[str] = Query(None),
    refund_status: Optional[str] = Query(None),
    current_admin: Admin = Depends(require_role(STAFF_ADMIN_ROLE, SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    refunds = list_refunds(date_from, date_to, staff_member, reason, refund_status, current_admin, db)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID do Refund", "ID do Pedido", "Customer", "Valor", "Motivo", "Processado Por", "Data", "Estado"])
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


@router.get("/customers", response_model=List[CustomerAdminResponse])
def list_customers(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    query = db.query(Customer).options(joinedload(Customer.billing_address)).filter(Customer.role == UserRole.CLIENT)
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(Customer.name.ilike(pattern), Customer.last_name.ilike(pattern), Customer.email.ilike(pattern)))
    customers = query.order_by(Customer.customer_id.desc()).offset(skip).limit(limit).all()
    return [_customer_admin_response(customer) for customer in customers]


@router.post("/customers", response_model=CustomerAdminResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    body: CustomerAdminCreate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.query(Customer).filter(Customer.email == email).first():
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


@router.put("/customers/{customer_id}", response_model=CustomerAdminResponse)
def update_customer(
    customer_id: int,
    body: CustomerAdminUpdate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    customer = (
        db.query(Customer)
        .options(joinedload(Customer.billing_address))
        .filter(Customer.customer_id == customer_id, Customer.role == UserRole.CLIENT)
        .first()
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.query(Customer).filter(Customer.email == email, Customer.customer_id != customer_id).first()
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


@router.delete("/customers/{customer_id}", response_model=CustomerAdminResponse)
def delete_customer(
    customer_id: int,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    customer = (
        db.query(Customer)
        .options(joinedload(Customer.billing_address))
        .filter(Customer.customer_id == customer_id, Customer.role == UserRole.CLIENT)
        .first()
    )
    if not customer:
        raise AppHTTPException(status_code=404, error="customer_not_found", message="Customer not found.", details={"reason": "request_failed"})
    customer.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(customer)
    return _customer_admin_response(customer)


# STAFF ADMINS

@router.get("/staff", response_model=List[AdminResponse])
def list_staff_admins(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    admins = db.query(Admin).filter(Admin.role.in_(ADMIN_ROLES)).order_by(Admin.admin_id.asc()).all()
    for admin in admins:
        admin.role = normalize_admin_role(admin.role)
    return admins


@router.post("/staff", response_model=AdminResponse, status_code=status.HTTP_201_CREATED)
def create_staff_admin(
    body: StaffAdminCreate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    email = body.email.strip().lower()
    if db.query(Admin).filter(Admin.email == email).first():
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


@router.put("/staff/{admin_id}", response_model=AdminResponse)
def update_staff_admin(
    admin_id: int,
    body: StaffAdminUpdate,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    admin = db.query(Admin).filter(Admin.admin_id == admin_id, Admin.role.in_(ADMIN_ROLES)).first()
    if not admin:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})

    if body.email is not None:
        email = body.email.strip().lower()
        existing = db.query(Admin).filter(Admin.email == email, Admin.admin_id != admin_id).first()
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


@router.delete("/staff/{admin_id}", response_model=AdminResponse)
def delete_staff_admin(
    admin_id: int,
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db),
):
    if admin_id == current_admin.admin_id:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="cannot_delete_current_admin", message="Current admin account cannot be deleted.", details={"admin_id": admin_id})
    admin = db.query(Admin).filter(Admin.admin_id == admin_id, Admin.role.in_(ADMIN_ROLES)).first()
    if not admin:
        raise AppHTTPException(status_code=404, error="admin_not_found", message="Admin not found.", details={"reason": "request_failed"})
    admin.status = UserStatus.SUSPENDED
    db.commit()
    db.refresh(admin)
    return admin


# ─────────────────────────────────────────────────────────────
# ANALYTICS
# ─────────────────────────────────────────────────────────────

@router.get("/analytics/dashboard", response_model=DashboardAnalytics)
def get_dashboard_analytics(
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    # Count totals
    total_products = db.query(func.count(Product.product_id)).filter(Product.status == EntityStatus.ACTIVE).scalar() or 0
    total_categories = db.query(func.count(Category.category_id)).filter(Category.status == EntityStatus.ACTIVE).scalar() or 0
    total_customers = db.query(func.count(Customer.customer_id)).filter(Customer.status == UserStatus.ACTIVE, Customer.role == UserRole.CLIENT).scalar() or 0
    total_carts = db.query(func.count(Cart.cart_id)).scalar() or 0
    
    # Get low-stock products
    low_stock_products = [
        LowStockProduct(
            product_id=p.product_id,
            product_display_id=format_product_id(p.product_id),
            name=p.name,
            stock=p.stock,
            price=float(p.price),
            category=p.category.category_name if p.category else "",
        )
        for p in db.query(Product)
            .filter(Product.status == EntityStatus.ACTIVE)
            .order_by(Product.stock.asc())
            .limit(5)
            .all()
    ]
    
    # Get popular products
    popular_products = [
        PopularProduct(
            product_id=p.product_id,
            product_display_id=format_product_id(p.product_id),
            name=p.name,
            sold=p.sold or 0,
            price=float(p.price),
            category=p.category.category_name if p.category else "",
        )
        for p in db.query(Product)
            .filter(Product.status == EntityStatus.ACTIVE)
            .order_by(desc(Product.sold))
            .limit(5)
            .all()
    ]
    
    return DashboardAnalytics(
        total_products=total_products,
        total_categories=total_categories,
        total_customers=total_customers,
        total_carts=total_carts,
        low_stock_products=low_stock_products,
        popular_products=popular_products,
        sales_charts=_build_dashboard_sales_graphs(db),
    )

@router.get("/analytics/low-stock", response_model=List[LowStockProduct])
def get_low_stock_products(
    limit: int = Query(5, ge=1, le=100),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    products = (
        db.query(Product)
        .filter(Product.status == EntityStatus.ACTIVE)
        .order_by(Product.stock.asc())
        .limit(limit)
        .all()
    )

    return [
        LowStockProduct(
            product_id=p.product_id,
            product_display_id=format_product_id(p.product_id),
            name=p.name,
            stock=p.stock,
            price=float(p.price),
            category=p.category.category_name if p.category else "",
        )
        for p in products
    ]


@router.get("/analytics/popular-products", response_model=List[PopularProduct])
def get_popular_products(
    limit: int = Query(5, ge=1, le=20),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    products = (
        db.query(Product)
        .filter(Product.status == EntityStatus.ACTIVE)
        .order_by(desc(Product.sold))
        .limit(limit)
        .all()
    )

    return [
        PopularProduct(
            product_id=p.product_id,
            product_display_id=format_product_id(p.product_id),
            name=p.name,
            sold=p.sold or 0,
            price=float(p.price),
            category=p.category.category_name if p.category else "",
        )
        for p in products
    ]


@router.get("/analytics/series", response_model=AnalyticsSeriesResponse)
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
            "order_numbers": 0,
        }
        for key in keys
    }

    if metric in {"sales", "orders"}:
        orders = (
            db.query(Order)
            .filter(Order.ordered_at >= start, Order.ordered_at <= end)
            .all()
        )
        for order in orders:
            key = _analytics_key(order.ordered_at, granularity)
            if key not in buckets:
                continue
            buckets[key]["value"] += float(order.total or 0) if metric == "sales" else 1
            buckets[key]["order_numbers"] += 1
            buckets[key]["quantity_sold"] += sum(item.quantity for item in order.items)

    elif metric == "products":
        items = (
            db.query(OrderProduct)
            .join(Order, OrderProduct.order_id == Order.order_id)
            .filter(Order.ordered_at >= start, Order.ordered_at <= end)
            .all()
        )
        for item in items:
            if not item.order:
                continue
            key = _analytics_key(item.order.ordered_at, granularity)
            if key not in buckets:
                continue
            buckets[key]["value"] += item.quantity
            buckets[key]["quantity_sold"] += item.quantity
            buckets[key]["order_numbers"] += 1

    else:
        customers = db.query(Customer).filter(Customer.role == UserRole.CLIENT).all()
        for customer in customers:
            created_at = _parse_customer_created_at(customer.created_at)
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
            order_numbers=int(buckets[key]["order_numbers"]),
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


@router.get("/analytics/sales-performance", response_model=SalesPerformanceResponse)
def get_sales_performance(
    days: int = Query(7, ge=1, le=90),
    current_admin: Admin = Depends(require_role(SUPER_ADMIN_ROLE)),
    db: Session = Depends(get_db)
):
    """Get sales performance over specified number of days."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    
    orders = db.query(Order).filter(
        func.date(Order.ordered_at) >= start_date,
        func.date(Order.ordered_at) <= end_date
    ).all()

    total_sales = 0.0
    quantity_sold = 0
    order_numbers = 0
    vendas_por_dia_dict = {}

    for order in orders:
        order_numbers += 1
        date_key = order.ordered_at.strftime("%Y-%m-%d")
        if date_key not in vendas_por_dia_dict:
            vendas_por_dia_dict[date_key] = {
                "total_sales": 0.0,
                "quantity_sold": 0,
                "order_numbers": 0
            }

        total_sales += float(order.total)
        vendas_por_dia_dict[date_key]["total_sales"] += float(order.total)
        vendas_por_dia_dict[date_key]["order_numbers"] += 1

        for item in order.items:
            quantity_sold += item.quantity
            vendas_por_dia_dict[date_key]["quantity_sold"] += item.quantity
    
    # Build sorted list of daily sales
    vendas_por_dia = [
        VendaPeriodicaResponse(
            period=date_str,
            total_sales=stats["total_sales"],
            quantity_sold=stats["quantity_sold"],
            order_numbers=stats["order_numbers"]
        )
        for date_str, stats in sorted(vendas_por_dia_dict.items())
    ]
    
    period = f"{start_date} a {end_date}"
    
    return SalesPerformanceResponse(
        total_sales=total_sales,
        quantity_sold=quantity_sold,
        order_numbers=order_numbers,
        period=period,
        vendas_por_dia=vendas_por_dia
    )
