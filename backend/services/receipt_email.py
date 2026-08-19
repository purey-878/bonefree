"""Purchase receipt email rendering and delivery."""

from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
from base64 import b64encode
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from pathlib import Path
from string import Template
from typing import Any, Mapping
from urllib import request

try:
    import certifi
except ModuleNotFoundError:
    certifi = None

from models import Order
from schemas.checkout import CheckoutRequest
from services.order_customization import customization_lines

try:
    from services.receipt_pdf import receipt_pdf_filename, render_receipt_pdf
except ModuleNotFoundError as exc:
    if exc.name != "reportlab":
        raise
    receipt_pdf_filename = None
    render_receipt_pdf = None

logger = logging.getLogger(__name__)

TEMPLATE_PATH = Path(__file__).resolve().parents[1] / "templates" / "purchase_receipt.html"

RECEIPT_REQUIRED_FIELDS = (
    "company_name",
    "company_logo_url",
    "company_address",
    "company_email",
    "company_phone",
    "customer_name",
    "customer_email",
    "order_id",
    "order_date",
    "payment_method",
    "billing_address",
    "shipping_address",
    "items",
    "subtotal",
    "tax",
    "shipping",
    "total_amount",
)

PAYMENT_LABELS = {
    "card": "Cartão",
    "cash": "Payment ao balcão",
    "mbway": "MB Way",
    "qr_pay": "MB Way",
    "cartao": "Cartão",
    "digital": "Cartão",
    "balcao": "Payment ao balcão",
}


def build_order_receipt_payload(
    order: Order,
    checkout: CheckoutRequest,
    delivery_fee: Decimal,
    service_fee: Decimal,
) -> dict[str, Any]:
    """Map a saved order into the receipt template contract."""
    customer_name = f"{checkout.customer.first_name} {checkout.customer.last_name}".strip()
    customer_email = checkout.customer.email or order.customer.email
    coupon_discount = _order_discount(order)
    service_fee_amount = Decimal(str(service_fee))
    subtotal = _order_subtotal(order)
    payment_date = _payment_datetime(order)
    customer = order.customer

    return {
        "company_name": _company_name(),
        "company_logo_url": _company_logo_url(),
        "company_nif": os.getenv("RECEIPT_COMPANY_NIF", ""),
        "company_address": os.getenv(
            "RECEIPT_COMPANY_ADDRESS",
            "Bonefree\nR. Eng. Henrique Mendia 28A\n2825-450 Costa da Caparica\nPortugal",
        ),
        "company_email": os.getenv("RECEIPT_COMPANY_EMAIL", "carambolarubra@gmail.com"),
        "company_phone": os.getenv("RECEIPT_COMPANY_PHONE", "+351 968 107 703"),
        "customer_name": customer_name,
        "customer_nif": _customer_field(customer, "tax_id"),
        "customer_email": customer_email,
        "customer_phone": checkout.customer.phone or _customer_field(customer, "phone"),
        "customer_address": _invoice_address(customer),
        "order_id": f"ENC-{order.order_id:06d}",
        "document_number": _document_number(order),
        "issue_datetime": _format_datetime_pt(order.ordered_at),
        "payment_date": _format_datetime_pt(payment_date),
        "order_reference": f"ENC-{order.order_id:06d}",
        "order_date": _format_datetime_pt(order.ordered_at),
        "payment_method": PAYMENT_LABELS.get(checkout.payment_method, checkout.payment_method.title()),
        "payment_status": _payment_status_label(order),
        "payment_reference": _payment_reference(order),
        "coupon_code": _order_coupon_code(order),
        "billing_address": _customer_address(customer_name, checkout, customer),
        "shipping_address": _shipping_address(checkout),
        "items": _receipt_items(order, coupon_discount, subtotal),
        "subtotal_amount": subtotal,
        "discount_amount": coupon_discount,
        "shipping_amount": Decimal(str(delivery_fee)),
        "service_fee_amount": service_fee_amount,
        "total_amount_value": Decimal(str(order.total)),
        "subtotal": _format_money(subtotal),
        "discount": _format_money(coupon_discount) if coupon_discount > 0 else None,
        "tax": os.getenv("RECEIPT_TAX_LABEL", "Incluído"),
        "shipping": _format_money(delivery_fee),
        "service_fee": _format_money(service_fee_amount) if service_fee_amount > 0 else None,
        "total_amount": _format_money(order.total),
        "iva_rate": _iva_rate(),
        "iva_exemption_reason": _iva_exemption_reason(),
        "public_base_url": _public_base_url(),
    }


