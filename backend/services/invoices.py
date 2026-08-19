"""Invoice snapshot persistence for paid orders."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from enums import PaymentStatus, normalize_enum
from models import Order, Invoice


def ensure_invoice_for_order(db: Session, order: Order) -> Invoice | None:
    """Create the immutable invoice snapshot for a paid order if it is missing."""
    if normalize_enum(PaymentStatus, order.payment_status) != PaymentStatus.PAID:
        return None

    existing = db.query(Invoice).filter(Invoice.order_id == order.order_id).first()
    if existing:
        return existing

    customer = order.customer
    invoice = Invoice(
        order_id=order.order_id,
        invoice_number=_invoice_number(order),
        customer_tax_id=_clean(getattr(customer, "tax_id", None)),
        customer_name=_customer_name(customer),
        customer_address=_invoice_address(customer),
        subtotal=Decimal(str(getattr(order, "subtotal", 0) or 0)),
        vat_percentage=Decimal(str(getattr(order, "vat_percentage", 13) or 13)),
        vat_amount=Decimal(str(getattr(order, "vat_amount", 0) or 0)),
        total=Decimal(str(order.total or 0)),
        issued_at=datetime.utcnow(),
    )
    db.add(invoice)
    db.flush()
    return invoice


def _invoice_number(order: Order) -> str:
    year = order.ordered_at.year if order.ordered_at else datetime.utcnow().year
    return f"FR {year}/{order.order_id:06d}"


def _customer_name(customer: Any) -> str | None:
    if not customer:
        return None
    return _clean(f"{getattr(customer, 'name', '') or ''} {getattr(customer, 'last_name', '') or ''}")


def _invoice_address(customer: Any) -> str | None:
    address = getattr(customer, "billing_address", None) if customer else None
    if not address:
        return None

    lines = [
        _clean(getattr(address, "address", None)),
        _clean(" ".join(part for part in (
            getattr(address, "postal_code", None),
            getattr(address, "city", None),
        ) if part)),
        "Portugal",
    ]
    return "\n".join(line for line in lines if line) or None


def _clean(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
