from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from database import get_db
from models import (
    Carrinho,
    CarrinhoProduto,
    CarrinhoProdutoCustomizacao,
    Cliente,
    Produto,
    ProdutoIngrediente,
    ProdutoOpcaoCustomizacao,
)
from schemas import (
    CarrinhoOut,
    CarrinhoItemOut,
    AdicionarItemSchema,
    AtualizarItemSchema,
    CustomizedCartItemRequest,
    ItemCustomization,
    MergeCarrinhoSchema,
    MergeResultado,
)
from auth import get_current_user, get_current_user_optional
from services.order_customization import customization_from_json, customization_to_json
from services.product_availability import unavailable_due_to_inactive_base
from services.product_pricing import discounted_product_price
from utils.id_format import format_product_id, parse_product_id

router = APIRouter(prefix="/cart", tags=["Carrinho"])
alias_router = APIRouter(prefix="/carrinho", tags=["Carrinho"])
CUSTOMIZATION_ADD_SURCHARGE = Decimal("1.00")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _product_image_path(produto: Produto) -> str | None:
    """Return a frontend asset path for a product image."""
    image_path = None
    if produto.imagens:
        image_path = produto.imagens[0].caminho_imagem
    elif produto.imagem:
        image_path = produto.imagem

    if image_path:
        if image_path.startswith(("http://", "https://", "/assets/", "/menu-images/")):
            return image_path
        if image_path.startswith("menu-images/"):
            return f"/{image_path}"
        return f"/menu-images/{image_path}"

    if produto.nome:
        filename = produto.nome.lower().replace(' ', '').replace('ã', 'a').replace('é', 'e').replace('ç', 'c')
        filename = ''.join(c for c in filename if c.isalnum())
        return f"/menu-images/{filename}.webp"

    return None

def _get_or_create_carrinho(db: Session, id_cliente: int) -> Carrinho:
    """Return the customer's cart, creating one if it doesn't exist yet."""
    cart = db.query(Carrinho).filter(Carrinho.id_cliente == id_cliente).first()
    if not cart:
        cart = Carrinho(id_cliente=id_cliente, data_criacao=datetime.utcnow().date())
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _build_item_out(item: CarrinhoProduto) -> CarrinhoItemOut:
    """Convert a CarrinhoProduto ORM row into the response schema."""
    produto = item.produto
    imagem = _product_image_path(produto)
    
    customizacao = customization_from_json(item.customizacao)
    preco = (
        Decimal(str(customizacao.preco_unitario_final))
        if customizacao and customizacao.preco_unitario_final is not None
        else discounted_product_price(produto)
    )
    quantidade = item.quantidade
    return CarrinhoItemOut(
        cart_log_id=item.cart_log_id,
        id_produto=produto.id_produto,
        id_produto_display=format_product_id(produto.id_produto),
        nome=produto.nome,
        preco=preco,
        quantidade=quantidade,
        stock=produto.stock,
        caminho_imagem=imagem,
        customizacao=customizacao,
        subtotal=preco * quantidade,
    )


def _build_cart_out(cart: Carrinho) -> CarrinhoOut:
    """Convert a Carrinho ORM object into the full response schema."""
    itens = [_build_item_out(i) for i in cart.itens]
    total = sum(i.subtotal for i in itens)
    return CarrinhoOut(id_carrinho=cart.id_carrinho, itens=itens, total=total)


def _get_produto_or_404(db: Session, id_produto: int) -> Produto:
    produto = db.query(Produto).filter(
        and_(Produto.id_produto == id_produto, Produto.status == 1, Produto.deleted_at.is_(None))
    ).first()
    if not produto:
        raise HTTPException(status_code=404, detail=f"Produto '{format_product_id(id_produto)}' não encontrado.")
    return produto


def _ensure_product_orderable(db: Session, produto: Produto) -> None:
    if unavailable_due_to_inactive_base(db, produto):
        raise HTTPException(
            status_code=400,
            detail=f"'{produto.nome}' não está disponível neste momento.",
        )