def build_saved_order_receipt_payload(order: Order) -> dict[str, Any]:
    """Build a receipt payload from an already-saved order.

    This is used when counter payments are confirmed after checkout, where the
    original checkout request object is no longer available.
    """
    customer = order.customer
    customer_name = (
        f"{customer.name or ''} {customer.last_name or ''}".strip()
        if customer else "Customer"
    ) or "Customer"
    customer_email = customer.email if customer else ""
    subtotal = _order_subtotal(order)
    coupon_discount = _order_discount(order)
    service_fee = Decimal(str(order.total)) + coupon_discount - subtotal
    payment_date = _payment_datetime(order)

    return {
        "company_name": _company_name(),
        "company_logo_url": _company_logo_url(),
        "company_nif": os.getenv("RECEIPT_COMPANY_NIF", ""),
        "company_address": os.getenv(
            "RECEIPT_COMPANY_ADDRESS",
            "Bonefree\nR. Eng. Henrique Mendia 28A\n2825-450 Costa da Caparica\nPortugal",
        ),
        "company_email": os.getenv("RECEIPT_COMPANY_EMAIL", "carambolarubra@gmail.com"),
        "company_phone": os.getenv("RECEIPT_COMPANY_PHONE", "+351 968 107 703"),
        "customer_name": customer_name,
        "customer_nif": _customer_field(customer, "tax_id"),
        "customer_email": customer_email,
        "customer_phone": _customer_field(customer, "phone"),
        "customer_address": _invoice_address(customer),
        "order_id": f"ENC-{order.order_id:06d}",
        "document_number": _document_number(order),
        "issue_datetime": _format_datetime_pt(order.ordered_at),
        "payment_date": _format_datetime_pt(payment_date),
        "order_reference": f"ENC-{order.order_id:06d}",
        "order_date": _format_datetime_pt(order.ordered_at),
        "payment_method": _saved_payment_label(order),
        "payment_status": _payment_status_label(order),
        "payment_reference": _payment_reference(order),
        "coupon_code": _order_coupon_code(order),
        "billing_address": _saved_customer_address(customer_name, customer),
        "shipping_address": _saved_shipping_address(order),
        "items": _receipt_items(order, coupon_discount, subtotal),
        "subtotal_amount": subtotal,
        "discount_amount": coupon_discount,
        "shipping_amount": Decimal("0"),
        "service_fee_amount": service_fee if service_fee > 0 else Decimal("0"),
        "total_amount_value": Decimal(str(order.total)),
        "subtotal": _format_money(subtotal),
        "discount": _format_money(coupon_discount) if coupon_discount > 0 else None,
        "tax": os.getenv("RECEIPT_TAX_LABEL", "Incluído"),
        "shipping": _format_money(Decimal("0")),
        "service_fee": _format_money(service_fee) if service_fee > 0 else None,
        "total_amount": _format_money(order.total),
        "iva_rate": _iva_rate(),
        "iva_exemption_reason": _iva_exemption_reason(),
        "public_base_url": _public_base_url(),
    }


def render_receipt_email(receipt: Mapping[str, Any]) -> str:
    """Render a responsive, table-based HTML receipt email."""
    _validate_receipt(receipt)
    template = Template(TEMPLATE_PATH.read_text(encoding="utf-8"))
    values = {
        key: _html_lines(receipt[key]) if "address" in key else _html_text(receipt[key])
        for key in RECEIPT_REQUIRED_FIELDS
        if key != "items"
    }
    values["items_rows"] = _render_items(receipt["items"])
    values["discount_row"] = _render_discount_row(receipt.get("discount"))
    values["service_fee_row"] = _render_service_fee_row(receipt.get("service_fee"))
    return template.substitute(values)


