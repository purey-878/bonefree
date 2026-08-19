"""Refund receipt PDF generation and email delivery."""

from __future__ import annotations

import json
import logging
import os
import smtplib
import ssl
from base64 import b64encode
from decimal import Decimal, ROUND_HALF_UP
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from io import BytesIO
from typing import Any, Mapping
from urllib import request

try:
    import certifi
except ModuleNotFoundError:
    certifi = None

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from models import Order, Refund

logger = logging.getLogger(__name__)

REFUND_METHOD_TEXT = "O refund será devolvido através do método de payment original."


def refund_receipt_number(refund: Refund) -> str:
    year = refund.refunded_at.year if refund.refunded_at else 0
    return f"RR {year}/{refund.refund_id:06d}"


def original_invoice_number(order: Order) -> str:
    year = order.ordered_at.year if order.ordered_at else 0
    return f"FR {year}/{order.order_id:06d}"


def build_refund_receipt_payload(refund: Refund) -> dict[str, Any]:
    order = refund.order
    customer = order.customer if order else None
    admin = refund.admin
    customer_name = (
        f"{customer.name or ''} {customer.last_name or ''}".strip()
        if customer else "Customer"
    ) or "Customer"

    return {
        "company_name": os.getenv("RECEIPT_COMPANY_NAME", "BONEFREE"),
        "company_email": os.getenv("RECEIPT_COMPANY_EMAIL", "carambolarubra@gmail.com"),
        "refund_receipt_number": refund.receipt_number or refund_receipt_number(refund),
        "original_order_number": f"ENC-{order.order_id:06d}",
        "original_invoice_number": original_invoice_number(order),
        "customer_name": customer_name,
        "customer_email": customer.email if customer else "",
        "refund_amount": Decimal(str(refund.value)).quantize(Decimal("0.01")),
        "refund_reason": refund.reason,
        "refund_notes": refund.notes,
        "refund_date": refund.refunded_at,
        "processed_by": admin.name if admin else "Staff",
        "processed_by_role": admin.role if admin else "staff_admin",
        "refund_method": REFUND_METHOD_TEXT,
    }


def render_refund_receipt_pdf(receipt: Mapping[str, Any]) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=f"Recibo de Refund {receipt['refund_receipt_number']}",
        author=str(receipt.get("company_name", "BONEFREE")),
    )
    styles = _styles()
    rows = [
        ("Número do recibo de refund", receipt["refund_receipt_number"]),
        ("Número do pedido original", receipt["original_order_number"]),
        ("Número da invoice original", receipt["original_invoice_number"]),
        ("Nome do customer", receipt["customer_name"]),
        ("Email do customer", receipt["customer_email"]),
        ("Valor do refund", _format_money(receipt["refund_amount"])),
        ("Motivo do refund", receipt["refund_reason"]),
        ("Data do refund", _format_datetime(receipt["refund_date"])),
        ("Processado por", receipt["processed_by"]),
        ("Metodo de refund", receipt["refund_method"]),
    ]
    story = [
        _header(receipt, styles),
        Spacer(1, 14),
        _key_value_table(rows, styles),
        Spacer(1, 14),
        Paragraph("Notas", styles["Section"]),
        Spacer(1, 6),
        Paragraph(escape(str(receipt["refund_notes"])), styles["Body"]),
    ]
    doc.build(story)
    return buffer.getvalue()


def refund_receipt_filename(receipt: Mapping[str, Any]) -> str:
    safe = str(receipt["refund_receipt_number"]).replace("/", "-").replace(" ", "-")
    return f"recibo-refund-{safe}.pdf"


def send_refund_email(receipt: Mapping[str, Any]) -> bool:
    if not _env_flag("EMAIL_RECEIPTS_ENABLED", default=True):
        logger.info("Refund email skipped because EMAIL_RECEIPTS_ENABLED is disabled.")
        return False

    subject = "Refund aprovado - BONEFREE"
    text_body = (
        "O seu refund foi aprovado e processado.\n\n"
        f"Valor do refund: {_format_money(receipt['refund_amount'])}\n\n"
        f"{REFUND_METHOD_TEXT}\n\n"
        "Enviamos o recibo de refund em anexo.\n\n"
        "Obrigado,\nBONEFREE"
    )
    html_body = (
        "<p>O seu refund foi aprovado e processado.</p>"
        f"<p><strong>Valor do refund:</strong> {_format_money(receipt['refund_amount'])}</p>"
        f"<p>{escape(REFUND_METHOD_TEXT)}</p>"
        "<p>Enviamos o recibo de refund em anexo.</p>"
        "<p>Obrigado,<br>BONEFREE</p>"
    )
    pdf_body = render_refund_receipt_pdf(receipt)
    pdf_filename = refund_receipt_filename(receipt)

    try:
        if os.getenv("SENDGRID_API_KEY"):
            _send_with_sendgrid(receipt, subject, text_body, html_body, pdf_body, pdf_filename)
        elif os.getenv("SMTP_HOST"):
            _send_with_smtp(receipt, subject, text_body, html_body, pdf_body, pdf_filename)
        else:
            logger.warning("Refund email not sent. Configure SENDGRID_API_KEY or SMTP_HOST.")
            return False
        return True
    except Exception:
        logger.exception("Failed to send refund email for %s.", receipt.get("refund_receipt_number"))
        return False