def _delete_cart_items(db: Session, cart_id: int) -> None:
    cart_item_ids = [
        cart_log_id
        for (cart_log_id,) in db.query(CarrinhoProduto.cart_log_id)
        .filter(CarrinhoProduto.id_carrinho == cart_id)
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


def _check_stock(produto: Produto, quantidade_pedida: int, quantidade_ja_no_carrinho: int = 0):
    """
    Raises 400 if the requested quantity exceeds available stock.
    quantidade_ja_no_carrinho: how many units are already in the cart (for updates).
    """
    if produto.stock <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"'{produto.nome}' está esgotado."
        )
    if quantidade_pedida < 1:
        raise HTTPException(status_code=400, detail="A quantidade deve ser pelo menos 1.")
    if quantidade_pedida > produto.stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Stock insuficiente para '{produto.nome}'. "
                f"Pedido: {quantidade_pedida}, disponível: {produto.stock}."
            ),
        )


def _format_option_name(option: ProdutoOpcaoCustomizacao) -> str:
    return option.nome.replace("Extra ", "", 1).replace("Substituir por ", "", 1).strip()


def _custom_action_for_option(option_type: str) -> str:
    if option_type in ("EXTRA", "ADICIONAR"):
        return "ADICIONAR_EXTRA"
    return option_type


def _price_legacy_customization(
    db: Session,
    produto: Produto,
    customizacao: ItemCustomization | None,
) -> ItemCustomization | None:
    if not customizacao:
        return None
    has_choices = bool(
        customizacao.remove
        or customizacao.add
        or customizacao.preferences
        or customizacao.note
        or customizacao.ingredientes_removidos
        or customizacao.extras
        or customizacao.substituicoes
    )
    if not has_choices:
        return None

    if customizacao.remove:
        rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingrediente)
            .filter(
                ProdutoIngrediente.id_produto == produto.id_produto,
                ProdutoIngrediente.removivel == 1,
                ProdutoIngrediente.ingrediente.has(tipo="INGREDIENTES_NORMAIS", status=1),
            )
            .all()
        )
        removable_names = {
            row.ingrediente.nome.strip().casefold(): row.ingrediente.nome.strip()
            for row in rows
            if row.ingrediente and row.ingrediente.nome.strip()
        }
        invalid_names = [
            name for name in customizacao.remove
            if name.strip().casefold() not in removable_names
        ]
        if invalid_names:
            raise HTTPException(status_code=400, detail=f"Ingrediente '{invalid_names[0]}' não pode ser removido.")
        customizacao.remove = [
            removable_names[name.strip().casefold()]
            for name in customizacao.remove
            if name.strip().casefold() in removable_names
        ]

    customizacao.preco_unitario_final = (
        discounted_product_price(produto)
        + (CUSTOMIZATION_ADD_SURCHARGE * len(customizacao.add or []))
    )
    return customizacao


