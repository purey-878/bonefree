"""Checkout routes backed by the bonefree_resturante order schema."""

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
import secrets
from typing import Optional
from uuid import uuid4
from urllib.parse import quote

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session, joinedload, selectinload

from dependencies import (
    get_current_user,
    get_current_user_optional,
    get_order_access_token_optional,
    rate_limit_order,
)
from core.config import settings
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES
from database import get_db
from schemas.enums import CancellationOrigin, CouponType, EntityStatus, OrderState, PaymentMethod, PaymentState, PaymentStatus, normalize_enum
from models import (
    Cart,
    CartProduct,
    CartProductCustomization,
    Customer,
    CustomerLoyalty,
    Coupon,
    Media,
    Order,
    OrderProduct,
    Payment,
    Product,
    ProductMedia,
)
from schemas.checkout import (
    CouponResponse,
    CouponValidationRequest,
    CouponValidationResponse,
    CheckoutItem,
    CheckoutRequest,
    OrderCreateResponse,
    OrderResponse,
)
from routers.cart import trusted_guest_customization
from services.receipt_email import build_saved_order_receipt_payload
from services.order_customization import customization_from_json, customization_to_json
from services.product_availability import (
    effective_product_available,
    product_unavailable_reason,
    unavailable_base_product_ids,
)
from services.product_pricing import discounted_product_price
from services.product_media import primary_product_media_response
from services.site_settings import get_loyalty_coupon_settings
from utils.id_format import format_product_id
from core.errors import AppHTTPException

try:
    from services.receipt_pdf import receipt_pdf_filename, render_receipt_pdf
except ModuleNotFoundError as exc:
    if exc.name != "reportlab":
        raise
    receipt_pdf_filename = None
    render_receipt_pdf = None

router = APIRouter(prefix="/checkout", tags=["Checkout"])

SERVICE_FEE = Decimal("0")
VAT_PERCENTAGE = Decimal("13.00")


def _included_vat(total: Decimal, vat_percentage: Decimal = VAT_PERCENTAGE) -> Decimal:
    if total <= 0:
        return Decimal("0.00")
    multiplier = Decimal("1") + (vat_percentage / Decimal("100"))
    return (total - (total / multiplier)).quantize(Decimal("0.01"))


def _response_payment_method(order: Order) -> PaymentMethod:
    return order.payment_method or PaymentMethod.COUNTER


def _cart_items_for_user(db: Session, current_user: Customer) -> list[CheckoutItem]:
    cart = db.scalar(select(Cart).where(Cart.customer_id == current_user.customer_id))
    if not cart:
        return []

    return [
        CheckoutItem(
            product_id=item.product_id,
            quantity=item.quantity,
            customization=customization_from_json(item.customization),
        )
        for item in cart.items
    ]


def _clear_user_cart(db: Session, current_user: Optional[Customer]) -> None:
    if not current_user:
        return

    cart = db.scalar(select(Cart).where(Cart.customer_id == current_user.customer_id))
    if not cart:
        return

    cart_item_ids = db.scalars(
        select(CartProduct.cart_product_id).where(CartProduct.cart_id == cart.cart_id)
    ).all()
    if not cart_item_ids:
        return

    db.execute(
        delete(CartProductCustomization).where(
            CartProductCustomization.cart_product_id.in_(cart_item_ids)
        )
    )
    db.execute(delete(CartProduct).where(CartProduct.cart_product_id.in_(cart_item_ids)))