def _header(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [
            Paragraph(escape(str(receipt.get("company_name", "BONEFREE"))), styles["Brand"]),
            Paragraph(
                f"<b>RECIBO DE REEMBOLSO</b><br/><font color='#4B5563'>{escape(str(receipt['refund_receipt_number']))}</font>",
                styles["Right"],
            ),
        ],
        [
            Paragraph("Refund aprovado e processado.", styles["Muted"]),
            Paragraph(f"<b>{_format_money(receipt['refund_amount'])}</b>", styles["Amount"]),
        ],
    ]
    table = Table(data, colWidths=[105 * mm, 73 * mm])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, -1), (-1, -1), 0.7, colors.HexColor("#D8DED3")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _key_value_table(rows: list[tuple[str, Any]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [
        [
            Paragraph(f"<b>{escape(label)}</b>", styles["Cell"]),
            Paragraph(escape(_format_datetime(value) if hasattr(value, "strftime") else str(value)), styles["Cell"]),
        ]
        for label, value in rows
    ]
    table = Table(data, colWidths=[54 * mm, 124 * mm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8DED3")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5ED")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "Brand": ParagraphStyle("Brand", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=colors.HexColor("#26301F")),
        "Right": ParagraphStyle("Right", parent=base["BodyText"], alignment=2, fontSize=10, leading=15),
        "Amount": ParagraphStyle("Amount", parent=base["Heading2"], alignment=2, fontSize=18, leading=22, textColor=colors.HexColor("#0F766E")),
        "Muted": ParagraphStyle("Muted", parent=base["BodyText"], fontSize=9, leading=13, textColor=colors.HexColor("#6B7280")),
        "Section": ParagraphStyle("Section", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#26301F")),
        "Cell": ParagraphStyle("Cell", parent=base["BodyText"], fontSize=9, leading=13),
        "Body": ParagraphStyle("Body", parent=base["BodyText"], fontSize=10, leading=15),
    }


def _send_with_sendgrid(receipt: Mapping[str, Any], subject: str, text_body: str, html_body: str, pdf_body: bytes, pdf_filename: str) -> None:
    payload = {
        "personalizations": [{"to": [{"email": str(receipt["customer_email"]), "name": str(receipt["customer_name"])}]}],
        "from": {"email": _sender_email(receipt), "name": "BONEFREE"},
        "subject": subject,
        "content": [{"type": "text/plain", "value": text_body}, {"type": "text/html", "value": html_body}],
        "attachments": [{"content": b64encode(pdf_body).decode("ascii"), "type": "application/pdf", "filename": pdf_filename, "disposition": "attachment"}],
    }
    req = request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {os.environ['SENDGRID_API_KEY']}", "Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=float(os.getenv("EMAIL_SEND_TIMEOUT_SECONDS", "10")), context=_ssl_context()) as response:
        if response.status >= 400:
            raise RuntimeError(f"SendGrid returned HTTP {response.status}")


def _send_with_smtp(receipt: Mapping[str, Any], subject: str, text_body: str, html_body: str, pdf_body: bytes, pdf_filename: str) -> None:
    configured_port = os.getenv("SMTP_PORT")
    secure = _env_flag("SMTP_SECURE", default=configured_port == "465")
    port = int(configured_port or ("465" if secure else "587"))
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("BONEFREE", _sender_email(receipt)))
    message["To"] = formataddr((str(receipt["customer_name"]), str(receipt["customer_email"])))
    message.set_content(text_body)
    message.add_alternative(html_body, subtype="html")
    message.add_attachment(pdf_body, maintype="application", subtype="pdf", filename=pdf_filename)
    if secure:
        with smtplib.SMTP_SSL(os.environ["SMTP_HOST"], port, timeout=10, context=_ssl_context()) as server:
            _smtp_login(server)
            server.send_message(message)
        return
    with smtplib.SMTP(os.environ["SMTP_HOST"], port, timeout=10) as server:
        if _env_flag("SMTP_STARTTLS", default=True):
            server.starttls(context=_ssl_context())
        _smtp_login(server)
        server.send_message(message)


def _smtp_login(server: smtplib.SMTP) -> None:
    username = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD") or os.getenv("SMTP_PASS")
    if username and password:
        server.login(username, password)


def _ssl_context() -> ssl.SSLContext:
    if certifi is None:
        return ssl.create_default_context()
    return ssl.create_default_context(cafile=certifi.where())


def _sender_email(receipt: Mapping[str, Any]) -> str:
    return os.getenv("RECEIPT_FROM_EMAIL") or os.getenv("EMAIL_FROM") or os.getenv("SMTP_USER") or str(receipt["company_email"])


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _format_money(value: Any) -> str:
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    whole, cents = f"{amount:.2f}".split(".")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    return f"{sign}{'.'.join(groups)},{cents} €"


def _format_datetime(value: Any) -> str:
    if not value:
        return ""
    return value.strftime("%Y-%m-%d %H:%M")
