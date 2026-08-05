"""Customer profile and purchase history routes."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user
from database import get_db
from models import Cliente, ClienteEnderecoFatura, Encomenda, EncomendaProduto
from schemas import UserProfileUpdate, UserResponse
from schemas.checkout import OrderResponse
from services.order_customization import customization_from_json
from utils.id_format import format_product_id

router = APIRouter(prefix="/profile", tags=["Profile"])


def _address_payload_has_data(payload: dict | None) -> bool:
    if not payload:
        return False
    return any(str(payload.get(field) or "").strip() for field in ("morada", "codigo_postal", "cidade"))


def _sync_invoice_address(db: Session, profile_user: Cliente, payload: dict | None) -> None:
    current_address = profile_user.endereco_fatura
    if not _address_payload_has_data(payload):
        if current_address:
            db.delete(current_address)
            profile_user.endereco_fatura = None
        return

    address = current_address or ClienteEnderecoFatura(cliente_id=profile_user.id_cliente)
    address.morada = payload.get("morada") or None
    address.codigo_postal = payload.get("codigo_postal") or None
    address.cidade = payload.get("cidade") or None
    address.pais = "Portugal"

    if not current_address:
        db.add(address)
        profile_user.endereco_fatura = address


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


def _order_response(encomenda: Encomenda) -> dict:
    subtotal = Decimal(str(getattr(encomenda, "subtotal", 0) or 0))
    if subtotal <= 0:
        subtotal = sum(Decimal(str(item.preco_unitario)) * item.quantidade for item in encomenda.itens)
    discount = Decimal(str(getattr(encomenda, "desconto_total", 0) or 0))
    fees = Decimal(str(encomenda.total)) + discount - subtotal
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
        "can_cancel": encomenda.estado == "pendente" and encomenda.estado_pagamento == "nao_pago",
        "cancellation_source": encomenda.origem_cancelamento,
        "cancelled_at": encomenda.data_cancelamento,
        "refund_status": "Approved" if refund else "None",
        "refund_amount": refund.valor if refund else None,
        "refund_reason": refund.motivo if refund else None,
        "refund_date": refund.data_reembolso if refund else None,
        "metodo_entrega": _fulfillment_from_notes(encomenda.notas),
        "metodo_pagamento": _payment_method_response(encomenda.metodo_pagamento),
        "subtotal": subtotal,
        "taxa_entrega": Decimal("0"),
        "taxa_servico": fees if fees > 0 else Decimal("0"),
        "total": encomenda.total,
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


@router.get("", response_model=UserResponse)
def get_profile(current_user: Cliente = Depends(get_current_user)):
    return current_user


@router.put("", response_model=UserResponse)
def update_profile(
    body: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: Cliente = Depends(get_current_user),
):
    updates = body.model_dump(exclude_unset=True)
    address_was_provided = "endereco_fatura" in body.model_fields_set
    address_update = updates.pop("endereco_fatura", None) if address_was_provided else None
    profile_user = (
        db.query(Cliente)
        .options(joinedload(Cliente.endereco_fatura))
        .filter(Cliente.id_cliente == current_user.id_cliente)
        .first()
    )
    if not profile_user:
        raise HTTPException(status_code=401, detail="Utilizador não encontrado.")

    new_email = updates.get("email")
    if new_email and new_email != profile_user.email:
        existing = db.query(Cliente).filter(
            Cliente.email == new_email,
            Cliente.id_cliente != profile_user.id_cliente,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Este email já está em uso.")

    new_nif = updates.get("nif")
    if new_nif and new_nif != profile_user.nif:
        existing = db.query(Cliente).filter(
            Cliente.nif == new_nif,
            Cliente.id_cliente != profile_user.id_cliente,
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
    current_user: Cliente = Depends(get_current_user),
):
    query = (
        db.query(Encomenda)
        .options(joinedload(Encomenda.itens).joinedload(EncomendaProduto.produto))
        .filter(Encomenda.id_cliente == current_user.id_cliente)
    )

    if status:
        query = query.filter(Encomenda.estado == status)

    if payment:
        query = query.filter(Encomenda.metodo_pagamento.in_(_payment_filter_values(payment)))

    if date_from:
        query = query.filter(func.date(Encomenda.data_encomenda) >= date_from)

    if date_to:
        query = query.filter(func.date(Encomenda.data_encomenda) <= date_to)

    if search:
        pattern = f"%{search}%"
        query = query.join(Encomenda.itens).join(EncomendaProduto.produto).filter(
            cast(EncomendaProduto.id_produto, String).ilike(pattern)
        )

    return [_order_response(order) for order in query.order_by(Encomenda.data_encomenda.desc()).all()]
