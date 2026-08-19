"""Customer profile and purchase history routes."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from models import Customer, CustomerBillingAddress, Order, OrderProduct
from schemas import UserProfileUpdate, UserResponse
from schemas.checkout import OrderResponse
from services.order_customization import customization_from_json
from utils.id_format import format_product_id

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


def _product_image_path(product) -> str | None:
    if not product:
        return None

    image_path = None
    if product.images:
        image_path = product.images[0].image_path
    elif product.image:
        image_path = product.image

    if not image_path:
        return None
    if image_path.startswith(("http://", "https://", "/assets/", "/uploads/", "/menu-images/")):
        return image_path
    if image_path.startswith("menu-images/"):
        return f"/{image_path}"
    return f"/menu-images/{image_path}"


def _fulfillment_from_notes(notes: str | None) -> str:
    fulfillment = _note_value(notes, "fulfillment")
    if fulfillment in {"dine_in", "pickup", "takeaway"}:
        return fulfillment
    return "pickup"


def _payment_method_response(method: str | None) -> str:
    if method == "balcao":
        return "cash"
    if method == "mbway":
        return "mbway"
    return "card"


def _payment_filter_values(payment: str) -> list[str]:
    if payment == "cash":
        return ["balcao"]
    if payment == "mbway":
        return ["mbway"]
    if payment == "card":
        return ["cartao", "digital"]
    return [payment]


def _order_response(order: Order) -> dict:
    subtotal = Decimal(str(getattr(order, "subtotal", 0) or 0))
    if subtotal <= 0:
        subtotal = sum(Decimal(str(item.unit_price)) * item.quantity for item in order.items)
    discount = Decimal(str(getattr(order, "total_discount", 0) or 0))
    fees = Decimal(str(order.total)) + discount - subtotal
    latest_refund = sorted(
        order.refunds or [],
        key=lambda refund: refund.refunded_at or datetime.min,
        reverse=True,
    )
    refund = latest_refund[0] if latest_refund else None

    return {
        "order_id": order.order_id,
        "order_number": f"ENC-{order.order_id:06d}",
        "status": order.state,
        "payment_status": order.payment_status,
        "can_cancel": order.state == "pendente" and order.payment_status == "nao_pago",
        "cancellation_source": order.cancellation_origin,
        "cancelled_at": order.canceled_at,
        "refund_status": "Approved" if refund else "None",
        "refund_amount": refund.value if refund else None,
        "refund_reason": refund.reason if refund else None,
        "refund_date": refund.refunded_at if refund else None,
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
                "image": _product_image_path(item.product),
                "calorias": item.product.total_calories if item.product else None,
            }
            for item in order.items
        ],
    }


@router.get("", response_model=UserResponse)
def get_profile(current_user: Customer = Depends(get_current_user)):
    return current_user


@router.put("", response_model=UserResponse)
def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)
    address_was_provided = "billing_address" in body.model_fields_set
    address_update = updates.pop("billing_address", None) if address_was_provided else None
    profile_user = (
        db.query(Customer)
        .options(joinedload(Customer.billing_address))
        .filter(Customer.customer_id == current_user.customer_id)
        .first()
    )
    if not profile_user:
        raise HTTPException(status_code=401, detail="Utilizador não encontrado.")

    new_email = updates.get("email")
    if new_email and new_email != profile_user.email:
        existing = db.query(Customer).filter(
            Customer.email == new_email,
            Customer.customer_id != profile_user.customer_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Este email já está em uso.")

    new_nif = updates.get("tax_id")
    if new_nif and new_nif != profile_user.tax_id:
        existing = db.query(Customer).filter(
            Customer.tax_id == new_nif,
            Customer.customer_id != profile_user.customer_id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Este NIF já está em uso.")

    allowed_notifications = {"email", "sms", "ambos"}
    if "notificacao_preferida" in updates and updates["notificacao_preferida"] not in allowed_notifications:
        raise HTTPException(status_code=400, detail="Preferencia de notificacao invalida.")

    for field, value in updates.items():
        if hasattr(profile_user, field):
            setattr(profile_user, field, value)

    if address_was_provided:
        _sync_invoice_address(db, profile_user, address_update)

    db.commit()
    db.refresh(profile_user)
    return profile_user


@router.get("/orders", response_model=list[OrderResponse])
def get_purchase_history(
    status: Optional[str] = Query(None),
    payment: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    query = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderProduct.product))
        .filter(Order.customer_id == current_user.customer_id)
    )

    if status:
        query = query.filter(Order.state == status)

    if payment:
        query = query.filter(Order.payment_method.in_(_payment_filter_values(payment)))

    if date_from:
        query = query.filter(func.date(Order.ordered_at) >= date_from)

    if date_to:
        query = query.filter(func.date(Order.ordered_at) <= date_to)

    if search:
        pattern = f"%{search}%"
        query = query.join(Order.items).join(OrderProduct.product).filter(
            cast(OrderProduct.product_id, String).ilike(pattern)
        )

    return [_order_response(order) for order in query.order_by(Order.ordered_at.desc()).all()]