def send_purchase_receipt(receipt: Mapping[str, Any]) -> bool:
    """Send the purchase receipt through SendGrid or SMTP.

    Configure one of:
    - SENDGRID_API_KEY
    - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
    """
    if not _env_flag("EMAIL_RECEIPTS_ENABLED", default=True):
        logger.info("Receipt email skipped because EMAIL_RECEIPTS_ENABLED is disabled.")
        return False

    try:
        _validate_receipt(receipt)
        html_body = render_receipt_email(receipt)
        text_body = _render_plain_text(receipt)
        pdf_body = None
        pdf_filename = None
        if render_receipt_pdf and receipt_pdf_filename:
            pdf_body = render_receipt_pdf(receipt)
            pdf_filename = receipt_pdf_filename(receipt)
        subject = f"Recibo {receipt['company_name']} do pedido {receipt['order_id']}"

        if os.getenv("SENDGRID_API_KEY"):
            _send_with_sendgrid(receipt, subject, text_body, html_body, pdf_body, pdf_filename)
        elif os.getenv("SMTP_HOST"):
            _send_with_smtp(receipt, subject, text_body, html_body, pdf_body, pdf_filename)
        else:
            logger.warning("Receipt email not sent. Configure SENDGRID_API_KEY or SMTP_HOST.")
            return False

        logger.info("Receipt email sent to %s for %s.", receipt["customer_email"], receipt["order_id"])
        return True
    except Exception:
        logger.exception("Failed to send receipt email for %s.", receipt.get("order_id", "unknown order"))
        return False


def _send_with_sendgrid(
    receipt: Mapping[str, Any],
    subject: str,
    text_body: str,
    html_body: str,
    pdf_body: bytes | None,
    pdf_filename: str | None,
) -> None:
    sender_email = _sender_email(receipt)
    payload = {
        "personalizations": [
            {
                "to": [
                    {
                        "email": str(receipt["customer_email"]),
                        "name": str(receipt["customer_name"]),
                    }
                ],
            }
        ],
        "from": {
            "email": sender_email,
            "name": str(receipt["company_name"]),
        },
        "reply_to": {
            "email": str(receipt["company_email"]),
            "name": str(receipt["company_name"]),
        },
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text_body},
            {"type": "text/html", "value": html_body},
        ],
    }
    if pdf_body and pdf_filename:
        payload["attachments"] = [
            {
                "content": b64encode(pdf_body).decode("ascii"),
                "type": "application/pdf",
                "filename": pdf_filename,
                "disposition": "attachment",
            }
        ]
    req = request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ['SENDGRID_API_KEY']}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    timeout = float(os.getenv("EMAIL_SEND_TIMEOUT_SECONDS", "10"))

    context = _ssl_context()
    with request.urlopen(req, timeout=timeout, context=context) as response:
        if response.status >= 400:
            raise RuntimeError(f"SendGrid returned HTTP {response.status}")


def _send_with_smtp(
    receipt: Mapping[str, Any],
    subject: str,
    text_body: str,
    html_body: str,
    pdf_body: bytes | None,
    pdf_filename: str | None,
) -> None:
    configured_port = os.getenv("SMTP_PORT")
    secure = _env_flag("SMTP_SECURE", default=configured_port == "465")
    port = int(configured_port or ("465" if secure else "587"))
    timeout = float(os.getenv("EMAIL_SEND_TIMEOUT_SECONDS", "10"))
    sender_email = _sender_email(receipt)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((str(receipt["company_name"]), sender_email))
    message["To"] = formataddr((str(receipt["customer_name"]), str(receipt["customer_email"])))
    message["Reply-To"] = formataddr((str(receipt["company_name"]), str(receipt["company_email"])))
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    if pdf_body and pdf_filename:
        message.add_attachment(
            pdf_body,
            maintype="application",
            subtype="pdf",
            filename=pdf_filename,
        )

    context = _ssl_context()
    if secure:
        with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, timeout=timeout, context=context) as server:
            _smtp_login(server)
            server.send_message(message)
        return

    with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=timeout) as server:
        if _env_flag("SMTP_STARTTLS", default=True):
            server.starttls(context=context)
        _smtp_login(server)
        server.send_message(message)


def _ssl_context() -> ssl.SSLContext:
    if certifi is None:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def _smtp_login(server: smtplib.SMTP) -> None:
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    if username and password:
        server.login(username, password)


