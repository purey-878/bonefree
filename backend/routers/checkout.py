"""Checkout routes backed by the bonefree_resturante order schema."""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import uuid4
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from dependencies import get_current_user_optional
from services.auth_service import hash_password
from database import get_db
from models import (
    Cart,
    CartProduct,
    CartProductCustomization,
    Customer,
    CustomerLoyalty,
    Coupon,
    Order,
    OrderProduct,
    Payment,
    Product,
)
from schemas.checkout import CouponResponse, CouponValidationRequest, CouponValidationResponse, CheckoutItem, CheckoutRequest, OrderResponse
from services.invoices import ensure_invoice_for_order
from services.receipt_email import build_order_receipt_payload, build_saved_order_receipt_payload, send_purchase_receipt
from services.order_customization import customization_from_json, customization_to_json
from services.product_availability import unavailable_due_to_inactive_base
from services.product_pricing import discounted_product_price
from services.site_settings import get_loyalty_coupon_settings
from utils.id_format import format_product_id

try:
    from services.receipt_pdf import receipt_pdf_filename, render_receipt_pdf
except ModuleNotFoundError as exc:
    if exc.name != "reportlab":
        raise
    receipt_pdf_filename = None
    render_receipt_pdf = None

router = APIRouter(prefix="/checkout", tags=["Checkout"])
logger = logging.getLogger(__name__)

SERVICE_FEE = Decimal("0")
IVA_PERCENTUAL = Decimal("13.00")
ONLINE_PAYMENT_METHODS = {"cartao", "mbway", "digital"}


def _product_image_path(product: Product | None) -> str | None:
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


def _payment_method(payment_method: str) -> str:
    if payment_method == "cash":
        return "balcao"
    if payment_method in {"mbway", "qr_pay"}:
        return "mbway"
    return "cartao"


def _is_online_payment(method: str | None) -> bool:
    return method in ONLINE_PAYMENT_METHODS


def _included_iva(total: Decimal, vat_percentage: Decimal = IVA_PERCENTUAL) -> Decimal:
    if total <= 0:
        return Decimal("0.00")
    multiplier = Decimal("1") + (vat_percentage / Decimal("100"))
    return (total - (total / multiplier)).quantize(Decimal("0.01"))


def _format_money_pt(value: Decimal) -> str:
    amount = Decimal(str(value)).quantize(Decimal("0.01"))
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    whole, cents = f"{amount:.2f}".split(".")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    return f"{sign}{'.'.join(groups)},{cents} €"


def _response_payment_method(order: Order) -> str:
    checkout_payment = _note_value(order.notes, "checkout_payment")
    if checkout_payment == "qr_pay":
        return "mbway"
    if checkout_payment in {"card", "cash", "mbway"}:
        return checkout_payment
    if order.payment_method == "balcao":
        return "cash"
    if order.payment_method == "mbway":
        return "mbway"
    return "card"


def _cart_items_for_user(db: Session, current_user: Customer) -> list[CheckoutItem]:
    cart = db.query(Cart).filter(Cart.customer_id == current_user.customer_id).first()
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

    cart = db.query(Cart).filter(Cart.customer_id == current_user.customer_id).first()
    if not cart:
        return

    cart_item_ids = [
        cart_product_id
        for (cart_product_id,) in db.query(CartProduct.cart_product_id)
        .filter(CartProduct.cart_id == cart.cart_id)
        .all()
    ]
    if not cart_item_ids:
        return

    db.query(CartProductCustomization).filter(
        CartProductCustomization.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)
    db.query(CartProduct).filter(
        CartProduct.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)


