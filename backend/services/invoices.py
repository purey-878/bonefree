"""Invoice snapshot persistence for paid orders."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models import Encomenda, Fatura


def ensure_invoice_for_order(db: Session, encomenda: Encomenda) -> Fatura | None:
    """Create the immutable invoice snapshot for a paid order if it is missing."""
    if encomenda.estado_pagamento != "pago":
        return None

    existing = db.query(Fatura).filter(Fatura.id_encomenda == encomenda.id_encomenda).first()
    if existing:
        return existing

    customer = encomenda.cliente
    invoice = Fatura(
        id_encomenda=encomenda.id_encomenda,
        numero_fatura=_invoice_number(encomenda),
        nif_cliente=_clean(getattr(customer, "nif", None)),
        nome_cliente=_customer_name(customer),
        morada_cliente=_invoice_address(customer),
        subtotal=Decimal(str(getattr(encomenda, "subtotal", 0) or 0)),
        iva_percentual=Decimal(str(getattr(encomenda, "iva_percentual", 13) or 13)),
        iva_valor=Decimal(str(getattr(encomenda, "iva_valor", 0) or 0)),
        total=Decimal(str(encomenda.total or 0)),
        data_emissao=datetime.utcnow(),
    )
    db.add(invoice)
    db.flush()
    return invoice


def _invoice_number(encomenda: Encomenda) -> str:
    year = encomenda.data_encomenda.year if encomenda.data_encomenda else datetime.utcnow().year
    return f"FR {year}/{encomenda.id_encomenda:06d}"


def _customer_name(customer: Any) -> str | None:
    if not customer:
        return None
    return _clean(f"{getattr(customer, 'nome', '') or ''} {getattr(customer, 'apelido', '') or ''}")


def _invoice_address(customer: Any) -> str | None:
    address = getattr(customer, "endereco_fatura", None) if customer else None
    if not address:
        return None

    lines = [
        _clean(getattr(address, "morada", None)),
        _clean(" ".join(part for part in (
            getattr(address, "codigo_postal", None),
            getattr(address, "cidade", None),
        ) if part)),
        "Portugal",
    ]
    return "\n".join(line for line in lines if line) or None


def _clean(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None
