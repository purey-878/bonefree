"""Checkout routes backed by the prey_resturante encomenda schema."""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import uuid4
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user_optional, hash_password
from database import get_db
from models import (
    Carrinho,
    CarrinhoProduto,
    CarrinhoProdutoCustomizacao,
    Cliente,
    ClienteLoyalty,
    Cupom,
    Encomenda,
    EncomendaProduto,
    Pagamento,
    Produto,
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


def _payment_method(payment_method: str) -> str:
    if payment_method == "cash":
        return "balcao"
    if payment_method in {"mbway", "qr_pay"}:
        return "mbway"
    return "cartao"


def _is_online_payment(method: str | None) -> bool:
    return method in ONLINE_PAYMENT_METHODS


def _included_iva(total: Decimal, iva_percentual: Decimal = IVA_PERCENTUAL) -> Decimal:
    if total <= 0:
        return Decimal("0.00")
    multiplier = Decimal("1") + (iva_percentual / Decimal("100"))
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


def _response_payment_method(encomenda: Encomenda) -> str:
    checkout_payment = _note_value(encomenda.notas, "checkout_payment")
    if checkout_payment == "qr_pay":
        return "mbway"
    if checkout_payment in {"card", "cash", "mbway"}:
        return checkout_payment
    if encomenda.metodo_pagamento == "balcao":
        return "cash"
    if encomenda.metodo_pagamento == "mbway":
        return "mbway"
    return "card"


def _cart_items_for_user(db: Session, current_user: Cliente) -> list[CheckoutItem]:
    cart = db.query(Carrinho).filter(Carrinho.id_cliente == current_user.id_cliente).first()
    if not cart:
        return []

    return [
        CheckoutItem(
            id_produto=item.id_produto,
            quantidade=item.quantidade,
            customizacao=customization_from_json(item.customizacao),
        )
        for item in cart.itens
    ]


def _clear_user_cart(db: Session, current_user: Optional[Cliente]) -> None:
    if not current_user:
        return

    cart = db.query(Carrinho).filter(Carrinho.id_cliente == current_user.id_cliente).first()
    if not cart:
        return

    cart_item_ids = [
        cart_log_id
        for (cart_log_id,) in db.query(CarrinhoProduto.cart_log_id)
        .filter(CarrinhoProduto.id_carrinho == cart.id_carrinho)
        .all()
    ]
    if not cart_item_ids:
        return

    db.query(CarrinhoProdutoCustomizacao).filter(
        CarrinhoProdutoCustomizacao.cart_log_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)
    db.query(CarrinhoProduto).filter(
        CarrinhoProduto.cart_log_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)


def _get_or_create_checkout_customer(db: Session, body: CheckoutRequest, current_user: Optional[Cliente]) -> Cliente:
    nif_provided = "nif" in body.customer.model_fields_set
    checkout_nif = (body.customer.nif or "").strip() or None

    if current_user:
        customer = db.query(Cliente).filter(Cliente.id_cliente == current_user.id_cliente).first() or current_user
        should_save_checkout_nif = nif_provided and checkout_nif and not customer.nif
        if should_save_checkout_nif:
            existing = db.query(Cliente).filter(
                Cliente.nif == checkout_nif,
                Cliente.id_cliente != customer.id_cliente,
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Este NIF já está em uso.")
        if should_save_checkout_nif:
            customer.nif = checkout_nif
        customer.nome = body.customer.first_name
        customer.apelido = body.customer.last_name
        if body.customer.phone:
            customer.telefone = body.customer.phone
        return customer

    customer = db.query(Cliente).filter(Cliente.email == body.customer.email).first()
    if customer:
        should_save_checkout_nif = nif_provided and checkout_nif and not customer.nif
        if should_save_checkout_nif:
            existing = db.query(Cliente).filter(
                Cliente.nif == checkout_nif,
                Cliente.id_cliente != customer.id_cliente,
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Este NIF já está em uso.")
        if should_save_checkout_nif:
            customer.nif = checkout_nif
        customer.nome = body.customer.first_name
        customer.apelido = body.customer.last_name
        if body.customer.phone:
            customer.telefone = body.customer.phone
        return customer

    customer = Cliente(
        nome=body.customer.first_name,
        apelido=body.customer.last_name,
        email=body.customer.email,
        telefone=body.customer.phone,
        nif=checkout_nif,
        palavra_passe=hash_password(uuid4().hex),
        status=1,
        data_criacao=datetime.utcnow(),
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


def _available_coupon_query(db: Session, current_user: Cliente):
    now = datetime.utcnow()
    return db.query(Cupom).filter(
        Cupom.id_cliente == current_user.id_cliente,
        Cupom.usado.is_(False),
        ((Cupom.expira_em.is_(None)) | (Cupom.expira_em > now)),
    )


def _calculate_coupon_discount(coupon: Cupom, subtotal: Decimal) -> Decimal:
    if subtotal < Decimal(str(coupon.valor_minimo_pedido)):
        raise HTTPException(
            status_code=400,
            detail=f"O cupão requer um pedido mínimo de {_format_money_pt(Decimal(str(coupon.valor_minimo_pedido)))}.",
        )

    if coupon.tipo == "PERCENTAGEM":
        discount = subtotal * (Decimal(str(coupon.valor)) / Decimal("100"))
    else:
        discount = Decimal(str(coupon.valor))

    return min(subtotal, discount).quantize(Decimal("0.01"))


def _get_valid_coupon(db: Session, current_user: Cliente, code: str | None, subtotal: Decimal) -> tuple[Cupom | None, Decimal]:
    normalized_code = _normalize_coupon_code(code)
    if not normalized_code:
        return None, Decimal("0")

    coupon = _available_coupon_query(db, current_user).filter(Cupom.codigo == normalized_code).first()
    if not coupon:
        raise HTTPException(status_code=400, detail="O cupão é inválido, expirou ou já foi usado.")

    return coupon, _calculate_coupon_discount(coupon, subtotal)


def _get_or_create_loyalty(db: Session, current_user: Cliente) -> ClienteLoyalty:
    loyalty = db.query(ClienteLoyalty).filter(ClienteLoyalty.id_cliente == current_user.id_cliente).first()
    if not loyalty:
        loyalty = ClienteLoyalty(id_cliente=current_user.id_cliente, pedidos_acima_50=0, total_cupons_ganhos=0)
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
    return f"PREY{compact_value}P" if discount_type == "PERCENTAGEM" else f"PREY{compact_value}"


def _new_coupon_code(db: Session, current_user: Cliente, discount_type: str, discount_value: Decimal) -> str:
    prefix = _coupon_code_prefix(discount_type, discount_value)
    for _ in range(10):
        code = f"{prefix}-{current_user.id_cliente}-{uuid4().hex[:6].upper()}"
        exists = db.query(Cupom).filter(Cupom.codigo == code).first()
        if not exists:
            return code
    return f"{prefix}-{uuid4().hex[:12].upper()}"


def _award_loyalty_coupon_if_eligible(db: Session, current_user: Cliente, qualifying_subtotal: Decimal) -> str | None:
    settings = get_loyalty_coupon_settings(db)
    qualifying_minimum = Decimal(str(settings.qualifying_order_minimum))
    qualifying_count = int(settings.qualifying_order_count)

    if qualifying_subtotal < qualifying_minimum:
        return None

    loyalty = db.query(ClienteLoyalty).filter(ClienteLoyalty.id_cliente == current_user.id_cliente).first()
    if not settings.enabled and (not loyalty or loyalty.pedidos_acima_50 <= 0):
        return None

    if not loyalty:
        loyalty = _get_or_create_loyalty(db, current_user)

    loyalty.pedidos_acima_50 += 1
    loyalty.atualizado_em = datetime.utcnow()

    if loyalty.pedidos_acima_50 < qualifying_count:
        return None

    loyalty.pedidos_acima_50 -= qualifying_count
    loyalty.total_cupons_ganhos += 1
    if not settings.enabled:
        loyalty.pedidos_acima_50 = 0

    discount_value = Decimal(str(settings.discount_value))
    coupon_minimum_order = Decimal(str(settings.coupon_minimum_order))
    code = _new_coupon_code(db, current_user, settings.discount_type, discount_value)
    db.add(Cupom(
        id_cliente=current_user.id_cliente,
        codigo=code,
        tipo=settings.discount_type,
        valor=discount_value,
        valor_minimo_pedido=coupon_minimum_order,
        usado=False,
    ))
    return code


def _order_response(encomenda: Encomenda) -> dict:
    subtotal = Decimal(str(getattr(encomenda, "subtotal", 0) or 0))
    if subtotal <= 0:
        subtotal = sum(Decimal(str(item.preco_unitario)) * item.quantidade for item in encomenda.itens)
    discount = Decimal(str(getattr(encomenda, "desconto_total", 0) or 0))
    if discount <= 0:
        discount = _coupon_discount_from_notes(encomenda.notas)
    fees = Decimal(str(encomenda.total)) + discount - subtotal
    response_payment = _response_payment_method(encomenda)
    latest_refund = sorted(
        encomenda.reembolsos or [],
        key=lambda refund: refund.data_reembolso or datetime.min,
        reverse=True,
    )
    refund = latest_refund[0] if latest_refund else None

    return {
        "id_pedido": encomenda.id_encomenda,
        "numero_pedido": f"ENC-{encomenda.id_encomenda:06d}",
        "status": encomenda.estado,
        "estado_pagamento": encomenda.estado_pagamento,
        "can_cancel": _can_customer_cancel(encomenda),
        "cancellation_source": encomenda.origem_cancelamento,
        "cancelled_at": encomenda.data_cancelamento,
        "refund_status": "Approved" if refund else "None",
        "refund_amount": refund.valor if refund else None,
        "refund_reason": refund.motivo if refund else None,
        "refund_date": refund.data_reembolso if refund else None,
        "metodo_entrega": _fulfillment_from_notes(encomenda.notas),
        "metodo_pagamento": response_payment,
        "subtotal": subtotal,
        "desconto": discount,
        "taxa_entrega": Decimal("0"),
        "taxa_servico": fees if fees > 0 else Decimal("0"),
        "total": encomenda.total,
        "cupom_codigo": _coupon_code_from_notes(encomenda.notas),
        "cupom_gerado": _generated_coupon_from_notes(encomenda.notas),
        "data_criacao": encomenda.data_encomenda,
        "itens": [
            {
                "id_produto": item.id_produto,
                "id_produto_display": format_product_id(item.id_produto),
                "nome_produto": item.nome_produto_snapshot or (item.produto.nome if item.produto else format_product_id(item.id_produto)),
                "preco_unitario": item.preco_unitario,
                "quantidade": item.quantidade,
                "customizacao": customization_from_json(item.customizacao),
                "subtotal": Decimal(str(item.preco_unitario)) * item.quantidade,
                "imagem": (
                    item.produto.imagens[0].caminho_imagem
                    if item.produto and item.produto.imagens else item.produto.imagem if item.produto else None
                ),
                "calorias": item.produto.total_calorias if item.produto else None,
            }
            for item in encomenda.itens
        ],
    }


def _can_customer_cancel(encomenda: Encomenda) -> bool:
    return encomenda.estado == "pendente" and encomenda.estado_pagamento == "nao_pago"


@router.get("/coupons", response_model=list[CouponResponse])
def list_available_coupons(
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para ver os cupões.")

    coupons = _available_coupon_query(db, current_user).order_by(Cupom.criado_em.desc()).all()
    return [
        CouponResponse(
            id_cupom=coupon.id_cupom,
            codigo=coupon.codigo,
            tipo=coupon.tipo,
            valor=coupon.valor,
            valor_minimo_pedido=coupon.valor_minimo_pedido,
            expira_em=coupon.expira_em,
        )
        for coupon in coupons
    ]


@router.post("/coupons/validate", response_model=CouponValidationResponse)
def validate_coupon(
    body: CouponValidationRequest,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para usar cupões.")

    coupon, discount = _get_valid_coupon(db, current_user, body.codigo, body.subtotal)
    if not coupon:
        raise HTTPException(status_code=400, detail="O código do cupão é obrigatório.")

    return CouponValidationResponse(
        codigo=coupon.codigo,
        desconto=discount,
        valor=coupon.valor,
        tipo=coupon.tipo,
        valor_minimo_pedido=coupon.valor_minimo_pedido,
    )


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    body: CheckoutRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para finalizar a compra.")

    items = _cart_items_for_user(db, current_user) if current_user else body.items
    if not items:
        items = body.items

    if not items:
        raise HTTPException(status_code=400, detail="Não é possível criar um pedido com o carrinho vazio.")

    product_ids = [item.id_produto for item in items]
    products = (
        db.query(Produto)
        .options(joinedload(Produto.imagens))
        .filter(Produto.id_produto.in_(product_ids))
        .all()
    )
    product_map = {product.id_produto: product for product in products}

    subtotal = Decimal("0")
    order_items: list[dict] = []

    for item in items:
        product = product_map.get(item.id_produto)
        if not product or product.status == 0 or product.deleted_at is not None:
            raise HTTPException(status_code=404, detail=f"O produto '{format_product_id(item.id_produto)}' já não está disponível.")

        if unavailable_due_to_inactive_base(db, product):
            raise HTTPException(
                status_code=400,
                detail=f"'{product.nome}' não está disponível neste momento.",
            )

        if product.stock < item.quantidade:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{product.nome}'. Pedido: {item.quantidade}, disponível: {product.stock}.",
            )

        unit_price = (
            Decimal(str(item.customizacao.preco_unitario_final))
            if item.customizacao and item.customizacao.preco_unitario_final is not None
            else discounted_product_price(product)
        )
        line_total = unit_price * item.quantidade
        subtotal += line_total
        product.stock -= item.quantidade
        product.vendido = (product.vendido or 0) + item.quantidade

        order_items.append({
            "id_produto": product.id_produto,
            "nome_produto_snapshot": product.nome,
            "desconto_percentual_snapshot": Decimal(str(product.desconto_percentual or 0)),
            "preco_unitario": unit_price,
            "quantidade": item.quantidade,
            "customizacao": customization_to_json(item.customizacao),
        })

    customer = _get_or_create_checkout_customer(db, body, current_user)
    db_method = _payment_method(body.payment_method)
    online_payment = _is_online_payment(db_method)
    delivery_fee = Decimal("0")
    coupon, coupon_discount = _get_valid_coupon(db, current_user, body.promo_code, subtotal)
    total = subtotal - coupon_discount + delivery_fee + SERVICE_FEE
    iva_valor = _included_iva(total)
    generated_coupon_code = _award_loyalty_coupon_if_eligible(db, current_user, subtotal)
    note_parts: list[str] = []
    if coupon:
        note_parts.extend([f"coupon={coupon.codigo}", f"coupon_discount={coupon_discount:.2f}"])
        coupon.usado = True
        coupon.usado_em = datetime.utcnow()
    if generated_coupon_code:
        note_parts.append(f"coupon_generated={generated_coupon_code}")
    order_notes = _checkout_notes(body, note_parts)

    encomenda = Encomenda(
        id_cliente=customer.id_cliente,
        id_admin=None,
        estado="confirmada" if online_payment else "pendente",
        metodo_pagamento=db_method,
        estado_pagamento="pago" if online_payment else "nao_pago",
        subtotal=subtotal,
        iva_percentual=IVA_PERCENTUAL,
        iva_valor=iva_valor,
        desconto_total=coupon_discount,
        total=total,
        notas=order_notes,
        itens=[
            EncomendaProduto(
                id_produto=item["id_produto"],
                quantidade=item["quantidade"],
                preco_unitario=item["preco_unitario"],
                nome_produto_snapshot=item["nome_produto_snapshot"],
                desconto_percentual_snapshot=item["desconto_percentual_snapshot"],
                iva_percentual_snapshot=IVA_PERCENTUAL,
                customizacao=item["customizacao"],
            )
            for item in order_items
        ],
    )

    db.add(encomenda)
    db.flush()

    db.add(Pagamento(
        id_encomenda=encomenda.id_encomenda,
        metodo=db_method,
        estado="aprovado" if online_payment else "pendente",
        valor=total,
        referencia_transacao=f"{'MBW' if db_method == 'mbway' else 'TXN' if online_payment else 'BAL'}-{datetime.utcnow().strftime('%Y%m%d')}-{encomenda.id_encomenda:03d}",
        data_pagamento=datetime.utcnow() if online_payment else None,
    ))

    db.flush()
    if online_payment:
        ensure_invoice_for_order(db, encomenda)
    _clear_user_cart(db, current_user)
    db.commit()

    saved = (
        db.query(Encomenda)
        .options(joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto))
        .filter(Encomenda.id_encomenda == encomenda.id_encomenda)
        .first()
    )
    response = _order_response(saved)

    if online_payment:
        try:
            receipt_payload = build_order_receipt_payload(saved, body, delivery_fee, SERVICE_FEE)
            background_tasks.add_task(send_purchase_receipt, receipt_payload)
        except Exception:
            logger.exception("Failed to schedule receipt email for order %s.", encomenda.id_encomenda)

    return response


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para cancelar um pedido.")

    encomenda = (
        db.query(Encomenda)
        .options(joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto))
        .filter(
            Encomenda.id_encomenda == order_id,
            Encomenda.id_cliente == current_user.id_cliente,
        )
        .first()
    )
    if not encomenda:
        raise HTTPException(status_code=404, detail="Pedido não encontrado.")
    if not _can_customer_cancel(encomenda):
        raise HTTPException(status_code=400, detail="Os pedidos só podem ser cancelados antes da confirmação do pagamento.")

    encomenda.estado = "cancelada"
    encomenda.data_cancelamento = datetime.utcnow()
    encomenda.origem_cancelamento = "Customer"
    encomenda.data_atualizacao = datetime.utcnow()
    if encomenda.pagamento:
        encomenda.pagamento.estado = "rejeitado"
    db.commit()
    db.refresh(encomenda)
    return _order_response(encomenda)


@router.get("/orders/{order_id}/receipt.pdf")
def download_order_receipt_pdf(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para descarregar recibos.")

    if not render_receipt_pdf or not receipt_pdf_filename:
        raise HTTPException(status_code=503, detail="O serviço de PDF do recibo está indisponível.")

    encomenda = (
        db.query(Encomenda)
        .options(
            joinedload(Encomenda.cliente),
            joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto),
        )
        .filter(
            Encomenda.id_encomenda == order_id,
            Encomenda.id_cliente == current_user.id_cliente,
        )
        .first()
    )
    if not encomenda:
        raise HTTPException(status_code=404, detail="Recibo do pedido não encontrado.")

    receipt = build_saved_order_receipt_payload(encomenda)
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
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Inicie sessão para ver o histórico de pedidos.")

    encomendas = (
        db.query(Encomenda)
        .options(joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto))
        .filter(Encomenda.id_cliente == current_user.id_cliente)
        .order_by(Encomenda.data_encomenda.desc())
        .all()
    )
    return [_order_response(encomenda) for encomenda in encomendas]
