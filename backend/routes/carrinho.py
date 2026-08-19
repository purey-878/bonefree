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
alias_router = APIRouter(prefix="/cart", tags=["Carrinho"])
CUSTOMIZATION_ADD_SURCHARGE = Decimal("1.00")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _product_image_path(product: Produto) -> str | None:
    """Return a frontend asset path for a product image."""
    image_path = None
    if product.imagens:
        image_path = product.imagens[0].image_path
    elif product.image:
        image_path = product.image

    if image_path:
        if image_path.startswith(("http://", "https://", "/assets/", "/uploads/", "/menu-images/")):
            return image_path
        if image_path.startswith("menu-images/"):
            return f"/{image_path}"
        return f"/menu-images/{image_path}"

    if product.name:
        filename = product.name.lower().replace(' ', '').replace('ã', 'a').replace('é', 'e').replace('ç', 'c')
        filename = ''.join(c for c in filename if c.isalnum())
        return f"/menu-images/{filename}.webp"

    return None

def _get_or_create_carrinho(db: Session, customer_id: int) -> Carrinho:
    """Return the customer's cart, creating one if it doesn't exist yet."""
    cart = db.query(Carrinho).filter(Carrinho.customer_id == customer_id).first()
    if not cart:
        cart = Carrinho(customer_id=customer_id, created_at=datetime.utcnow().date())
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _build_item_out(item: CarrinhoProduto) -> CarrinhoItemOut:
    """Convert a CarrinhoProduto ORM row into the response schema."""
    product = item.product
    image = _product_image_path(product)
    
    customization = customization_from_json(item.customization)
    price = (
        Decimal(str(customization.preco_unitario_final))
        if customization and customization.preco_unitario_final is not None
        else discounted_product_price(product)
    )
    quantity = item.quantity
    return CarrinhoItemOut(
        cart_product_id=item.cart_product_id,
        product_id=product.product_id,
        id_produto_display=format_product_id(product.product_id),
        name=product.name,
        price=price,
        quantity=quantity,
        stock=product.stock,
        image_path=image,
        customization=customization,
        subtotal=price * quantity,
    )


def _build_cart_out(cart: Carrinho) -> CarrinhoOut:
    """Convert a Carrinho ORM object into the full response schema."""
    items = [_build_item_out(i) for i in cart.items]
    total = sum(i.subtotal for i in items)
    return CarrinhoOut(cart_id=cart.cart_id, items=items, total=total)


def _get_produto_or_404(db: Session, product_id: int) -> Produto:
    product = db.query(Produto).filter(
        and_(Produto.product_id == product_id, Produto.status == 1, Produto.deleted_at.is_(None))
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"Produto '{format_product_id(product_id)}' não encontrado.")
    return product


def _ensure_product_orderable(db: Session, product: Produto) -> None:
    if unavailable_due_to_inactive_base(db, product):
        raise HTTPException(
            status_code=400,
            detail=f"'{product.name}' não está disponível neste momento.",
        )


def _delete_cart_items(db: Session, cart_id: int) -> None:
    cart_item_ids = [
        cart_product_id
        for (cart_product_id,) in db.query(CarrinhoProduto.cart_product_id)
        .filter(CarrinhoProduto.cart_id == cart_id)
        .all()
    ]
    if not cart_item_ids:
        return

    db.query(CarrinhoProdutoCustomizacao).filter(
        CarrinhoProdutoCustomizacao.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)
    db.query(CarrinhoProduto).filter(
        CarrinhoProduto.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)


def _check_stock(product: Produto, quantidade_pedida: int, quantidade_ja_no_carrinho: int = 0):
    """
    Raises 400 if the requested quantity exceeds available stock.
    quantidade_ja_no_carrinho: how many units are already in the cart (for updates).
    """
    if product.stock <= 0:
        raise HTTPException(
            status_code=400,
            detail=f"'{product.name}' está esgotado."
        )
    if quantidade_pedida < 1:
        raise HTTPException(status_code=400, detail="A quantity deve ser pelo menos 1.")
    if quantidade_pedida > product.stock:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Stock insuficiente para '{product.name}'. "
                f"Pedido: {quantidade_pedida}, disponível: {product.stock}."
            ),
        )