def _validate_and_build_customization(
    db: Session,
    produto: Produto,
    body: CustomizedCartItemRequest,
) -> tuple[ItemCustomization, Decimal, list[dict]]:
    if not bool(getattr(produto, "customizavel", 0)):
        raise HTTPException(status_code=400, detail="Este produto não permite customização.")

    ingredient_rows = (
        db.query(ProdutoIngrediente)
        .join(ProdutoIngrediente.ingrediente)
        .filter(ProdutoIngrediente.id_produto == produto.id_produto)
        .all()
    )
    ingredients = {row.id_ingrediente: row for row in ingredient_rows}

    remove_names: list[str] = []
    customization_rows: list[dict] = []
    for ingredient_id in sorted(set(body.ingredientes_removidos)):
        ingredient_row = ingredients.get(ingredient_id)
        if not ingredient_row:
            raise HTTPException(status_code=400, detail=f"Ingrediente {ingredient_id} não pertence ao produto.")
        ingredient_name = ingredient_row.ingrediente.nome if ingredient_row.ingrediente else str(ingredient_id)
        if not ingredient_row.ingrediente or ingredient_row.ingrediente.tipo != "INGREDIENTES_NORMAIS" or not bool(ingredient_row.removivel):
            raise HTTPException(status_code=400, detail=f"Ingrediente '{ingredient_name}' não pode ser removido.")

        remove_names.append(ingredient_name)
        customization_rows.append({
            "id_ingrediente": ingredient_id,
            "id_opcao": None,
            "acao": "REMOVER_INGREDIENTE",
            "quantidade": 1,
            "preco_extra": Decimal("0"),
        })

    option_ids = [extra.id_opcao for extra in body.extras]
    option_ids.extend(
        option.id_opcao
        for substitution in body.substituicoes
        for option in db.query(ProdutoOpcaoCustomizacao).filter(
            ProdutoOpcaoCustomizacao.id_produto == produto.id_produto,
            ProdutoOpcaoCustomizacao.id_ingrediente == substitution.id_ingrediente_novo,
            ProdutoOpcaoCustomizacao.status == 1,
            ProdutoOpcaoCustomizacao.tipo.in_(("SUBSTITUIR_MOLHO", "SUBSTITUIR_ACOMPANHAMENTO")),
            ProdutoOpcaoCustomizacao.ingrediente.has(status=1),
        ).all()
    )
    options = {}
    if option_ids:
        options = {
            option.id_opcao: option
            for option in db.query(ProdutoOpcaoCustomizacao).filter(
                ProdutoOpcaoCustomizacao.id_opcao.in_(option_ids),
                ProdutoOpcaoCustomizacao.id_produto == produto.id_produto,
                ProdutoOpcaoCustomizacao.status == 1,
                or_(
                    ProdutoOpcaoCustomizacao.id_ingrediente.is_(None),
                    ProdutoOpcaoCustomizacao.ingrediente.has(status=1),
                ),
            ).all()
        }

    add_names: list[str] = []
    final_unit_price = discounted_product_price(produto)
    for extra in body.extras:
        option = options.get(extra.id_opcao)
        if not option or option.tipo not in ("EXTRA", "ADICIONAR"):
            raise HTTPException(status_code=400, detail=f"Opção extra {extra.id_opcao} não pertence ao produto.")
        if extra.quantidade > option.max_quantidade:
            raise HTTPException(status_code=400, detail=f"Quantidade máxima para '{option.nome}' é {option.max_quantidade}.")

        extra_total = CUSTOMIZATION_ADD_SURCHARGE * extra.quantidade
        final_unit_price += extra_total
        add_names.append(f"{extra.quantidade}x {_format_option_name(option)}")
        customization_rows.append({
            "id_ingrediente": option.id_ingrediente,
            "id_opcao": option.id_opcao,
            "acao": "ADICIONAR_EXTRA",
            "quantidade": extra.quantidade,
            "preco_extra": CUSTOMIZATION_ADD_SURCHARGE,
        })

    substitution_names: list[str] = []
    seen_originals: set[int] = set()
    for substitution in body.substituicoes:
        original = ingredients.get(substitution.id_ingrediente_original)
        if not original:
            raise HTTPException(status_code=400, detail=f"Ingrediente {substitution.id_ingrediente_original} não pertence ao produto.")
        if not bool(original.substituivel):
            raise HTTPException(status_code=400, detail=f"Ingrediente '{original.ingrediente.nome}' não pode ser substituído.")
        if substitution.id_ingrediente_original in seen_originals:
            raise HTTPException(status_code=400, detail="Cada ingrediente só pode ter uma substituição.")
        seen_originals.add(substitution.id_ingrediente_original)

        replacement = next(
            (
                option for option in options.values()
                if option.id_ingrediente == substitution.id_ingrediente_novo
                and option.tipo in ("SUBSTITUIR_MOLHO", "SUBSTITUIR_ACOMPANHAMENTO")
            ),
            None,
        )
        if not replacement:
            raise HTTPException(status_code=400, detail="Substituição não permitida para este produto.")

        final_unit_price += Decimal(str(replacement.preco_extra))
        substitution_names.append(f"{original.ingrediente.nome} -> {_format_option_name(replacement)}")
        customization_rows.append({
            "id_ingrediente": substitution.id_ingrediente_original,
            "id_opcao": replacement.id_opcao,
            "acao": _custom_action_for_option(replacement.tipo),
            "quantidade": 1,
            "preco_extra": Decimal(str(replacement.preco_extra)),
        })

    customization = ItemCustomization(
        remove=remove_names,
        add=add_names,
        preferences=substitution_names,
        note=body.observacoes,
        ingredientes_removidos=sorted(set(body.ingredientes_removidos)),
        extras=body.extras,
        substituicoes=body.substituicoes,
        preco_unitario_final=final_unit_price,
    )
    return customization, final_unit_price, customization_rows