def _validate_receipt(receipt: Mapping[str, Any]) -> None:
    missing = [
        field
        for field in RECEIPT_REQUIRED_FIELDS
        if field not in receipt or receipt[field] in (None, "")
    ]
    if missing:
        raise ValueError(f"Campos do recibo em falta: {', '.join(missing)}")

    items = receipt["items"]
    if not isinstance(items, list) or not items:
        raise ValueError("O campo 'items' do recibo deve ser uma lista não vazia.")

    for index, item in enumerate(items):
        for field in ("name", "quantity", "price"):
            if field not in item or item[field] in (None, ""):
                raise ValueError(f"O item {index} do recibo não tem o campo '{field}'.")


def _render_items(items: list[Mapping[str, Any]]) -> str:
    rows = []
    for item in items:
        unit_price = item.get("unit_price")
        detail = f"Quantidade: {_html_text(item['quantity'])}"
        if unit_price:
            detail = f"{detail} &middot; {_html_text(unit_price)} cada"
        customizations = item.get("customizations") or []
        if customizations:
            detail = f"{detail}<br>{_html_text(' | '.join(customizations))}"

        rows.append(
            """
                <tr>
                  <td style="padding:16px 0; border-top:1px solid #e6e8ec;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="mobile-stack" valign="top" style="font-size:15px; line-height:22px; color:#111827;">
                          <strong style="font-weight:650;">{name}</strong><br>
                          <span style="font-size:13px; line-height:20px; color:#6b7280;">{detail}</span>
                        </td>
                        <td class="mobile-stack mobile-left mobile-top" valign="top" align="right" style="font-size:15px; line-height:22px; color:#111827; white-space:nowrap;">
                          {price}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
            """.format(
                name=_html_text(item["name"]),
                detail=detail,
                price=_html_text(item["price"]),
            )
        )
    return "".join(rows)


def _render_service_fee_row(service_fee: Any) -> str:
    if _empty_money_value(service_fee):
        return ""

    return """
                <tr>
                  <td style="padding:10px 0; font-size:14px; line-height:22px; color:#6b7280;">Taxa de serviço</td>
                  <td align="right" style="padding:10px 0; font-size:14px; line-height:22px; color:#111827;">{service_fee}</td>
                </tr>
    """.format(service_fee=_html_text(service_fee))


def _render_discount_row(discount: Any) -> str:
    if _empty_money_value(discount):
        return ""

    return """
                <tr>
                  <td style="padding:10px 0; font-size:14px; line-height:22px; color:#6b7280;">Desconto</td>
                  <td align="right" style="padding:10px 0; font-size:14px; line-height:22px; color:#111827;">-{discount}</td>
                </tr>
    """.format(discount=_html_text(discount))


def _render_plain_text(receipt: Mapping[str, Any]) -> str:
    lines = [
        f"Recibo {receipt['company_name']}",
        f"Pedido: {receipt['order_id']}",
        f"Data: {receipt['order_date']}",
        f"Payment: {receipt['payment_method']}",
        "",
        "Itens:",
    ]

    for item in receipt["items"]:
        lines.append(f"- {item['name']} x {item['quantity']}: {item['price']}")
        for customization in item.get("customizations", []):
            lines.append(f"  {customization}")

    lines.extend(
        [
            "",
            f"Subtotal: {receipt['subtotal']}",
            f"IVA: {receipt['tax']}",
            f"Taxa de refeição: {receipt['shipping']}",
        ]
    )
    if receipt.get("discount"):
        lines.append(f"Desconto: -{receipt['discount']}")
    if receipt.get("service_fee"):
        lines.append(f"Taxa de serviço: {receipt['service_fee']}")

    lines.extend(
        [
            f"Total: {receipt['total_amount']}",
            "",
            "Invoiceção:",
            str(receipt["billing_address"]),
            "",
            "Entrega:",
            str(receipt["shipping_address"]),
            "",
            f"Apoio: {receipt['company_email']} | {receipt['company_phone']}",
        ]
    )
    return "\n".join(lines)


def _company_name() -> str:
    return os.getenv("RECEIPT_COMPANY_NAME", "BONEFREE")


