"""Customer profile and purchase history routes."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session, joinedload, selectinload

from dependencies import get_current_user
from database import get_db
from schemas.enums import OrderState, PaymentMethod, PaymentStatus
from models import Customer, CustomerBillingAddress, Media, Order, OrderProduct, Product, ProductMedia
from schemas import UserProfileUpdate, UserResponse
from schemas.checkout import OrderResponse
from services.order_customization import customization_from_json
from services.product_media import primary_product_media_response
from utils.id_format import format_product_id
from core.errors import AppHTTPException

router = APIRouter(prefix="/profile", tags=["Profile"])


def _address_payload_has_data(payload: dict | None) -> bool:
    if not payload:
        return False
    return any(str(payload.get(field) or "").strip() for field in ("address", "postal_code", "city"))


def _sync_invoice_address(db: Session, profile_user: Customer, payload: dict | None) -> None:
    current_address = profile_user.billing_address
    if not _address_payload_has_data(payload):
        if current_address:
            db.delete(current_address)
            profile_user.billing_address = None
        return

    address = current_address or CustomerBillingAddress(customer_id=profile_user.customer_id)
    address.address = payload.get("address") or None
    address.postal_code = payload.get("postal_code") or None
    address.city = payload.get("city") or None
    address.country = "Portugal"

    if not current_address:
        db.add(address)
        profile_user.billing_address = address


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


def _payment_method_response(method: PaymentMethod | None) -> str:
    return (method or PaymentMethod.COUNTER).value


def _payment_filter_values(payment: str) -> list[PaymentMethod | str]:
    if payment in {"cash", "counter"}:
        return [PaymentMethod.COUNTER]
    if payment == "mbway":
        return [PaymentMethod.MBWAY]
    if payment == "card":
        return [PaymentMethod.CARD]
    return [payment]


def _order_response(order: Order) -> dict:
    subtotal = Decimal(str(getattr(order, "subtotal", 0) or 0))
    if subtotal <= 0:
        subtotal = sum(Decimal(str(item.unit_price)) * item.quantity for item in order.items)
    discount = Decimal(str(getattr(order, "total_discount", 0) or 0))
    fees = Decimal(str(order.total)) + discount - subtotal
    return {
        "order_id": order.order_id,
        "order_number": f"ENC-{order.order_id:06d}",
        "status": order.state,
        "payment_status": order.payment_status,
        "can_cancel": order.state == OrderState.PENDING and order.payment_status == PaymentStatus.UNPAID,
        "cancellation_source": order.cancellation_origin,
        "cancelled_at": order.canceled_at,
        "delivery_method": _fulfillment_from_notes(order.notes),
        "payment_method": _payment_method_response(order.payment_method),
        "subtotal": subtotal,
        "delivery_fee": Decimal("0"),
        "service_fee": fees if fees > 0 else Decimal("0"),
        "total": order.total,
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


@router.get("", response_model=UserResponse, operation_id="profile_get_profile")
def get_profile(current_user: Customer = Depends(get_current_user)):
    return current_user


@router.put("", response_model=UserResponse, operation_id="profile_update_profile")
def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)
    address_was_provided = "billing_address" in body.model_fields_set
    address_update = updates.pop("billing_address", None) if address_was_provided else None
    profile_user = db.scalar(
        select(Customer)
        .options(joinedload(Customer.billing_address))
        .where(Customer.customer_id == current_user.customer_id)
    )
    if not profile_user:
        raise AppHTTPException(status_code=401, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    new_email = updates.get("email")
    if new_email and new_email != profile_user.email:
        existing = db.scalar(
            select(Customer).where(
                Customer.email == new_email,
                Customer.customer_id != profile_user.customer_id,
            )
        )
        if existing:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="duplicate_email",
                message="This email is already associated with an existing account.",
                details={"email": new_email},
            )

    new_tax_id = updates.get("tax_id")
    if new_tax_id and new_tax_id != profile_user.tax_id:
        existing = db.scalar(
            select(Customer).where(
                Customer.tax_id == new_tax_id,
                Customer.customer_id != profile_user.customer_id,
            )
        )
        if existing:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="duplicate_tax_id",
                message="This tax ID is already associated with an existing account.",
                details={"tax_id": new_tax_id},
            )

    for field, value in updates.items():
        if hasattr(profile_user, field):
            setattr(profile_user, field, value)

    if address_was_provided:
        _sync_invoice_address(db, profile_user, address_update)

    db.commit()
    db.refresh(profile_user)
    return profile_user


@router.get("/orders", response_model=list[OrderResponse], operation_id="profile_get_purchase_history")
def get_purchase_history(
    status: Optional[str] = Query(None),
    payment: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    statement = (
        select(Order)
        .options(
            selectinload(Order.items)
            .joinedload(OrderProduct.product)
            .selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        )
        .where(Order.customer_id == current_user.customer_id)
    )

    if status:
        statement = statement.where(Order.state == status)

    if payment:
        statement = statement.where(Order.payment_method.in_(_payment_filter_values(payment)))

    if date_from:
        statement = statement.where(Order.ordered_at >= datetime.combine(date_from, datetime.min.time()))

    if date_to:
        statement = statement.where(Order.ordered_at <= datetime.combine(date_to, datetime.max.time()))

    if search:
        pattern = f"%{search}%"
        statement = statement.join(Order.items).join(OrderProduct.product).where(
            cast(OrderProduct.product_id, String).ilike(pattern)
        )

    orders = db.scalars(statement.order_by(Order.ordered_at.desc())).unique().all()
    return [_order_response(order) for order in orders]