def _find_cart_line(
    db: Session,
    cart_id: int,
    id_produto: int,
    customizacao_json: str | None,
) -> CarrinhoProduto | None:
    query = db.query(CarrinhoProduto).filter(
        CarrinhoProduto.id_carrinho == cart_id,
        CarrinhoProduto.id_produto == id_produto,
    )

    if customizacao_json is None:
        query = query.filter(CarrinhoProduto.customizacao.is_(None))
    else:
        query = query.filter(CarrinhoProduto.customizacao == customizacao_json)

    return query.first()


def _cart_item_out_from_product(
    produto: Produto,
    quantidade: int,
    unit_price: Decimal,
    customizacao: ItemCustomization,
) -> CarrinhoItemOut:
    imagem = produto.imagens[0].caminho_imagem if produto.imagens else None
    return CarrinhoItemOut(
        cart_log_id=0,
        id_produto=produto.id_produto,
        id_produto_display=format_product_id(produto.id_produto),
        nome=produto.nome,
        preco=unit_price,
        quantidade=quantidade,
        stock=produto.stock,
        caminho_imagem=imagem,
        customizacao=customizacao,
        subtotal=unit_price * quantidade,
    )


def _trusted_guest_customization(
    db: Session,
    produto: Produto,
    quantidade: int,
    customizacao: ItemCustomization | None,
) -> tuple[ItemCustomization | None, list[dict]]:
    if not customizacao:
        return None, []

    has_structured_choices = bool(
        customizacao.ingredientes_removidos
        or customizacao.extras
        or customizacao.substituicoes
    )
    if has_structured_choices:
        body = CustomizedCartItemRequest(
            id_produto=produto.id_produto,
            quantidade=quantidade,
            ingredientes_removidos=customizacao.ingredientes_removidos,
            extras=customizacao.extras,
            substituicoes=customizacao.substituicoes,
            observacoes=customizacao.note,
        )
        trusted, _, customization_rows = _validate_and_build_customization(db, produto, body)
        return trusted, customization_rows

    return _price_legacy_customization(db, produto, ItemCustomization(
        remove=customizacao.remove,
        add=customizacao.add,
        preferences=customizacao.preferences,
        note=customizacao.note,
    )), []


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# GET /cart/  ── view cart
@router.get("/", response_model=CarrinhoOut)
def get_carrinho(
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    # If user is not authenticated, return empty guest cart
    if not current_user:
        return CarrinhoOut(id_carrinho=None, itens=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.id_cliente)
    return _build_cart_out(cart)


# POST /cart/add  ── add or increment item
@router.post("/add", response_model=CarrinhoOut)
def add_item(
    body: AdicionarItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    produto = _get_produto_or_404(db, body.id_produto)
    _ensure_product_orderable(db, produto)
    customizacao = _price_legacy_customization(db, produto, body.customizacao)
    customizacao_json = customization_to_json(customizacao)
    
    # If user is not authenticated, just validate and return empty cart response
    # Frontend will handle localStorage for guest cart
    if not current_user:
        _check_stock(produto, body.quantidade)
        # Return empty guest cart - frontend stores in localStorage
        return CarrinhoOut(id_carrinho=None, itens=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.id_cliente)

    existing = (
        _find_cart_line(db, cart.id_carrinho, body.id_produto, customizacao_json)
    )

    nova_quantidade = (existing.quantidade if existing else 0) + body.quantidade
    _check_stock(produto, nova_quantidade)

    if existing:
        existing.quantidade = nova_quantidade
    else:
        db.add(
            CarrinhoProduto(
                id_carrinho=cart.id_carrinho,
                id_produto=body.id_produto,
                quantidade=body.quantidade,
                customizacao=customizacao_json,
            )
        )

    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


def _add_customized_item_impl(
    body: CustomizedCartItemRequest,
    db: Session,
    current_user: Optional[Cliente],
) -> CarrinhoOut:
    produto = _get_produto_or_404(db, body.id_produto)
    _ensure_product_orderable(db, produto)
    _check_stock(produto, body.quantidade)
    customizacao, unit_price, customization_rows = _validate_and_build_customization(db, produto, body)
    customizacao_json = customization_to_json(customizacao)

    if not current_user:
        return CarrinhoOut(
            id_carrinho=None,
            itens=[_cart_item_out_from_product(produto, body.quantidade, unit_price, customizacao)],
            total=unit_price * body.quantidade,
        )

    cart = _get_or_create_carrinho(db, current_user.id_cliente)
    existing = _find_cart_line(db, cart.id_carrinho, body.id_produto, customizacao_json)
    nova_quantidade = (existing.quantidade if existing else 0) + body.quantidade
    _check_stock(produto, nova_quantidade)

    if existing:
        existing.quantidade = nova_quantidade
    else:
        existing = CarrinhoProduto(
            id_carrinho=cart.id_carrinho,
            id_produto=body.id_produto,
            quantidade=body.quantidade,
            customizacao=customizacao_json,
        )
        db.add(existing)
        db.flush()
        for row in customization_rows:
            db.add(CarrinhoProdutoCustomizacao(
                cart_log_id=existing.cart_log_id,
                id_ingrediente=row["id_ingrediente"],
                id_opcao=row["id_opcao"],
                acao=row["acao"],
                quantidade=row["quantidade"],
                preco_extra=row["preco_extra"],
                notas=body.observacoes,
            ))

    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


@router.post("/itens/customizado", response_model=CarrinhoOut)
@alias_router.post("/itens/customizado", response_model=CarrinhoOut)
def add_customized_item(
    body: CustomizedCartItemRequest,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    return _add_customized_item_impl(body, db, current_user)


# PUT /cart/update  ── set exact quantity for an item
@router.put("/update", response_model=CarrinhoOut)
def update_item(
    body: AtualizarItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    # If user is not authenticated, just validate and return empty cart response
    if not current_user:
        produto = _get_produto_or_404(db, body.id_produto)
        _ensure_product_orderable(db, produto)
        _check_stock(produto, body.quantidade)
        return CarrinhoOut(id_carrinho=None, itens=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.id_cliente)

    if body.cart_log_id is not None:
        item = db.query(CarrinhoProduto).filter(
            CarrinhoProduto.id_carrinho == cart.id_carrinho,
            CarrinhoProduto.cart_log_id == body.cart_log_id,
        ).first()
    else:
        item = (
            db.query(CarrinhoProduto)
            .filter(
                CarrinhoProduto.id_carrinho == cart.id_carrinho,
                CarrinhoProduto.id_produto == body.id_produto,
            )
            .first()
        )

    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no carrinho.")

    produto = _get_produto_or_404(db, item.id_produto)
    _ensure_product_orderable(db, produto)
    _check_stock(produto, body.quantidade)
    item.quantidade = body.quantidade
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# DELETE /cart/remove/{id_produto}  ── remove one item
@router.delete("/remove/{id_produto}", response_model=CarrinhoOut)
def remove_item(
    id_produto: str,
    cart_log_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    parsed_id_produto = parse_product_id(id_produto)
    # If user is not authenticated, just validate product exists
    if not current_user:
        _get_produto_or_404(db, parsed_id_produto)
        return CarrinhoOut(id_carrinho=None, itens=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.id_cliente)

    if cart_log_id is not None:
        item = db.query(CarrinhoProduto).filter(
            CarrinhoProduto.id_carrinho == cart.id_carrinho,
            CarrinhoProduto.cart_log_id == cart_log_id,
        ).first()
    else:
        item = (
            db.query(CarrinhoProduto)
            .filter(
                CarrinhoProduto.id_carrinho == cart.id_carrinho,
                CarrinhoProduto.id_produto == parsed_id_produto,
            )
            .first()
        )

    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no carrinho.")

    db.delete(item)
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# DELETE /cart/clear  ── empty the whole cart
@router.delete("/clear", response_model=CarrinhoOut)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    # If user is not authenticated, just return empty cart
    if not current_user:
        return CarrinhoOut(id_carrinho=None, itens=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.id_cliente)
    _delete_cart_items(db, cart.id_carrinho)
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# POST /cart/merge  ── merge guest localStorage cart after login
@router.post("/merge", response_model=MergeResultado)
def merge_carrinho(
    body: MergeCarrinhoSchema,
    db: Session = Depends(get_db),
    current_user: Cliente = Depends(get_current_user),
):
    """
    Called immediately after login.
    Frontend sends the items it had in localStorage.
    Rules:
      - If item already in DB cart → add quantities, capped at stock.
      - If item not in DB cart → add it, capped at stock.
      - If stock = 0 → skip entirely.
    Returns lists of merged / capped / skipped product ids so the
    frontend can show the user what happened.
    """
    cart = _get_or_create_carrinho(db, current_user.id_cliente)

    merged: List[int] = []
    capped: List[int] = []
    skipped: List[int] = []

    for guest_item in body.itens:
        produto = db.query(Produto).filter(
            Produto.id_produto == guest_item.id_produto,
            Produto.status == 1,
            Produto.deleted_at.is_(None),
        ).first()
        if not produto or produto.stock <= 0 or unavailable_due_to_inactive_base(db, produto):
            skipped.append(guest_item.id_produto)
            continue
        try:
            trusted_customization, customization_rows = _trusted_guest_customization(
                db,
                produto,
                guest_item.quantidade,
                guest_item.customizacao,
            )
        except HTTPException:
            skipped.append(guest_item.id_produto)
            continue

        customizacao_json = customization_to_json(trusted_customization)

        # Product not found or out of stock → skip
        existing = (
            _find_cart_line(db, cart.id_carrinho, guest_item.id_produto, customizacao_json)
        )

        quantidade_atual = existing.quantidade if existing else 0
        quantidade_pretendida = quantidade_atual + guest_item.quantidade

        # Cap to available stock
        if quantidade_pretendida > produto.stock:
            quantidade_final = produto.stock
            capped.append(guest_item.id_produto)
        else:
            quantidade_final = quantidade_pretendida
            merged.append(guest_item.id_produto)

        if existing:
            existing.quantidade = quantidade_final
        else:
            item = CarrinhoProduto(
                id_carrinho=cart.id_carrinho,
                id_produto=guest_item.id_produto,
                quantidade=quantidade_final,
                customizacao=customizacao_json,
            )
            db.add(item)
            db.flush()
            for row in customization_rows:
                db.add(CarrinhoProdutoCustomizacao(
                    cart_log_id=item.cart_log_id,
                    id_ingrediente=row["id_ingrediente"],
                    id_opcao=row["id_opcao"],
                    acao=row["acao"],
                    quantidade=row["quantidade"],
                    preco_extra=row["preco_extra"],
                    notas=trusted_customization.note if trusted_customization else None,
                ))

    db.commit()
    db.refresh(cart)

    return MergeResultado(
        merged=merged,
        capped=capped,
        skipped=skipped,
        carrinho=_build_cart_out(cart),
    )