def _get_or_create_checkout_customer(db: Session, body: CheckoutRequest, current_user: Optional[Customer]) -> Customer:
    nif_provided = "tax_id" in body.customer.model_fields_set
    checkout_nif = (body.customer.tax_id or "").strip() or None

    if current_user:
        customer = db.query(Customer).filter(Customer.customer_id == current_user.customer_id).first() or current_user
        should_save_checkout_nif = nif_provided and checkout_nif and not customer.tax_id
        if should_save_checkout_nif:
            existing = db.query(Customer).filter(
                Customer.tax_id == checkout_nif,
                Customer.customer_id != customer.customer_id,
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Este NIF já está em uso.")
        if should_save_checkout_nif:
            customer.tax_id = checkout_nif
        customer.name = body.customer.first_name
        customer.last_name = body.customer.last_name
        if body.customer.phone:
            customer.phone = body.customer.phone
        return customer

    customer = db.query(Customer).filter(Customer.email == body.customer.email).first()
    if customer:
        should_save_checkout_nif = nif_provided and checkout_nif and not customer.tax_id
        if should_save_checkout_nif:
            existing = db.query(Customer).filter(
                Customer.tax_id == checkout_nif,
                Customer.customer_id != customer.customer_id,
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Este NIF já está em uso.")
        if should_save_checkout_nif:
            customer.tax_id = checkout_nif
        customer.name = body.customer.first_name
        customer.last_name = body.customer.last_name
        if body.customer.phone:
            customer.phone = body.customer.phone
        return customer

    customer = Customer(
        name=body.customer.first_name,
        last_name=body.customer.last_name,
        email=body.customer.email,
        phone=body.customer.phone,
        tax_id=checkout_nif,
        password=hash_password(uuid4().hex),
        status=1,
        created_at=datetime.utcnow(),
    )
    db.add(customer)
    db.flush()
    return customer


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


def _available_coupon_query(db: Session, current_user: Customer):
    now = datetime.utcnow()
    return db.query(Coupon).filter(
        Coupon.customer_id == current_user.customer_id,
        Coupon.used.is_(False),
        ((Coupon.expires_at.is_(None)) | (Coupon.expires_at > now)),
    )


def _calculate_coupon_discount(coupon: Coupon, subtotal: Decimal) -> Decimal:
    if subtotal < Decimal(str(coupon.minimum_order_value)):
        raise HTTPException(
            status_code=400,
            detail=f"O cupão requer um pedido mínimo de {_format_money_pt(Decimal(str(coupon.minimum_order_value)))}.",
        )

    if coupon.type == "PERCENTAGEM":
        discount = subtotal * (Decimal(str(coupon.value)) / Decimal("100"))
    else:
        discount = Decimal(str(coupon.value))

    return min(subtotal, discount).quantize(Decimal("0.01"))


def _get_valid_coupon(db: Session, current_user: Customer, code: str | None, subtotal: Decimal) -> tuple[Coupon | None, Decimal]:
    normalized_code = _normalize_coupon_code(code)
    if not normalized_code:
        return None, Decimal("0")

    coupon = _available_coupon_query(db, current_user).filter(Coupon.code == normalized_code).first()
    if not coupon:
        raise HTTPException(status_code=400, detail="O cupão é inválido, expirou ou já foi used.")

    return coupon, _calculate_coupon_discount(coupon, subtotal)


def _get_or_create_loyalty(db: Session, current_user: Customer) -> CustomerLoyalty:
    loyalty = db.query(CustomerLoyalty).filter(CustomerLoyalty.customer_id == current_user.customer_id).first()
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
    return f"BONEFREE{compact_value}P" if discount_type == "PERCENTAGEM" else f"BONEFREE{compact_value}"


def _new_coupon_code(db: Session, current_user: Customer, discount_type: str, discount_value: Decimal) -> str:
    prefix = _coupon_code_prefix(discount_type, discount_value)
    for _ in range(10):
        code = f"{prefix}-{current_user.customer_id}-{uuid4().hex[:6].upper()}"
        exists = db.query(Coupon).filter(Coupon.code == code).first()
        if not exists:
            return code
    return f"{prefix}-{uuid4().hex[:12].upper()}"


def _award_loyalty_coupon_if_eligible(db: Session, current_user: Customer, qualifying_subtotal: Decimal) -> str | None:
    settings = get_loyalty_coupon_settings(db)
    qualifying_minimum = Decimal(str(settings.qualifying_order_minimum))
    qualifying_count = int(settings.qualifying_order_count)

    if qualifying_subtotal < qualifying_minimum:
        return None

    loyalty = db.query(CustomerLoyalty).filter(CustomerLoyalty.customer_id == current_user.customer_id).first()
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
        "can_cancel": _can_customer_cancel(order),
        "cancellation_source": order.cancellation_origin,
        "cancelled_at": order.canceled_at,
        "refund_status": "Approved" if refund else "None",
        "refund_amount": refund.value if refund else None,
        "refund_reason": refund.reason if refund else None,
        "refund_date": refund.refunded_at if refund else None,
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
                "image": _product_image_path(item.product),
                "calorias": item.product.total_calories if item.product else None,
            }
            for item in order.items
        ],
    }


def _can_customer_cancel(order: Order) -> bool:
    return order.state == "pendente" and order.payment_status == "nao_pago"