def _company_logo_url() -> str:
    explicit = os.getenv("RECEIPT_COMPANY_LOGO_URL")
    if explicit:
        return explicit

    base_url = os.getenv("PUBLIC_BASE_URL") or os.getenv("APP_BASE_URL") or "http://localhost:8000"
    return f"{base_url.rstrip('/')}/assets/images/bonefree-logo.webp"


def _sender_email(receipt: Mapping[str, Any]) -> str:
    return (
        os.getenv("RECEIPT_FROM_EMAIL")
        or os.getenv("EMAIL_FROM")
        or os.getenv("AUTH_EMAIL_FROM")
        or os.getenv("SMTP_USER")
        or str(receipt["company_email"])
    )


def _customer_address(customer_name: str, checkout: CheckoutRequest, customer: Any) -> str:
    lines = [
        customer_name,
        checkout.customer.email,
        checkout.customer.phone,
        _invoice_address(customer),
    ]
    return "\n".join(line for line in lines if line)


def _shipping_address(checkout: CheckoutRequest) -> str:
    address = os.getenv(
        "RECEIPT_PICKUP_ADDRESS",
        "Comer no restaurante BONEFREE\nR. Eng. Henrique Mendia 28A\n2825-450 Costa da Caparica\nPortugal",
    )
    if checkout.customer.table_number is None:
        return address

    return f"Mesa {checkout.customer.table_number}\n{address}"


def _saved_customer_address(customer_name: str, customer: Any) -> str:
    if not customer:
        return customer_name

    lines = [
        customer_name,
        customer.email,
        customer.phone,
        _invoice_address(customer),
    ]
    return "\n".join(line for line in lines if line)


def _invoice_address(customer: Any) -> str:
    address = getattr(customer, "billing_address", None) if customer else None
    if not address:
        return ""

    return "\n".join(
        line
        for line in (
            getattr(address, "address", None),
            " ".join(
                part
                for part in (
                    getattr(address, "postal_code", None),
                    getattr(address, "city", None),
                )
                if part
            ),
            getattr(address, "country", None),
        )
        if line
    )


def _saved_shipping_address(order: Order) -> str:
    address = os.getenv(
        "RECEIPT_PICKUP_ADDRESS",
        "Comer no restaurante BONEFREE\nR. Eng. Henrique Mendia 28A\n2825-450 Costa da Caparica\nPortugal",
    )
    table_number = _note_value(order.notes, "table_number")
    if not table_number:
        return address

    return f"Mesa {table_number}\n{address}"


def _address_lines(checkout: CheckoutRequest) -> list[str]:
    return []


def _receipt_items(order: Order, discount: Decimal, subtotal: Decimal) -> list[dict[str, Any]]:
    allocations = _allocate_discount(order.items, discount, subtotal)
    receipt_items = []

    for item, line_discount in zip(order.items, allocations):
        unit_price = Decimal(str(item.unit_price)).quantize(Decimal("0.01"))
        quantity = Decimal(item.quantity)
        line_gross = (unit_price * quantity).quantize(Decimal("0.01"))
        line_total = (line_gross - line_discount).quantize(Decimal("0.01"))

        receipt_items.append(
            {
                "name": item.product_name_snapshot or (item.product.name if item.product else item.product_id),
                "quantity": item.quantity,
                "unit_price_amount": unit_price,
                "line_gross_amount": line_gross,
                "discount_amount": line_discount,
                "line_total_amount": line_total,
                "unit_price": _format_money(unit_price),
                "price": _format_money(line_gross),
                "customizations": customization_lines(item.customization),
            }
        )

    return receipt_items


def _allocate_discount(items: list[Any], discount: Decimal, subtotal: Decimal) -> list[Decimal]:
    discount = Decimal(str(discount or 0)).quantize(Decimal("0.01"))
    if discount <= 0 or subtotal <= 0 or not items:
        return [Decimal("0.00") for _ in items]

    allocations: list[Decimal] = []
    allocated = Decimal("0.00")
    for index, item in enumerate(items):
        line_gross = Decimal(str(item.unit_price)) * Decimal(item.quantity)
        if index == len(items) - 1:
            line_discount = discount - allocated
        else:
            line_discount = (discount * line_gross / subtotal).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            allocated += line_discount
        allocations.append(max(Decimal("0.00"), line_discount.quantize(Decimal("0.01"))))

    return allocations