def _format_option_name(option: ProdutoOpcaoCustomizacao) -> str:
    return option.name.replace("Extra ", "", 1).replace("Substituir por ", "", 1).strip()


def _custom_action_for_option(option_type: str) -> str:
    if option_type in ("EXTRA", "ADICIONAR"):
        return "ADICIONAR_EXTRA"
    return option_type


def _price_legacy_customization(
    db: Session,
    product: Produto,
    customization: ItemCustomization | None,
) -> ItemCustomization | None:
    if not customization:
        return None
    has_choices = bool(
        customization.remove
        or customization.add
        or customization.preferences
        or customization.note
        or customization.ingredientes_removidos
        or customization.extras
        or customization.substituicoes
    )
    if not has_choices:
        return None

    if customization.remove:
        rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingredient)
            .filter(
                ProdutoIngrediente.product_id == product.product_id,
                ProdutoIngrediente.removable == 1,
                ProdutoIngrediente.ingredient.has(type="INGREDIENTES_NORMAIS", status=1),
            )
            .all()
        )
        removable_names = {
            row.ingredient.name.strip().casefold(): row.ingredient.name.strip()
            for row in rows
            if row.ingredient and row.ingredient.name.strip()
        }
        invalid_names = [
            name for name in customization.remove
            if name.strip().casefold() not in removable_names
        ]
        if invalid_names:
            raise HTTPException(status_code=400, detail=f"Ingrediente '{invalid_names[0]}' não pode ser removido.")
        customization.remove = [
            removable_names[name.strip().casefold()]
            for name in customization.remove
            if name.strip().casefold() in removable_names
        ]

    customization.preco_unitario_final = (
        discounted_product_price(product)
        + (CUSTOMIZATION_ADD_SURCHARGE * len(customization.add or []))
    )
    return customization