@router.get("/coupons", response_model=list[CouponResponse])
def list_available_coupons(
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para ver os cupões.")

    coupons = _available_coupon_query(db, current_user).order_by(Coupon.created_at.desc()).all()
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


@router.post("/coupons/validate", response_model=CouponValidationResponse)
def validate_coupon(
    body: CouponValidationRequest,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para usar cupões.")

    coupon, discount = _get_valid_coupon(db, current_user, body.code, body.subtotal)
    if not coupon:
        raise HTTPException(status_code=400, detail="O código do cupão é obrigatório.")

    return CouponValidationResponse(
        code=coupon.code,
        discount=discount,
        value=coupon.value,
        type=coupon.type,
        minimum_order_value=coupon.minimum_order_value,
    )


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    body: CheckoutRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para finalizar a compra.")

    items = _cart_items_for_user(db, current_user) if current_user else body.items
    if not items:
        items = body.items

    if not items:
        raise HTTPException(status_code=400, detail="Não é possível criar um pedido com o cart vazio.")

    product_ids = [item.product_id for item in items]
    products = (
        db.query(Product)
        .options(joinedload(Product.images))
        .filter(Product.product_id.in_(product_ids))
        .all()
    )
    product_map = {product.product_id: product for product in products}

    subtotal = Decimal("0")
    order_items: list[dict] = []

    for item in items:
        product = product_map.get(item.product_id)
        if not product or product.status == 0 or product.deleted_at is not None:
            raise HTTPException(status_code=404, detail=f"O product '{format_product_id(item.product_id)}' já não está disponível.")

        if unavailable_due_to_inactive_base(db, product):
            raise HTTPException(
                status_code=400,
                detail=f"'{product.name}' não está disponível neste momento.",
            )

        if product.stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{product.name}'. Pedido: {item.quantity}, disponível: {product.stock}.",
            )

        unit_price = (
            Decimal(str(item.customization.final_unit_price))
            if item.customization and item.customization.final_unit_price is not None
            else discounted_product_price(product)
        )
        line_total = unit_price * item.quantity
        subtotal += line_total
        product.stock -= item.quantity
        product.sold = (product.sold or 0) + item.quantity

        order_items.append({
            "product_id": product.product_id,
            "product_name_snapshot": product.name,
            "discount_percentage_snapshot": Decimal(str(product.discount_percentual or 0)),
            "unit_price": unit_price,
            "quantity": item.quantity,
            "customization": customization_to_json(item.customization),
        })

    customer = _get_or_create_checkout_customer(db, body, current_user)
    db_method = _payment_method(body.payment_method)
    online_payment = _is_online_payment(db_method)
    delivery_fee = Decimal("0")
    coupon, coupon_discount = _get_valid_coupon(db, current_user, body.promo_code, subtotal)
    total = subtotal - coupon_discount + delivery_fee + SERVICE_FEE
    vat_amount = _included_iva(total)
    generated_coupon_code = _award_loyalty_coupon_if_eligible(db, current_user, subtotal)
    note_parts: list[str] = []
    if coupon:
        note_parts.extend([f"coupon={coupon.code}", f"coupon_discount={coupon_discount:.2f}"])
        coupon.used = True
        coupon.used_at = datetime.utcnow()
    if generated_coupon_code:
        note_parts.append(f"coupon_generated={generated_coupon_code}")
    order_notes = _checkout_notes(body, note_parts)

    order = Order(
        customer_id=customer.customer_id,
        admin_id=None,
        state="confirmada" if online_payment else "pendente",
        payment_method=db_method,
        payment_status="pago" if online_payment else "nao_pago",
        subtotal=subtotal,
        vat_percentage=IVA_PERCENTUAL,
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
                vat_percentage_snapshot=IVA_PERCENTUAL,
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
        state="aprovado" if online_payment else "pendente",
        value=total,
        transaction_reference=f"{'MBW' if db_method == 'mbway' else 'TXN' if online_payment else 'BAL'}-{datetime.utcnow().strftime('%Y%m%d')}-{order.order_id:03d}",
        paid_at=datetime.utcnow() if online_payment else None,
    ))

    db.flush()
    if online_payment:
        ensure_invoice_for_order(db, order)
    _clear_user_cart(db, current_user)
    db.commit()

    saved = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderProduct.product))
        .filter(Order.order_id == order.order_id)
        .first()
    )
    response = _order_response(saved)

    if online_payment:
        try:
            receipt_payload = build_order_receipt_payload(saved, body, delivery_fee, SERVICE_FEE)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for order %s.", order.order_id)

    return response


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para cancelar um pedido.")

    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderProduct.product))
        .filter(
            Order.order_id == order_id,
            Order.customer_id == current_user.customer_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    if not _can_customer_cancel(order):
        raise HTTPException(status_code=400, detail="Os pedidos só podem ser cancelados antes da confirmação do payment.")

    order.state = "cancelada"
    order.canceled_at = datetime.utcnow()
    order.cancellation_origin = "Customer"
    order.updated_at = datetime.utcnow()
    if order.payment:
        order.payment.state = "rejeitado"
    db.commit()
    db.refresh(order)
    return _order_response(order)


@router.get("/orders/{order_id}/receipt.pdf")
def download_order_receipt_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para descarregar recibos.")

    if not render_receipt_pdf or not receipt_pdf_filename:
        raise HTTPException(status_code=503, detail="O serviço de PDF do recibo está indisponível.")

    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.items).joinedload(OrderProduct.product),
        )
        .filter(
            Order.order_id == order_id,
            Order.customer_id == current_user.customer_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Recibo do pedido não encontrado.")

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


@router.get("/orders/history", response_model=list[OrderResponse])
def list_order_history(
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para ver o histórico de pedidos.")

    orders = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderProduct.product))
        .filter(Order.customer_id == current_user.customer_id)
        .order_by(Order.ordered_at.desc())
        .all()
    )
    return [_order_response(order) for order in orders]
