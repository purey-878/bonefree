"""Invoice snapshot persistence for paid orders."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from schemas.enums import PaymentStatus, normalize_enum
from models import Invoice, Order, Organization, OrganizationDomain, OrganizationProfile


def ensure_invoice_for_order(db: Session, order: Order) -> Invoice | None:
    """Create the immutable invoice snapshot for a paid order if it is missing."""
    if normalize_enum(PaymentStatus, order.payment_status) != PaymentStatus.PAID:
        return None

    existing = db.scalar(select(Invoice).where(Invoice.order_id == order.order_id))
    if existing:
        return existing

    organization_id = db.info.get("organization_id")
    if organization_id is None or organization_id != order.organization_id:
        raise RuntimeError("The order does not belong to the current organization.")

    organization = db.get(Organization, organization_id)
    profile = db.scalar(
        select(OrganizationProfile).where(
            OrganizationProfile.organization_id == organization_id
        )
    )
    if organization is None or profile is None:
        raise RuntimeError("The current organization must have a profile before issuing invoices.")

    primary_domain = db.scalar(
        select(OrganizationDomain.domain).where(
            OrganizationDomain.organization_id == organization_id,
            OrganizationDomain.is_primary.is_(True),
            OrganizationDomain.is_verified.is_(True),
        )
    )
    customer = order.customer
    invoice = Invoice(
        order=order,
        invoice_number=_invoice_number(order),
        customer_tax_id=(
            _clean(order.customer_tax_id)
            or _clean(getattr(customer, "tax_id", None))
        ),
        customer_name=_order_customer_name(order, customer),
        customer_address=_invoice_address(customer),
        subtotal=Decimal(str(getattr(order, "subtotal", 0) or 0)),
        vat_percentage=Decimal(str(getattr(order, "vat_percentage", 13))),
        vat_amount=Decimal(str(getattr(order, "vat_amount", 0) or 0)),
        total=Decimal(str(order.total or 0)),
        issuer_display_name=_clean(profile.display_name) or organization.name,
        issuer_legal_name=_clean(profile.legal_name),
        issuer_tax_id=_clean(profile.tax_id),
        issuer_address=_issuer_address(profile),
        issuer_email=_clean(profile.email) or organization.email,
        issuer_phone=_clean(profile.phone) or _clean(organization.phone),
        issuer_logo_url=_clean(profile.logo_url),
        issuer_website=_website_for_domain(primary_domain),
        issuer_currency_code=_clean(profile.currency_code) or "EUR",
        issuer_vat_exemption_reason=(
            _clean(profile.vat_exemption_reason)
            if Decimal(str(getattr(order, "vat_percentage", 13))) == 0
            else None
        ),
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


def _order_customer_name(order: Order, customer: Any) -> str | None:
    snapshot_name = _clean(
        f"{order.customer_first_name or ''} {order.customer_last_name or ''}"
    )
    return snapshot_name or _customer_name(customer)


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


def _issuer_address(profile: OrganizationProfile) -> str | None:
    locality = _clean(
        " ".join(
            part
            for part in (profile.postal_code, profile.city)
            if _clean(part)
        )
    )
    lines = (
        profile.address_line_1,
        profile.address_line_2,
        locality,
        profile.country,
    )
    return "\n".join(cleaned for value in lines if (cleaned := _clean(value))) or None


def _website_for_domain(domain: str | None) -> str | None:
    normalized = _clean(domain)
    if normalized is None:
        return None
    scheme = "http" if normalized in {"bonefree.localhost", "127.0.0.1"} else "https"
    return f"{scheme}://{normalized}"


def _clean(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