def _update_authenticated_checkout_customer(
    db: Session,
    body: CheckoutRequest,
    current_user: Customer,
) -> Customer:
    tax_id_provided = "tax_id" in body.customer.model_fields_set
    checkout_tax_id = (body.customer.tax_id or "").strip() or None
    customer = db.scalar(
        select(Customer).where(Customer.customer_id == current_user.customer_id)
    ) or current_user
    should_save_checkout_tax_id = tax_id_provided and checkout_tax_id and not customer.tax_id
    if should_save_checkout_tax_id:
        existing = db.scalar(
            select(Customer).where(
                Customer.tax_id == checkout_tax_id,
                Customer.customer_id != customer.customer_id,
            )
        )
        if existing:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="duplicate_tax_id",
                message="This tax ID is already associated with an existing account.",
                details={"tax_id": checkout_tax_id},
            )
        customer.tax_id = checkout_tax_id

    customer.name = body.customer.first_name
    customer.last_name = body.customer.last_name
    if body.customer.phone:
        customer.phone = body.customer.phone
    return customer


def _hash_order_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _new_guest_order_access() -> tuple[str, str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(
        hours=settings.order_access_token_expiration_hours
    )
    return token, _hash_order_access_token(token), expires_at


def _authorize_order_access(
    order: Order,
    current_user: Customer | None,
    access_token: str | None,
) -> None:
    if current_user and order.customer_id == current_user.customer_id:
        return

    if access_token and order.order_access_token_hash:
        token_matches = secrets.compare_digest(
            _hash_order_access_token(access_token),
            order.order_access_token_hash,
        )
        if token_matches:
            if (
                order.order_access_expires_at is None
                or order.order_access_expires_at <= datetime.utcnow()
            ):
                raise AppHTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    error="order_access_expired",
                    message="Order access has expired.",
                    details={"order_id": order.order_id},
                )
            return

    if current_user is None and not access_token:
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="order_access_required",
            message="Order access credentials are required.",
            details={"order_id": order.order_id},
        )

    raise AppHTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        error="order_not_found",
        message="Order not found.",
        details={"reason": "request_failed"},
    )


def _load_order_for_customer_or_guest(
    db: Session,
    order_id: int,
    current_user: Customer | None,
    access_token: str | None,
) -> Order:
    if current_user is None and not access_token:
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="order_access_required",
            message="Order access credentials are required.",
            details={"order_id": order_id},
        )

    order = db.scalar(
        select(Order)
        .options(
            joinedload(Order.customer),
            selectinload(Order.items)
            .joinedload(OrderProduct.product)
            .selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants),
        )
        .where(Order.order_id == order_id)
        .limit(1)
    )
    if not order:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="order_not_found",
            message="Order not found.",
            details={"reason": "request_failed"},
        )

    _authorize_order_access(order, current_user, access_token)
    return order


def _checkout_notes(body: CheckoutRequest, extra_parts: Optional[list[str]] = None) -> str:
    parts = [
        f"fulfillment={body.fulfillment_method}",
        f"checkout_payment={body.payment_method}",
    ]
    if body.customer.table_number is not None:
        parts.append(f"table_number={body.customer.table_number}")

    if extra_parts:
        parts.extend(extra_parts)

    return " | ".join(parts)[:500]


def _note_value(notes: str | None, key: str) -> str | None:
    if not notes:
        return None

    prefix = f"{key}="
    for part in notes.split(" | "):
        if part.startswith(prefix):
            return part.removeprefix(prefix)
    return None


def _fulfillment_from_notes(notes: str | None) -> str:
    fulfillment = _note_value(notes, "fulfillment")
    if fulfillment in {"dine_in", "pickup", "takeaway"}:
        return fulfillment
    return "pickup"


def _coupon_discount_from_notes(notes: str | None) -> Decimal:
    raw_value = _note_value(notes, "coupon_discount")
    if not raw_value:
        return Decimal("0")
    try:
        return Decimal(raw_value)
    except Exception:
        return Decimal("0")


def _coupon_code_from_notes(notes: str | None) -> str | None:
    return _note_value(notes, "coupon")


def _generated_coupon_from_notes(notes: str | None) -> str | None:
    return _note_value(notes, "coupon_generated")


def _normalize_coupon_code(value: str | None) -> str | None:
    code = (value or "").strip().upper()
    return code or None


def _available_coupon_statement(current_user: Customer):
    now = datetime.utcnow()
    return select(Coupon).where(
        Coupon.customer_id == current_user.customer_id,
        Coupon.used.is_(False),
        ((Coupon.expires_at.is_(None)) | (Coupon.expires_at > now)),
    )