def _validate_and_build_customization(
    db: Session,
    product: Produto,
    body: CustomizedCartItemRequest,
) -> tuple[ItemCustomization, Decimal, list[dict]]:
    if not bool(getattr(product, "customizable", 0)):
        raise HTTPException(status_code=400, detail="Este product não permite customização.")

    ingredient_rows = (
        db.query(ProdutoIngrediente)
        .join(ProdutoIngrediente.ingredient)
        .filter(ProdutoIngrediente.product_id == product.product_id)
        .all()
    )
    ingredients = {row.ingredient_id: row for row in ingredient_rows}

    remove_names: list[str] = []
    customization_rows: list[dict] = []
    for ingredient_id in sorted(set(body.ingredientes_removidos)):
        ingredient_row = ingredients.get(ingredient_id)
        if not ingredient_row:
            raise HTTPException(status_code=400, detail=f"Ingrediente {ingredient_id} não pertence ao product.")
        ingredient_name = ingredient_row.ingredient.name if ingredient_row.ingredient else str(ingredient_id)
        if not ingredient_row.ingredient or ingredient_row.ingredient.type != "INGREDIENTES_NORMAIS" or not bool(ingredient_row.removable):
            raise HTTPException(status_code=400, detail=f"Ingrediente '{ingredient_name}' não pode ser removido.")

        remove_names.append(ingredient_name)
        customization_rows.append({
            "ingredient_id": ingredient_id,
            "option_id": None,
            "action": "REMOVER_INGREDIENTE",
            "quantity": 1,
            "extra_price": Decimal("0"),
        })

    option_ids = [extra.option_id for extra in body.extras]
    option_ids.extend(
        option.option_id
        for substitution in body.substituicoes
        for option in db.query(ProdutoOpcaoCustomizacao).filter(
            ProdutoOpcaoCustomizacao.product_id == product.product_id,
            ProdutoOpcaoCustomizacao.ingredient_id == substitution.id_ingrediente_novo,
            ProdutoOpcaoCustomizacao.status == 1,
            ProdutoOpcaoCustomizacao.type.in_(("SUBSTITUIR_MOLHO", "SUBSTITUIR_ACOMPANHAMENTO")),
            ProdutoOpcaoCustomizacao.ingredient.has(status=1),
        ).all()
    )
    options = {}
    if option_ids:
        options = {
            option.option_id: option
            for option in db.query(ProdutoOpcaoCustomizacao).filter(
                ProdutoOpcaoCustomizacao.option_id.in_(option_ids),
                ProdutoOpcaoCustomizacao.product_id == product.product_id,
                ProdutoOpcaoCustomizacao.status == 1,
                or_(
                    ProdutoOpcaoCustomizacao.ingredient_id.is_(None),
                    ProdutoOpcaoCustomizacao.ingredient.has(status=1),
                ),
            ).all()
        }

    add_names: list[str] = []
    final_unit_price = discounted_product_price(product)
    for extra in body.extras:
        option = options.get(extra.option_id)
        if not option or option.type not in ("EXTRA", "ADICIONAR"):
            raise HTTPException(status_code=400, detail=f"Opção extra {extra.option_id} não pertence ao product.")
        if extra.quantity > option.max_quantity:
            raise HTTPException(status_code=400, detail=f"Quantidade máxima para '{option.name}' é {option.max_quantity}.")

        extra_total = CUSTOMIZATION_ADD_SURCHARGE * extra.quantity
        final_unit_price += extra_total
        add_names.append(f"{extra.quantity}x {_format_option_name(option)}")
        customization_rows.append({
            "ingredient_id": option.ingredient_id,
            "option_id": option.option_id,
            "action": "ADICIONAR_EXTRA",
            "quantity": extra.quantity,
            "extra_price": CUSTOMIZATION_ADD_SURCHARGE,
        })

    substitution_names: list[str] = []
    seen_originals: set[int] = set()
    for substitution in body.substituicoes:
        original = ingredients.get(substitution.id_ingrediente_original)
        if not original:
            raise HTTPException(status_code=400, detail=f"Ingrediente {substitution.id_ingrediente_original} não pertence ao product.")
        if not bool(original.substitutable):
            raise HTTPException(status_code=400, detail=f"Ingrediente '{original.ingredient.name}' não pode ser substituído.")
        if substitution.id_ingrediente_original in seen_originals:
            raise HTTPException(status_code=400, detail="Cada ingredient só pode ter uma substituição.")
        seen_originals.add(substitution.id_ingrediente_original)

        replacement = next(
            (
                option for option in options.values()
                if option.ingredient_id == substitution.id_ingrediente_novo
                and option.type in ("SUBSTITUIR_MOLHO", "SUBSTITUIR_ACOMPANHAMENTO")
            ),
            None,
        )
        if not replacement:
            raise HTTPException(status_code=400, detail="Substituição não permitida para este product.")

        final_unit_price += Decimal(str(replacement.extra_price))
        substitution_names.append(f"{original.ingredient.name} -> {_format_option_name(replacement)}")
        customization_rows.append({
            "ingredient_id": substitution.id_ingrediente_original,
            "option_id": replacement.option_id,
            "action": _custom_action_for_option(replacement.type),
            "quantity": 1,
            "extra_price": Decimal(str(replacement.extra_price)),
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
    product_id: int,
    customizacao_json: str | None,
) -> CarrinhoProduto | None:
    query = db.query(CarrinhoProduto).filter(
        CarrinhoProduto.cart_id == cart_id,
        CarrinhoProduto.product_id == product_id,
    )

    if customizacao_json is None:
        query = query.filter(CarrinhoProduto.customization.is_(None))
    else:
        query = query.filter(CarrinhoProduto.customization == customizacao_json)

    return query.first()


def _cart_item_out_from_product(
    product: Produto,
    quantity: int,
    unit_price: Decimal,
    customization: ItemCustomization,
) -> CarrinhoItemOut:
    image = _product_image_path(product)
    return CarrinhoItemOut(
        cart_product_id=0,
        product_id=product.product_id,
        id_produto_display=format_product_id(product.product_id),
        name=product.name,
        price=unit_price,
        quantity=quantity,
        stock=product.stock,
        image_path=image,
        customization=customization,
        subtotal=unit_price * quantity,
    )


def _trusted_guest_customization(
    db: Session,
    product: Produto,
    quantity: int,
    customization: ItemCustomization | None,
) -> tuple[ItemCustomization | None, list[dict]]:
    if not customization:
        return None, []

    has_structured_choices = bool(
        customization.ingredientes_removidos
        or customization.extras
        or customization.substituicoes
    )
    if has_structured_choices:
        body = CustomizedCartItemRequest(
            product_id=product.product_id,
            quantity=quantity,
            ingredientes_removidos=customization.ingredientes_removidos,
            extras=customization.extras,
            substituicoes=customization.substituicoes,
            observacoes=customization.note,
        )
        trusted, _, customization_rows = _validate_and_build_customization(db, product, body)
        return trusted, customization_rows

    return _price_legacy_customization(db, product, ItemCustomization(
        remove=customization.remove,
        add=customization.add,
        preferences=customization.preferences,
        note=customization.note,
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
        return CarrinhoOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.customer_id)
    return _build_cart_out(cart)


# POST /cart/add  ── add or increment item
@router.post("/add", response_model=CarrinhoOut)
def add_item(
    body: AdicionarItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    product = _get_produto_or_404(db, body.product_id)
    _ensure_product_orderable(db, product)
    customization = _price_legacy_customization(db, product, body.customization)
    customizacao_json = customization_to_json(customization)
    
    # If user is not authenticated, just validate and return empty cart response
    # Frontend will handle localStorage for guest cart
    if not current_user:
        _check_stock(product, body.quantity)
        # Return empty guest cart - frontend stores in localStorage
        return CarrinhoOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.customer_id)

    existing = (
        _find_cart_line(db, cart.cart_id, body.product_id, customizacao_json)
    )

    nova_quantidade = (existing.quantity if existing else 0) + body.quantity
    _check_stock(product, nova_quantidade)

    if existing:
        existing.quantity = nova_quantidade
    else:
        db.add(
            CarrinhoProduto(
                cart_id=cart.cart_id,
                product_id=body.product_id,
                quantity=body.quantity,
                customization=customizacao_json,
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
    product = _get_produto_or_404(db, body.product_id)
    _ensure_product_orderable(db, product)
    _check_stock(product, body.quantity)
    customization, unit_price, customization_rows = _validate_and_build_customization(db, product, body)
    customizacao_json = customization_to_json(customization)

    if not current_user:
        return CarrinhoOut(
            cart_id=None,
            items=[_cart_item_out_from_product(product, body.quantity, unit_price, customization)],
            total=unit_price * body.quantity,
        )

    cart = _get_or_create_carrinho(db, current_user.customer_id)
    existing = _find_cart_line(db, cart.cart_id, body.product_id, customizacao_json)
    nova_quantidade = (existing.quantity if existing else 0) + body.quantity
    _check_stock(product, nova_quantidade)

    if existing:
        existing.quantity = nova_quantidade
    else:
        existing = CarrinhoProduto(
            cart_id=cart.cart_id,
            product_id=body.product_id,
            quantity=body.quantity,
            customization=customizacao_json,
        )
        db.add(existing)
        db.flush()
        for row in customization_rows:
            db.add(CarrinhoProdutoCustomizacao(
                cart_product_id=existing.cart_product_id,
                ingredient_id=row["ingredient_id"],
                option_id=row["option_id"],
                action=row["action"],
                quantity=row["quantity"],
                extra_price=row["extra_price"],
                notes=body.observacoes,
            ))

    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


@router.post("/items/customizado", response_model=CarrinhoOut)
@alias_router.post("/items/customizado", response_model=CarrinhoOut)
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
        product = _get_produto_or_404(db, body.product_id)
        _ensure_product_orderable(db, product)
        _check_stock(product, body.quantity)
        return CarrinhoOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.customer_id)

    if body.cart_product_id is not None:
        item = db.query(CarrinhoProduto).filter(
            CarrinhoProduto.cart_id == cart.cart_id,
            CarrinhoProduto.cart_product_id == body.cart_product_id,
        ).first()
    else:
        item = (
            db.query(CarrinhoProduto)
            .filter(
                CarrinhoProduto.cart_id == cart.cart_id,
                CarrinhoProduto.product_id == body.product_id,
            )
            .first()
        )

    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no cart.")

    product = _get_produto_or_404(db, item.product_id)
    _ensure_product_orderable(db, product)
    _check_stock(product, body.quantity)
    item.quantity = body.quantity
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# DELETE /cart/remove/{product_id}  ── remove one item
@router.delete("/remove/{product_id}", response_model=CarrinhoOut)
def remove_item(
    product_id: str,
    cart_product_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[Cliente] = Depends(get_current_user_optional),
):
    parsed_id_produto = parse_product_id(product_id)
    # If user is not authenticated, just validate product exists
    if not current_user:
        _get_produto_or_404(db, parsed_id_produto)
        return CarrinhoOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.customer_id)

    if cart_product_id is not None:
        item = db.query(CarrinhoProduto).filter(
            CarrinhoProduto.cart_id == cart.cart_id,
            CarrinhoProduto.cart_product_id == cart_product_id,
        ).first()
    else:
        item = (
            db.query(CarrinhoProduto)
            .filter(
                CarrinhoProduto.cart_id == cart.cart_id,
                CarrinhoProduto.product_id == parsed_id_produto,
            )
            .first()
        )

    if not item:
        raise HTTPException(status_code=404, detail="Item não encontrado no cart.")

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
        return CarrinhoOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_carrinho(db, current_user.customer_id)
    _delete_cart_items(db, cart.cart_id)
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
    cart = _get_or_create_carrinho(db, current_user.customer_id)

    merged: List[int] = []
    capped: List[int] = []
    skipped: List[int] = []

    for guest_item in body.items:
        product = db.query(Produto).filter(
            Produto.product_id == guest_item.product_id,
            Produto.status == 1,
            Produto.deleted_at.is_(None),
        ).first()
        if not product or product.stock <= 0 or unavailable_due_to_inactive_base(db, product):
            skipped.append(guest_item.product_id)
            continue
        try:
            trusted_customization, customization_rows = _trusted_guest_customization(
                db,
                product,
                guest_item.quantity,
                guest_item.customization,
            )
        except HTTPException:
            skipped.append(guest_item.product_id)
            continue

        customizacao_json = customization_to_json(trusted_customization)

        # Product not found or out of stock → skip
        existing = (
            _find_cart_line(db, cart.cart_id, guest_item.product_id, customizacao_json)
        )

        quantidade_atual = existing.quantity if existing else 0
        quantidade_pretendida = quantidade_atual + guest_item.quantity

        # Cap to available stock
        if quantidade_pretendida > product.stock:
            quantidade_final = product.stock
            capped.append(guest_item.product_id)
        else:
            quantidade_final = quantidade_pretendida
            merged.append(guest_item.product_id)

        if existing:
            existing.quantity = quantidade_final
        else:
            item = CarrinhoProduto(
                cart_id=cart.cart_id,
                product_id=guest_item.product_id,
                quantity=quantidade_final,
                customization=customizacao_json,
            )
            db.add(item)
            db.flush()
            for row in customization_rows:
                db.add(CarrinhoProdutoCustomizacao(
                    cart_product_id=item.cart_product_id,
                    ingredient_id=row["ingredient_id"],
                    option_id=row["option_id"],
                    action=row["action"],
                    quantity=row["quantity"],
                    extra_price=row["extra_price"],
                    notes=trusted_customization.note if trusted_customization else None,
                ))

    db.commit()
    db.refresh(cart)

    return MergeResultado(
        merged=merged,
        capped=capped,
        skipped=skipped,
        cart=_build_cart_out(cart),
    )