def _order_subtotal(order: Order) -> Decimal:
    stored = Decimal(str(getattr(order, "subtotal", 0) or 0)).quantize(Decimal("0.01"))
    if stored > 0:
        return stored
    return sum(
        Decimal(str(item.unit_price)) * Decimal(item.quantity)
        for item in order.items
    ).quantize(Decimal("0.01"))


def _order_discount(order: Order) -> Decimal:
    stored = Decimal(str(getattr(order, "total_discount", 0) or 0)).quantize(Decimal("0.01"))
    if stored > 0:
        return stored
    raw_value = _note_value(order.notes, "coupon_discount")
    if not raw_value:
        return Decimal("0")
    try:
        return Decimal(str(raw_value)).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("0")


def _order_coupon_code(order: Order) -> str:
    return _note_value(order.notes, "coupon") or ""


def _note_value(notes: str | None, key: str) -> str | None:
    if not notes:
        return None

    prefix = f"{key}="
    for part in notes.split(" | "):
        if part.startswith(prefix):
            return part.removeprefix(prefix)
    return None


def _saved_payment_label(order: Order) -> str:
    checkout_payment = _note_value(order.notes, "checkout_payment")
    payment_method = checkout_payment or order.payment_method
    return PAYMENT_LABELS.get(payment_method, payment_method.title())


def _payment_status_label(order: Order) -> str:
    status = getattr(getattr(order, "payment", None), "state", None) or getattr(order, "payment_status", None)
    labels = {
        "aprovado": "Pago",
        "pago": "Pago",
        "pendente": "Pendente",
        "nao_pago": "Não pago",
        "rejeitado": "Rejeitado",
        "reembolsado": "Reembolsado",
    }
    return labels.get(str(status or "").strip(), str(status or "").strip().title())


def _payment_reference(order: Order) -> str:
    payment = getattr(order, "payment", None)
    reference = getattr(payment, "transaction_reference", None) if payment else None
    return str(reference).strip() if reference else ""


def _customer_field(customer: Any, field: str) -> str:
    if not customer:
        return ""

    value = getattr(customer, field, None)
    return str(value).strip() if value not in (None, "") else ""


def _document_number(order: Order) -> str:
    year = order.ordered_at.year if order.ordered_at else datetime.utcnow().year
    return f"FR {year}/{order.order_id:06d}"


def _payment_datetime(order: Order) -> Any:
    payment = getattr(order, "payment", None)
    if payment and payment.paid_at:
        return payment.paid_at
    return order.ordered_at


def _format_datetime_pt(value: Any) -> str:
    if not value:
        return ""
    return value.strftime("%d/%m/%Y %H:%M")


def _iva_rate() -> Decimal:
    raw_rate = os.getenv("RECEIPT_IVA_RATE", "13")
    try:
        return Decimal(str(raw_rate).replace(",", ".")).quantize(Decimal("0.01"))
    except Exception:
        return Decimal("23.00")


def _iva_exemption_reason() -> str:
    return os.getenv(
        "RECEIPT_IVA_EXEMPTION_REASON",
        "IVA - Isento nos termos do artigo aplicável do CIVA.",
    ).strip()


def _public_base_url() -> str:
    return (os.getenv("PUBLIC_BASE_URL") or os.getenv("APP_BASE_URL") or "http://localhost:8000").rstrip("/")


def _format_money(value: Any) -> str:
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    whole, cents = f"{amount:.2f}".split(".")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    formatted = f"{'.'.join(groups)},{cents}"
    currency = os.getenv("RECEIPT_CURRENCY_SYMBOL", "€")
    if currency.upper() == "EUR":
        currency = "€"
    return f"{sign}{formatted} {currency}"


def _html_text(value: Any) -> str:
    return escape(str(value), quote=True)


def _html_lines(value: Any) -> str:
    return _html_text(value).replace("\r\n", "\n").replace("\n", "<br>")


def _empty_money_value(value: Any) -> bool:
    if value in (None, ""):
        return True

    normalized = str(value).strip().replace(",", ".")
    return normalized in {"0", "0.00", "EUR 0.00", "€0.00", "0.00 €", "$0.00"}


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}