def _calculate_coupon_discount(coupon: Coupon, subtotal: Decimal) -> Decimal:
    if subtotal < Decimal(str(coupon.minimum_order_value)):
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="coupon_minimum_order_not_met", message="Order subtotal does not meet the coupon minimum value.", details={"coupon_code": coupon.code, "subtotal": str(subtotal), "minimum_order_value": str(coupon.minimum_order_value)})

    if normalize_enum(CouponType, coupon.type) == CouponType.PERCENTAGE:
        discount = subtotal * (Decimal(str(coupon.value)) / Decimal("100"))
    else:
        discount = Decimal(str(coupon.value))

    return min(subtotal, discount).quantize(Decimal("0.01"))


def _get_valid_coupon(db: Session, current_user: Customer, code: str | None, subtotal: Decimal) -> tuple[Coupon | None, Decimal]:
    normalized_code = _normalize_coupon_code(code)
    if not normalized_code:
        return None, Decimal("0")

    coupon = db.scalar(
        _available_coupon_statement(current_user).where(Coupon.code == normalized_code)
    )
    if not coupon:
        raise AppHTTPException(status_code=status.HTTP_404_NOT_FOUND, error="coupon_not_found", message="Coupon not found or unavailable.", details={"code": normalized_code})

    return coupon, _calculate_coupon_discount(coupon, subtotal)


def _get_or_create_loyalty(db: Session, current_user: Customer) -> CustomerLoyalty:
    loyalty = db.scalar(
        select(CustomerLoyalty).where(CustomerLoyalty.customer_id == current_user.customer_id)
    )
    if not loyalty:
        loyalty = CustomerLoyalty(customer_id=current_user.customer_id, orders_above_50=0, total_coupons_earned=0)
        db.add(loyalty)
        db.flush()
    return loyalty


def _coupon_code_prefix(discount_type: str, discount_value: Decimal) -> str:
    normalized_value = discount_value.quantize(Decimal("0.01"))
    compact_value = (
        str(int(normalized_value))
        if normalized_value == normalized_value.to_integral_value()
        else str(normalized_value).replace(".", "")
    )
    return f"BONEFREE{compact_value}P" if normalize_enum(CouponType, discount_type) == CouponType.PERCENTAGE else f"BONEFREE{compact_value}"


def _new_coupon_code(db: Session, current_user: Customer, discount_type: str, discount_value: Decimal) -> str:
    prefix = _coupon_code_prefix(discount_type, discount_value)
    for _ in range(10):
        code = f"{prefix}-{current_user.customer_id}-{uuid4().hex[:6].upper()}"
        coupon_exists = db.scalar(select(exists().where(Coupon.code == code)))
        if not coupon_exists:
            return code
    return f"{prefix}-{uuid4().hex[:12].upper()}"


def _award_loyalty_coupon_if_eligible(db: Session, current_user: Customer, qualifying_subtotal: Decimal) -> str | None:
    settings = get_loyalty_coupon_settings(db)
    qualifying_minimum = Decimal(str(settings.qualifying_order_minimum))
    qualifying_count = int(settings.qualifying_order_count)

    if qualifying_subtotal < qualifying_minimum:
        return None

    loyalty = db.scalar(
        select(CustomerLoyalty).where(CustomerLoyalty.customer_id == current_user.customer_id)
    )
    if not settings.enabled and (not loyalty or loyalty.orders_above_50 <= 0):
        return None

    if not loyalty:
        loyalty = _get_or_create_loyalty(db, current_user)

    loyalty.orders_above_50 += 1
    loyalty.updated_at = datetime.utcnow()

    if loyalty.orders_above_50 < qualifying_count:
        return None

    loyalty.orders_above_50 -= qualifying_count
    loyalty.total_coupons_earned += 1
    if not settings.enabled:
        loyalty.orders_above_50 = 0

    discount_value = Decimal(str(settings.discount_value))
    coupon_minimum_order = Decimal(str(settings.coupon_minimum_order))
    code = _new_coupon_code(db, current_user, settings.discount_type, discount_value)
    db.add(Coupon(
        customer_id=current_user.customer_id,
        code=code,
        type=settings.discount_type,
        value=discount_value,
        minimum_order_value=coupon_minimum_order,
        used=False,
    ))
    return code


