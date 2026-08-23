"""Professional Portuguese Invoice/Recibo PDF generation."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from html import escape
from io import BytesIO
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlparse

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


PAGE_WIDTH = A4[0]
LEFT_MARGIN = 14 * mm
RIGHT_MARGIN = 14 * mm
CONTENT_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#5F6673")
FAINT = colors.HexColor("#E5E7EB")
SOFT = colors.HexColor("#F7F8F5")
SOFT_GREEN = colors.HexColor("#EEF4EA")
BRAND = colors.HexColor("#26301F")
ACCENT = colors.HexColor("#0F766E")
WARNING = colors.HexColor("#B45309")


def render_receipt_pdf(receipt: Mapping[str, Any]) -> bytes:
    """Render a printable Portuguese Invoice/Recibo PDF from the shared receipt payload."""
    document_number = _text(receipt.get("document_number") or receipt.get("order_id") or "Invoice/Recibo")
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=RIGHT_MARGIN,
        leftMargin=LEFT_MARGIN,
        topMargin=12 * mm,
        bottomMargin=13 * mm,
        title=f"Invoice/Recibo {document_number}",
        author=_text(receipt.get("company_name")),
    )

    styles = _styles()
    rows, totals = _invoice_rows(receipt)
    story: list[Any] = [
        _header(receipt, styles),
        Spacer(1, 7 * mm),
        _company_and_document_section(receipt, styles),
        Spacer(1, 5 * mm),
        _customer_section(receipt, styles),
    ]

    invoice_address = _text(receipt.get("customer_address"))
    if invoice_address:
        story.extend([Spacer(1, 4 * mm), _invoice_address_section(invoice_address, styles)])

    story.extend(
        [
            Spacer(1, 6 * mm),
            _section_title("Itens do Pedido", styles),
            Spacer(1, 2.5 * mm),
            _items_table(rows, styles),
        ]
    )

    promotions = _promotions_section(receipt, styles)
    if promotions:
        story.extend([Spacer(1, 5 * mm), promotions])

    story.extend(
        [
            Spacer(1, 5 * mm),
            _summary_and_payment_section(receipt, totals, styles),
            Spacer(1, 5 * mm),
            _legal_notes(receipt, styles),
            Spacer(1, 4 * mm),
            _footer(receipt, styles),
        ]
    )

    doc.build(story)
    return buffer.getvalue()


def receipt_pdf_filename(receipt: Mapping[str, Any]) -> str:
    document_number = str(receipt.get("document_number") or receipt["order_id"])
    safe_number = document_number.replace("/", "-").replace("\\", "-").replace(" ", "-")
    return f"invoice-recibo-{safe_number}.pdf"


def _header(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    logo = _logo(receipt)
    brand_lines = [
        f"<b>{_xml(receipt.get('company_name') or 'BONEFREE')}</b>",
        _xml(_text(receipt.get("company_email"))),
        _xml(_text(receipt.get("company_phone"))),
        _xml(_text(receipt.get("public_base_url"))),
    ]
    brand_text = "<br/>".join(line for line in brand_lines if line)
    identity = Table(
        [[logo, Paragraph(brand_text, styles["BrandBlock"])]],
        colWidths=[28 * mm, 78 * mm],
    )
    identity.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    total = _money(
        _amount(receipt.get("total_amount_value"), receipt.get("total_amount")),
        _currency_code(receipt),
    )
    document_number = _xml(receipt.get("document_number") or receipt.get("order_id"))
    title = Paragraph(
        f"<b>FATURA / RECIBO</b><br/><font size='9' color='#5F6673'>{document_number}</font><br/>"
        f"<font size='8' color='#5F6673'>Total pago</font><br/><font size='15'>{_xml(total)}</font>",
        styles["DocumentTitle"],
    )

    table = Table([[identity, title]], colWidths=[106 * mm, 72 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -1), 1, BRAND),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def _company_and_document_section(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    company_rows = _visible_rows(
        [
            ("Marca", receipt.get("company_name")),
            ("Nome legal", receipt.get("company_legal_name")),
            ("NIF", receipt.get("company_nif")),
            ("Morada", _company_address(receipt)),
            ("Telefone", receipt.get("company_phone")),
            ("Email", receipt.get("company_email")),
            ("Website", receipt.get("public_base_url")),
        ]
    )
    document_rows = _visible_rows(
        [
            ("N.º documento", receipt.get("document_number") or receipt.get("order_id")),
            ("Pedido", receipt.get("order_reference") or receipt.get("order_id")),
            ("Emissão", receipt.get("issue_datetime") or receipt.get("order_date")),
            ("Payment", receipt.get("payment_date")),
            ("Método", receipt.get("payment_method")),
            ("Moeda", _currency_label(receipt)),
        ]
    )
    return _two_column_section(
        "Dados da Empresa",
        company_rows,
        "Documento",
        document_rows,
        styles,
    )


def _customer_section(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    rows = [
        ("Nome", receipt.get("customer_name")),
        ("Email", receipt.get("customer_email")),
        ("Telefone", receipt.get("customer_phone") or _customer_phone_from_billing(receipt)),
        ("NIF", receipt.get("customer_nif")),
    ]
    return _single_section("Dados do Customer", _visible_rows(rows), styles)


def _invoice_address_section(invoice_address: str, styles: dict[str, ParagraphStyle]) -> Table:
    return _single_section("Morada de Invoiceção", [("Morada", invoice_address)], styles)


def _items_table(rows: list[dict[str, Any]], styles: dict[str, ParagraphStyle]) -> Table:
    data: list[list[Any]] = [
        [
            Paragraph("Product", styles["TableHead"]),
            Paragraph("Quantidade", styles["TableHeadRight"]),
            Paragraph("Preço Unitário", styles["TableHeadRight"]),
            Paragraph("Desconto", styles["TableHeadRight"]),
            Paragraph("IVA", styles["TableHeadRight"]),
            Paragraph("Total", styles["TableHeadRight"]),
        ]
    ]
    for row in rows:
        product = f"<b>{_xml(row['description'])}</b>"
        if row["customizations"]:
            product += "<br/><font size='7.2' color='#5F6673'>" + "<br/>".join(_xml(value) for value in row["customizations"]) + "</font>"
        if row["discount_gross_amount"] > 0:
            product += f"<br/><font size='7.2' color='#0F766E'>Preço final: {_xml(row['final_unit_gross'])}</font>"

        data.append(
            [
                Paragraph(product, styles["Cell"]),
                Paragraph(row["quantity"], styles["CellRight"]),
                Paragraph(row["unit_gross"], styles["CellRight"]),
                Paragraph(row["discount_gross"], styles["CellRight"]),
                Paragraph(row["iva_rate"], styles["CellRight"]),
                Paragraph(row["line_total"], styles["CellRightStrong"]),
            ]
        )

    table = Table(
        data,
        colWidths=[64 * mm, 20 * mm, 29 * mm, 24 * mm, 15 * mm, 26 * mm],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.7, BRAND),
                ("GRID", (0, 0), (-1, -1), 0.35, FAINT),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FCFCFB")]),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _promotions_section(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table | None:
    discount = _amount(receipt.get("discount_amount"), receipt.get("discount"))
    if discount <= 0:
        return None

    coupon_code = _text(receipt.get("coupon_code"))
    rows = _visible_rows(
        [
            ("Promoção", "Cupão BONEFREE" if coupon_code else "Desconto aplicado"),
            ("Código", coupon_code),
            ("Total poupado", _money(discount, _currency_code(receipt))),
        ]
    )
    return _single_section("Descontos e Promoções", rows, styles, accent=WARNING)


def _summary_and_payment_section(receipt: Mapping[str, Any], totals: Mapping[str, Decimal], styles: dict[str, ParagraphStyle]) -> Table:
    currency_code = _currency_code(receipt)
    summary_rows = [
        ("Subtotal sem discounts", _money(totals["subtotal_gross"], currency_code)),
        ("Total de discounts", f"-{_money(totals['discount_gross'], currency_code)}" if totals["discount_gross"] > 0 else _money(Decimal("0"), currency_code)),
        ("Valor tributável", _money(totals["taxable_amount"], currency_code)),
        (f"IVA ({_rate_label(_iva_rate(receipt))})", _money(totals["iva_total"], currency_code)),
        ("Total pago", _money(totals["total_paid"], currency_code)),
    ]
    payment_rows = _visible_rows(
        [
            ("Método", receipt.get("payment_method")),
            ("Estado", receipt.get("payment_status") or "Pago"),
            ("Referência", receipt.get("payment_reference")),
            ("Data", receipt.get("payment_date") or receipt.get("order_date")),
        ]
    )

    summary = _key_value_table(summary_rows, label_width=45 * mm, value_width=40 * mm, highlight_last=True)
    payment = _key_value_table(payment_rows, label_width=31 * mm, value_width=51 * mm)
    section = _two_column_section("Resumo Financeiro", [], "Payment", [], styles, left_content=summary, right_content=payment)
    section.setStyle(
        TableStyle(
            [
                *_section_box_style(),
                ("BACKGROUND", (0, 1), (0, 1), colors.HexColor("#F9FBF7")),
            ]
        )
    )
    return section


def _legal_notes(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    iva_rate = _iva_rate(receipt)
    notes = ["Documento emitido após payment confirmado."]
    if iva_rate > 0:
        notes.append("Os preços apresentados incluem IVA.")
        notes.append(f"IVA aplicado à taxa de {_rate_label(iva_rate)}.")
    else:
        reason = _text(receipt.get("iva_exemption_reason"))
        if reason:
            notes.append(reason)

    text = "<br/>".join(_xml(note) for note in notes if note)
    table = Table([[Paragraph(text, styles["Note"])]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SOFT),
                ("BOX", (0, 0), (-1, -1), 0.45, FAINT),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def _footer(receipt: Mapping[str, Any], styles: dict[str, ParagraphStyle]) -> Table:
    company = _text(receipt.get("company_name", "BONEFREE"))
    bits = [
        f"<b>{_xml(company)}</b> agradece a sua preferência.",
        "Documento gerado automaticamente pelo sistema BONEFREE.",
        f"NIF: {_xml(receipt.get('company_nif'))}" if _text(receipt.get("company_nif")) else "",
        " | ".join(_xml(value) for value in (receipt.get("company_email"), receipt.get("company_phone")) if _text(value)),
    ]
    table = Table([[Paragraph("<br/>".join(bit for bit in bits if bit), styles["Footer"])]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, 0), 0.6, FAINT),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return table


def _invoice_rows(receipt: Mapping[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Decimal]]:
    iva_rate = _iva_rate(receipt)
    currency_code = _currency_code(receipt)
    rows = []
    subtotal_gross = Decimal("0.00")
    discount_gross_total = Decimal("0.00")
    iva_total = Decimal("0.00")
    total_paid = Decimal("0.00")

    for item in receipt["items"]:
        quantity = _amount(item.get("quantity"), "1")
        unit_gross = _amount(item.get("unit_price_amount"), item.get("unit_price"))
        gross_before_discount = _amount(item.get("line_gross_amount"), item.get("price"))
        discount_gross = _amount(item.get("discount_amount"), "0")
        line_total_gross = _amount(item.get("line_total_amount"), None)
        if line_total_gross <= 0:
            line_total_gross = max(Decimal("0.00"), gross_before_discount - discount_gross)

        final_unit_gross = (line_total_gross / quantity).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if quantity > 0 else line_total_gross
        line_net = _net_from_gross(line_total_gross, iva_rate)
        line_iva = (line_total_gross - line_net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        subtotal_gross += gross_before_discount
        discount_gross_total += discount_gross
        iva_total += line_iva
        total_paid += line_total_gross

        rows.append(
            {
                "description": _text(item.get("name")) or "Product",
                "customizations": [str(value) for value in item.get("customizations") or [] if str(value).strip()],
                "quantity": _quantity_label(quantity),
                "unit_gross": _money(unit_gross, currency_code),
                "final_unit_gross": _money(final_unit_gross, currency_code),
                "discount_gross": f"-{_money(discount_gross, currency_code)}" if discount_gross > 0 else "-",
                "discount_gross_amount": discount_gross,
                "iva_rate": _rate_label(iva_rate) if iva_rate > 0 else "Isento",
                "line_total": _money(line_total_gross, currency_code),
            }
        )

    extra_gross = _amount(receipt.get("shipping_amount"), receipt.get("shipping"))
    extra_gross += _amount(receipt.get("service_fee_amount"), receipt.get("service_fee"))
    if extra_gross > 0:
        extra_net = _net_from_gross(extra_gross, iva_rate)
        extra_iva = (extra_gross - extra_net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        subtotal_gross += extra_gross
        iva_total += extra_iva
        total_paid += extra_gross
        rows.append(
            {
                "description": "Taxas e serviços",
                "customizations": [],
                "quantity": "1",
                "unit_gross": _money(extra_gross, currency_code),
                "final_unit_gross": _money(extra_gross, currency_code),
                "discount_gross": "-",
                "discount_gross_amount": Decimal("0.00"),
                "iva_rate": _rate_label(iva_rate) if iva_rate > 0 else "Isento",
                "line_total": _money(extra_gross, currency_code),
            }
        )

    expected_total = _amount(receipt.get("total_amount_value"), receipt.get("total_amount"))
    if expected_total > 0:
        total_paid = expected_total

    if "vat_amount_value" in receipt:
        iva_total = _amount(receipt.get("vat_amount_value"), "0")
        taxable_amount = max(Decimal("0.00"), total_paid - iva_total)
    else:
        taxable_amount = _net_from_gross(total_paid, iva_rate)
    return rows, {
        "subtotal_gross": subtotal_gross.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "discount_gross": discount_gross_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "taxable_amount": taxable_amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "iva_total": iva_total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "total_paid": total_paid.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    }


def _section_title(title: str, styles: dict[str, ParagraphStyle]) -> Paragraph:
    return Paragraph(_xml(title), styles["SectionTitle"])


def _single_section(title: str, rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle], accent: Any = ACCENT) -> Table:
    content = _key_value_table(rows, label_width=36 * mm, value_width=132 * mm)
    table = Table([[Paragraph(_xml(title), styles["SectionHeader"])], [content]], colWidths=[CONTENT_WIDTH])
    table.setStyle(TableStyle(_section_box_style(accent)))
    return table


def _two_column_section(
    left_title: str,
    left_rows: list[tuple[str, str]],
    right_title: str,
    right_rows: list[tuple[str, str]],
    styles: dict[str, ParagraphStyle],
    left_content: Any | None = None,
    right_content: Any | None = None,
) -> Table:
    left = left_content or _key_value_table(left_rows)
    right = right_content or _key_value_table(right_rows)
    data = [
        [Paragraph(_xml(left_title), styles["SectionHeader"]), Paragraph(_xml(right_title), styles["SectionHeader"])],
        [left, right],
    ]
    table = Table(data, colWidths=[88 * mm, 88 * mm])
    table.setStyle(TableStyle(_section_box_style()))
    return table


def _section_box_style(accent: Any = ACCENT) -> list[tuple]:
    return [
        ("BACKGROUND", (0, 0), (-1, 0), SOFT_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), BRAND),
        ("LINEABOVE", (0, 0), (-1, 0), 1.0, accent),
        ("BOX", (0, 0), (-1, -1), 0.45, FAINT),
        ("INNERGRID", (0, 0), (-1, -1), 0.35, FAINT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]


def _key_value_table(rows: list[tuple[str, str]], label_width: Any = 28 * mm, value_width: Any = 58 * mm, highlight_last: bool = False) -> Table:
    if not rows:
        rows = [("", "")]
    styles = _key_value_styles()
    data = [[Paragraph(_xml(label), styles[0]), Paragraph(_lines(value), styles[1])] for label, value in rows]
    table = Table(data, colWidths=[label_width, value_width])
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]
    if highlight_last and rows:
        commands.extend(
            [
                ("LINEABOVE", (0, -1), (-1, -1), 0.7, BRAND),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    table.setStyle(TableStyle(commands))
    return table


def _visible_rows(rows: list[tuple[str, Any]]) -> list[tuple[str, str]]:
    return [(label, _text(value)) for label, value in rows if _text(value)]


def _company_address(receipt: Mapping[str, Any]) -> str:
    company_name = _text(receipt.get("company_name")).casefold()
    lines = _text(receipt.get("company_address")).splitlines()
    if lines and lines[0].strip().casefold() == company_name:
        lines = lines[1:]
    return "\n".join(line.strip() for line in lines if line.strip())


def _customer_phone_from_billing(receipt: Mapping[str, Any]) -> str:
    billing_lines = [line.strip() for line in _text(receipt.get("billing_address")).splitlines() if line.strip()]
    address_lines = set(line.strip() for line in _text(receipt.get("customer_address")).splitlines() if line.strip())
    for line in billing_lines:
        if line == _text(receipt.get("customer_name")) or line == _text(receipt.get("customer_email")):
            continue
        if line in address_lines:
            continue
        if any(char.isdigit() for char in line):
            return line
    return ""


def _logo(receipt: Mapping[str, Any]) -> Any:
    path = _logo_path(receipt.get("company_logo_url"))
    if not path:
        initials = (_text(receipt.get("company_name")) or "P")[:2].upper()
        badge = Table([[Paragraph(_xml(initials), _styles()["LogoText"])]], colWidths=[22 * mm], rowHeights=[22 * mm])
        badge.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), BRAND),
                    ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BOX", (0, 0), (-1, -1), 0.4, BRAND),
                ]
            )
        )
        return badge

    image = Image(str(path), width=22 * mm, height=22 * mm, kind="proportional")
    return image


def _logo_path(value: Any) -> Path | None:
    raw = _text(value)
    if not raw:
        return None

    parsed = urlparse(raw)
    candidates: list[Path] = []
    if parsed.scheme in {"http", "https"}:
        path = parsed.path
        if path.startswith("/public/"):
            path = path.removeprefix("/public/")
        candidates.append(Path(__file__).resolve().parents[2] / "public" / path.lstrip("/"))
        candidates.append(Path(__file__).resolve().parents[2] / "public" / "assets" / "images" / Path(path).name)
    elif parsed.scheme == "":
        candidates.append(Path(raw))
        candidates.append(Path(__file__).resolve().parents[2] / raw.lstrip("/"))

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


def _key_value_styles() -> tuple[ParagraphStyle, ParagraphStyle]:
    base = getSampleStyleSheet()["Normal"]
    return (
        ParagraphStyle("InvoiceKVLabel", parent=base, fontName="Helvetica-Bold", fontSize=7.7, leading=10, textColor=MUTED),
        ParagraphStyle("InvoiceKVValue", parent=base, fontName="Helvetica", fontSize=8, leading=10.5, textColor=INK),
    )


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "BrandBlock": ParagraphStyle("BrandBlock", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=INK),
        "DocumentTitle": ParagraphStyle("DocumentTitle", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, alignment=TA_RIGHT),
        "LogoText": ParagraphStyle("LogoText", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=12, textColor=colors.white, alignment=TA_CENTER),
        "SectionHeader": ParagraphStyle("SectionHeader", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=BRAND),
        "SectionTitle": ParagraphStyle("SectionTitle", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=INK),
        "TableHead": ParagraphStyle("TableHead", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.8, leading=10, textColor=colors.white),
        "TableHeadRight": ParagraphStyle("TableHeadRight", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.8, leading=10, textColor=colors.white, alignment=TA_RIGHT),
        "Cell": ParagraphStyle("Cell", parent=base["Normal"], fontName="Helvetica", fontSize=7.8, leading=10.2, textColor=INK),
        "CellRight": ParagraphStyle("CellRight", parent=base["Normal"], fontName="Helvetica", fontSize=7.6, leading=10, textColor=INK, alignment=TA_RIGHT),
        "CellRightStrong": ParagraphStyle("CellRightStrong", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=7.7, leading=10, textColor=INK, alignment=TA_RIGHT),
        "Note": ParagraphStyle("Note", parent=base["Normal"], fontName="Helvetica", fontSize=7.8, leading=10.5, textColor=MUTED),
        "Footer": ParagraphStyle("Footer", parent=base["Normal"], fontName="Helvetica", fontSize=7.6, leading=10.5, textColor=MUTED, alignment=TA_CENTER),
    }


def _iva_rate(receipt: Mapping[str, Any]) -> Decimal:
    return _amount(receipt.get("iva_rate"), "13")


def _net_from_gross(value: Decimal, iva_rate: Decimal) -> Decimal:
    if iva_rate <= 0:
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    divisor = Decimal("1") + (iva_rate / Decimal("100"))
    return (value / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _amount(primary: Any, fallback: Any = None) -> Decimal:
    value = primary if primary not in (None, "") else fallback
    if value in (None, ""):
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    text = str(value).strip()
    for token in ("EUR", "€", "â‚¬"):
        text = text.replace(token, "")
    text = text.replace(" ", "").replace("\u00a0", "")
    if "," in text and "." in text:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")
    try:
        return Decimal(text).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def _currency_code(receipt: Mapping[str, Any]) -> str:
    return _text(receipt.get("currency_code") or "EUR").upper()


def _currency_label(receipt: Mapping[str, Any]) -> str:
    code = _currency_code(receipt)
    return "EUR (€)" if code == "EUR" else code


def _money(value: Decimal, currency_code: str = "EUR") -> str:
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if amount < 0 else ""
    amount = abs(amount)
    whole, cents = f"{amount:.2f}".split(".")
    groups = []
    while whole:
        groups.insert(0, whole[-3:])
        whole = whole[:-3]
    currency = "€" if currency_code.upper() == "EUR" else currency_code.upper()
    return f"{sign}{'.'.join(groups)},{cents} {currency}"


def _rate_label(value: Decimal) -> str:
    rate = value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if rate == rate.to_integral():
        return f"{int(rate)}%"
    return f"{str(rate).replace('.', ',')}%"


def _quantity_label(value: Decimal) -> str:
    if value == value.to_integral():
        return str(int(value))
    return str(value.normalize()).replace(".", ",")


def _text(value: Any = "") -> str:
    if value in (None, ""):
        return ""
    return str(value).strip()


def _xml(value: Any = "") -> str:
    return escape(_text(value), quote=True)


def _lines(value: Any) -> str:
    return _xml(value).replace("\r\n", "\n").replace("\n", "<br/>")