def _order_response(order: Order) -> dict:
    subtotal = Decimal(str(getattr(order, "subtotal", 0) or 0))
    if subtotal <= 0:
        subtotal = sum(Decimal(str(item.unit_price)) * item.quantity for item in order.items)
    discount = Decimal(str(getattr(order, "total_discount", 0) or 0))
    if discount <= 0:
        discount = _coupon_discount_from_notes(order.notes)
    fees = Decimal(str(order.total)) + discount - subtotal
    response_payment = _response_payment_method(order)
    return {
        "order_id": order.order_id,
        "order_number": f"ENC-{order.order_id:06d}",
        "status": order.state,
        "payment_status": order.payment_status,
        "can_cancel": _can_customer_cancel(order),
        "cancellation_source": order.cancellation_origin,
        "cancelled_at": order.canceled_at,
        "delivery_method": _fulfillment_from_notes(order.notes),
        "payment_method": response_payment,
        "subtotal": subtotal,
        "discount": discount,
        "delivery_fee": Decimal("0"),
        "service_fee": fees if fees > 0 else Decimal("0"),
        "total": order.total,
        "coupon_code": _coupon_code_from_notes(order.notes),
        "generated_coupon": _generated_coupon_from_notes(order.notes),
        "created_at": order.ordered_at,
        "items": [
            {
                "product_id": item.product_id,
                "product_display_id": format_product_id(item.product_id),
                "product_name": item.product_name_snapshot or (item.product.name if item.product else format_product_id(item.product_id)),
                "unit_price": item.unit_price,
                "quantity": item.quantity,
                "customization": customization_from_json(item.customization),
                "subtotal": Decimal(str(item.unit_price)) * item.quantity,
                "media": primary_product_media_response(item.product) if item.product else None,
                "calories": item.product.total_calories if item.product else None,
            }
            for item in order.items
        ],
    }


def _can_customer_cancel(order: Order) -> bool:
    return order.state == OrderState.PENDING and order.payment_status == PaymentStatus.UNPAID


@router.get("/coupons", response_model=list[CouponResponse], operation_id="checkout_list_available_coupons")
def list_available_coupons(
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    coupons = db.scalars(
        _available_coupon_statement(current_user).order_by(Coupon.created_at.desc())
    ).all()
    return [
        CouponResponse(
            coupon_id=coupon.coupon_id,
            code=coupon.code,
            type=coupon.type,
            value=coupon.value,
            minimum_order_value=coupon.minimum_order_value,
            expires_at=coupon.expires_at,
        )
        for coupon in coupons
    ]


@router.post(
    "/coupons/validate",
    response_model=CouponValidationResponse,
    operation_id="checkout_validate_coupon",
)
def validate_coupon(
    body: CouponValidationRequest,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    coupon, discount = _get_valid_coupon(db, current_user, body.code, body.subtotal)
    if not coupon:
        raise AppHTTPException(status_code=status.HTTP_404_NOT_FOUND, error="coupon_not_found", message="Coupon not found or unavailable.", details={"code": body.code})

    return CouponValidationResponse(
        code=coupon.code,
        discount=discount,
        value=coupon.value,
        type=coupon.type,
        minimum_order_value=coupon.minimum_order_value,
    )


@router.post(
    "/orders",
    response_model=OrderCreateResponse,
    status_code=status.HTTP_201_CREATED,
    operation_id="checkout_create_order",
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
)
def create_order(
    body: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
    _rate_limit: None = Depends(rate_limit_order),
):
    items = _cart_items_for_user(db, current_user) if current_user else body.items
    if current_user and not items:
        items = body.items

    if not items:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="empty_cart",
            message="Cart must contain at least one item.",
            details={},
        )

    if not current_user and _normalize_coupon_code(body.promo_code):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="authentication_required",
            message="Authentication is required to use a coupon.",
            details={},
        )

    product_ids = [item.product_id for item in items]
    products = db.scalars(
        select(Product)
        .options(
            selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        )
        .where(Product.product_id.in_(product_ids))
    ).unique().all()
    product_map = {product.product_id: product for product in products}
    unavailable_base_ids = unavailable_base_product_ids(db, product_ids)

    subtotal = Decimal("0")
    order_items: list[dict] = []

    for item in items:
        product = product_map.get(item.product_id)
        if not product or product.status == EntityStatus.INACTIVE or product.deleted_at is not None:
            raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

        if not effective_product_available(product, unavailable_base_ids):
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="product_unavailable",
                message="Product is currently unavailable.",
                details={
                    "product_id": product.product_id,
                    "reason": product_unavailable_reason(product, unavailable_base_ids),
                },
            )

        trusted_customization, _ = trusted_guest_customization(
            db,
            product,
            item.quantity,
            item.customization,
        )
        unit_price = (
            Decimal(str(trusted_customization.final_unit_price))
            if trusted_customization and trusted_customization.final_unit_price is not None
            else discounted_product_price(product)
        )
        line_total = unit_price * item.quantity
        subtotal += line_total
        product.sold = (product.sold or 0) + item.quantity

        order_items.append({
            "product_id": product.product_id,
            "product_name_snapshot": product.name,
            "discount_percentage_snapshot": Decimal(str(product.discount_percentage or 0)),
            "unit_price": unit_price,
            "quantity": item.quantity,
            "customization": customization_to_json(trusted_customization),
        })

    if current_user:
        customer = _update_authenticated_checkout_customer(db, body, current_user)
        customer_id = customer.customer_id
        order_access_token = None
        order_access_token_hash = None
        order_access_expires_at = None
    else:
        customer_id = None
        (
            order_access_token,
            order_access_token_hash,
            order_access_expires_at,
        ) = _new_guest_order_access()

    db_method = PaymentMethod.COUNTER
    delivery_fee = Decimal("0")
    coupon, coupon_discount = (
        _get_valid_coupon(db, current_user, body.promo_code, subtotal)
        if current_user
        else (None, Decimal("0"))
    )
    total = subtotal - coupon_discount + delivery_fee + SERVICE_FEE
    vat_amount = _included_vat(total)
    generated_coupon_code = (
        _award_loyalty_coupon_if_eligible(db, current_user, subtotal)
        if current_user
        else None
    )
    note_parts: list[str] = []
    if coupon:
        note_parts.extend([f"coupon={coupon.code}", f"coupon_discount={coupon_discount:.2f}"])
        coupon.used = True
        coupon.used_at = datetime.utcnow()
    if generated_coupon_code:
        note_parts.append(f"coupon_generated={generated_coupon_code}")
    order_notes = _checkout_notes(body, note_parts)

    order = Order(
        customer_id=customer_id,
        admin_id=None,
        customer_first_name=body.customer.first_name,
        customer_last_name=body.customer.last_name,
        customer_email=body.customer.email,
        customer_phone=body.customer.phone,
        customer_tax_id=(body.customer.tax_id or "").strip() or None,
        order_access_token_hash=order_access_token_hash,
        order_access_expires_at=order_access_expires_at,
        state=OrderState.PENDING,
        payment_method=db_method,
        payment_status=PaymentStatus.UNPAID,
        subtotal=subtotal,
        vat_percentage=VAT_PERCENTAGE,
        vat_amount=vat_amount,
        total_discount=coupon_discount,
        total=total,
        notes=order_notes,
        items=[
            OrderProduct(
                product_id=item["product_id"],
                quantity=item["quantity"],
                unit_price=item["unit_price"],
                product_name_snapshot=item["product_name_snapshot"],
                discount_percentage_snapshot=item["discount_percentage_snapshot"],
                vat_percentage_snapshot=VAT_PERCENTAGE,
                customization=item["customization"],
            )
            for item in order_items
        ],
    )

    db.add(order)
    db.flush()

    db.add(Payment(
        order_id=order.order_id,
        method=db_method,
        state=PaymentState.PENDING,
        value=total,
        transaction_reference=f"COUNTER-{datetime.utcnow().strftime('%Y%m%d')}-{order.order_id:03d}",
        paid_at=None,
    ))

    db.flush()
    _clear_user_cart(db, current_user)
    db.commit()

    saved = db.scalar(
        select(Order)
        .options(
            selectinload(Order.items)
            .joinedload(OrderProduct.product)
            .selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        )
        .where(Order.order_id == order.order_id)
        .limit(1)
    )
    response = _order_response(saved)
    response.update({
        "order_access_token": order_access_token,
        "order_access_expires_at": order_access_expires_at,
    })

    return response


@router.post(
    "/orders/{order_id}/cancel",
    response_model=OrderResponse,
    operation_id="checkout_cancel_order",
)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
    access_token: str | None = Depends(get_order_access_token_optional),
):
    order = _load_order_for_customer_or_guest(
        db,
        order_id,
        current_user,
        access_token,
    )
    if not _can_customer_cancel(order):
        raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="order_cannot_be_cancelled", message="Order cannot be cancelled.", details={"order_id": order.order_id, "state": str(order.state), "payment_status": str(order.payment_status)})

    order.state = OrderState.CANCELLED
    order.canceled_at = datetime.utcnow()
    order.cancellation_origin = CancellationOrigin.CLIENT
    order.updated_at = datetime.utcnow()
    if order.payment:
        order.payment.state = PaymentState.REJECTED
    db.commit()
    db.refresh(order)
    return _order_response(order)


@router.get(
    "/orders/{order_id}/receipt.pdf",
    response_class=Response,
    operation_id="checkout_download_order_receipt_pdf",
    responses={
        200: {
            "description": "Order receipt PDF",
            "content": {"application/pdf": {"schema": {"type": "string", "format": "binary"}}},
        }
    },
)
def download_order_receipt_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
    access_token: str | None = Depends(get_order_access_token_optional),
):
    if not render_receipt_pdf or not receipt_pdf_filename:
        raise AppHTTPException(status_code=503, error="service_unavailable", message="Service unavailable.", details={"reason": "request_failed"})

    order = _load_order_for_customer_or_guest(
        db,
        order_id,
        current_user,
        access_token,
    )
    if order.payment_status != PaymentStatus.PAID:
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="receipt_not_available",
            message="The receipt is available only after counter payment.",
            details={"order_id": order.order_id},
        )

    receipt = build_saved_order_receipt_payload(order)
    filename = receipt_pdf_filename(receipt)
    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
        "Cache-Control": "private, max-age=300",
    }

    return Response(
        content=render_receipt_pdf(receipt),
        media_type="application/pdf",
        headers=headers,
    )


@router.get(
    "/orders/history",
    response_model=list[OrderResponse],
    operation_id="checkout_list_order_history",
)
def list_order_history(
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    orders = db.scalars(
        select(Order)
        .options(
            selectinload(Order.items)
            .joinedload(OrderProduct.product)
            .selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        )
        .where(Order.customer_id == current_user.customer_id)
        .order_by(Order.ordered_at.desc())
    ).unique().all()
    return [_order_response(order) for order in orders]


@router.get(
    "/orders/{order_id}",
    response_model=OrderResponse,
    operation_id="checkout_get_order",
)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Customer | None = Depends(get_current_user_optional),
    access_token: str | None = Depends(get_order_access_token_optional),
):
    order = _load_order_for_customer_or_guest(
        db,
        order_id,
        current_user,
        access_token,
    )
    return _order_response(order)
