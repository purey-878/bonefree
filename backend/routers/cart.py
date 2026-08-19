from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from database import get_db
from enums import CartCustomizationAction, EntityStatus, IngredientType, ProductCustomizationOptionType
from models import (
    Cart,
    CartProduct,
    CartProductCustomization,
    Customer,
    Product,
    ProductIngredient,
    ProductCustomizationOption,
)
from schemas import (
    CartOut,
    CartItemOut,
    AddItemSchema,
    UpdateItemSchema,
    CustomizedCartItemRequest,
    ItemCustomization,
    MergeCartSchema,
    MergeResult,
)
from dependencies import get_current_user, get_current_user_optional
from services.order_customization import customization_from_json, customization_to_json
from services.product_availability import unavailable_due_to_inactive_base
from services.product_pricing import discounted_product_price
from utils.id_format import format_product_id, parse_product_id
from core.errors import AppHTTPException

router = APIRouter(prefix="/cart", tags=["Cart"])
alias_router = APIRouter(prefix="/cart", tags=["Cart"])
CUSTOMIZATION_ADD_SURCHARGE = Decimal("1.00")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _product_image_path(product: Product) -> str | None:
    """Return a frontend asset path for a product image."""
    image_path = None
    if product.images:
        image_path = product.images[0].image_path
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

def _get_or_create_cart(db: Session, customer_id: int) -> Cart:
    """Return the customer's cart, creating one if it doesn't exist yet."""
    cart = db.query(Cart).filter(Cart.customer_id == customer_id).first()
    if not cart:
        cart = Cart(customer_id=customer_id, created_at=datetime.utcnow().date())
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _build_item_out(item: CartProduct) -> CartItemOut:
    """Convert a CartProduct ORM row into the response schema."""
    product = item.product
    image = _product_image_path(product)
    
    customization = customization_from_json(item.customization)
    price = (
        Decimal(str(customization.final_unit_price))
        if customization and customization.final_unit_price is not None
        else discounted_product_price(product)
    )
    quantity = item.quantity
    return CartItemOut(
        cart_product_id=item.cart_product_id,
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product.name,
        price=price,
        quantity=quantity,
        stock=product.stock,
        image_path=image,
        customization=customization,
        subtotal=price * quantity,
    )


def _build_cart_out(cart: Cart) -> CartOut:
    """Convert a Cart ORM object into the full response schema."""
    items = [_build_item_out(i) for i in cart.items]
    total = sum((i.subtotal for i in items), Decimal("0"))
    return CartOut(cart_id=cart.cart_id, items=items, total=total)


def _get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.query(Product).filter(
        and_(Product.product_id == product_id, Product.status == EntityStatus.ACTIVE, Product.deleted_at.is_(None))
    ).first()
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    return product


def _ensure_product_orderable(db: Session, product: Product) -> None:
    if unavailable_due_to_inactive_base(db, product):
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="product_unavailable", message="Product is unavailable.", details={"product_id": product.product_id})


def _delete_cart_items(db: Session, cart_id: int) -> None:
    cart_item_ids = [
        cart_product_id
        for (cart_product_id,) in db.query(CartProduct.cart_product_id)
        .filter(CartProduct.cart_id == cart_id)
        .all()
    ]
    if not cart_item_ids:
        return

    db.query(CartProductCustomization).filter(
        CartProductCustomization.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)
    db.query(CartProduct).filter(
        CartProduct.cart_product_id.in_(cart_item_ids)
    ).delete(synchronize_session=False)


def _check_stock(product: Product, requested_quantity: int, quantity_already_in_cart: int = 0):
    """
    Raises 400 if the requested quantity exceeds available stock.
    quantity_already_in_cart: how many units are already in the cart (for updates).
    """
    if product.stock <= 0:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="product_out_of_stock", message="Product is out of stock.", details={"product_id": product.product_id, "stock": product.stock})
    if requested_quantity < 1:
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_quantity", message="Quantity must be at least 1.", details={"product_id": product.product_id, "quantity": requested_quantity})
    if requested_quantity > product.stock:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="insufficient_stock",
            message="Insufficient product stock.",
            details={
                "product_id": product.product_id,
                "product_name": product.name,
                "requested_quantity": requested_quantity,
                "stock": product.stock,
                "quantity_already_in_cart": quantity_already_in_cart,
            },
        )


def _format_option_name(option: ProductCustomizationOption) -> str:
    return option.name.replace("Extra ", "", 1).replace("Substituir por ", "", 1).strip()


def _custom_action_for_option(option_type: ProductCustomizationOptionType) -> CartCustomizationAction:
    if option_type in (ProductCustomizationOptionType.EXTRA, ProductCustomizationOptionType.ADD):
        return CartCustomizationAction.ADD_EXTRA
    if option_type == ProductCustomizationOptionType.SUBSTITUTE_SAUCE:
        return CartCustomizationAction.SUBSTITUTE_SAUCE
    return CartCustomizationAction.SUBSTITUTE_SIDE


def _price_legacy_customization(
    db: Session,
    product: Product,
    customization: ItemCustomization | None,
) -> ItemCustomization | None:
    if not customization:
        return None
    has_choices = bool(
        customization.remove
        or customization.add
        or customization.preferences
        or customization.note
        or customization.removed_ingredients
        or customization.extras
        or customization.substitutions
    )
    if not has_choices:
        return None

    if customization.remove:
        rows = (
            db.query(ProductIngredient)
            .join(ProductIngredient.ingredient)
            .filter(
                ProductIngredient.product_id == product.product_id,
                ProductIngredient.removable == 1,
                ProductIngredient.ingredient.has(type=IngredientType.NORMAL, status=EntityStatus.ACTIVE),
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
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_customization_ingredient", message="One or more removed ingredients are invalid.", details={"product_id": product.product_id, "invalid_ingredients": invalid_names})
        customization.remove = [
            removable_names[name.strip().casefold()]
            for name in customization.remove
            if name.strip().casefold() in removable_names
        ]

    customization.final_unit_price = (
        discounted_product_price(product)
        + (CUSTOMIZATION_ADD_SURCHARGE * len(customization.add or []))
    )
    return customization


def _validate_and_build_customization(
    db: Session,
    product: Product,
    body: CustomizedCartItemRequest,
) -> tuple[ItemCustomization, Decimal, list[dict]]:
    if not bool(getattr(product, "customizable", 0)):
        raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="product_not_customizable", message="Product cannot be customized.", details={"product_id": product.product_id})

    ingredient_rows = (
        db.query(ProductIngredient)
        .join(ProductIngredient.ingredient)
        .filter(ProductIngredient.product_id == product.product_id)
        .all()
    )
    ingredients = {row.ingredient_id: row for row in ingredient_rows}

    remove_names: list[str] = []
    customization_rows: list[dict] = []
    for ingredient_id in sorted(set(body.removed_ingredients)):
        ingredient_row = ingredients.get(ingredient_id)
        if not ingredient_row:
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="ingredient_not_in_product", message="Ingredient does not belong to this product.", details={"product_id": product.product_id, "ingredient_id": ingredient_id})
        ingredient_name = ingredient_row.ingredient.name if ingredient_row.ingredient else str(ingredient_id)
        if not ingredient_row.ingredient or ingredient_row.ingredient.type != IngredientType.NORMAL or not bool(ingredient_row.removable):
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="ingredient_not_removable", message="Ingredient cannot be removed from this product.", details={"product_id": product.product_id, "ingredient_id": ingredient_id})

        remove_names.append(ingredient_name)
        customization_rows.append({
            "ingredient_id": ingredient_id,
            "option_id": None,
            "action": CartCustomizationAction.REMOVE_INGREDIENT,
            "quantity": 1,
            "extra_price": Decimal("0"),
        })

    option_ids = [extra.option_id for extra in body.extras]
    option_ids.extend(
        option.option_id
        for substitution in body.substitutions
        for option in db.query(ProductCustomizationOption).filter(
            ProductCustomizationOption.product_id == product.product_id,
            ProductCustomizationOption.ingredient_id == substitution.new_ingredient_id,
            ProductCustomizationOption.status == EntityStatus.ACTIVE,
            ProductCustomizationOption.type.in_(
                (
                    ProductCustomizationOptionType.SUBSTITUTE_SAUCE,
                    ProductCustomizationOptionType.SUBSTITUTE_SIDE,
                )
            ),
            ProductCustomizationOption.ingredient.has(status=EntityStatus.ACTIVE),
        ).all()
    )
    options = {}
    if option_ids:
        options = {
            option.option_id: option
            for option in db.query(ProductCustomizationOption).filter(
                ProductCustomizationOption.option_id.in_(option_ids),
                ProductCustomizationOption.product_id == product.product_id,
                ProductCustomizationOption.status == EntityStatus.ACTIVE,
                or_(
                    ProductCustomizationOption.ingredient_id.is_(None),
                    ProductCustomizationOption.ingredient.has(status=EntityStatus.ACTIVE),
                ),
            ).all()
        }

    add_names: list[str] = []
    final_unit_price = discounted_product_price(product)
    for extra in body.extras:
        option = options.get(extra.option_id)
        if not option or option.type not in (ProductCustomizationOptionType.EXTRA, ProductCustomizationOptionType.ADD):
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_customization_option", message="Customization option is invalid for this product.", details={"product_id": product.product_id, "option_id": extra.option_id})
        if extra.quantity > option.max_quantity:
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="customization_quantity_exceeded", message="Customization option quantity exceeds the maximum allowed.", details={"product_id": product.product_id, "option_id": extra.option_id, "quantity": extra.quantity, "max_quantity": option.max_quantity})

        extra_total = CUSTOMIZATION_ADD_SURCHARGE * extra.quantity
        final_unit_price += extra_total
        add_names.append(f"{extra.quantity}x {_format_option_name(option)}")
        customization_rows.append({
            "ingredient_id": option.ingredient_id,
            "option_id": option.option_id,
            "action": CartCustomizationAction.ADD_EXTRA,
            "quantity": extra.quantity,
            "extra_price": CUSTOMIZATION_ADD_SURCHARGE,
        })

    substitution_names: list[str] = []
    seen_originals: set[int] = set()
    for substitution in body.substitutions:
        original = ingredients.get(substitution.original_ingredient_id)
        if not original:
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="ingredient_not_in_product", message="Ingredient does not belong to this product.", details={"product_id": product.product_id, "ingredient_id": substitution.original_ingredient_id})
        if not bool(original.substitutable):
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="ingredient_not_substitutable", message="Ingredient cannot be substituted.", details={"product_id": product.product_id, "ingredient_id": substitution.original_ingredient_id})
        if substitution.original_ingredient_id in seen_originals:
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="duplicate_substitution", message="Ingredient can only be substituted once.", details={"product_id": product.product_id, "ingredient_id": substitution.original_ingredient_id})
        seen_originals.add(substitution.original_ingredient_id)

        replacement = next(
            (
                option for option in options.values()
                if option.ingredient_id == substitution.new_ingredient_id
                and option.type
                in (
                    ProductCustomizationOptionType.SUBSTITUTE_SAUCE,
                    ProductCustomizationOptionType.SUBSTITUTE_SIDE,
                )
            ),
            None,
        )
        if not replacement:
            raise AppHTTPException(status_code=status.HTTP_400_BAD_REQUEST, error="invalid_substitution_option", message="Replacement option is invalid for this ingredient.", details={"product_id": product.product_id, "ingredient_id": substitution.original_ingredient_id, "new_ingredient_id": substitution.new_ingredient_id})

        final_unit_price += Decimal(str(replacement.extra_price))
        substitution_names.append(f"{original.ingredient.name} -> {_format_option_name(replacement)}")
        customization_rows.append({
            "ingredient_id": substitution.original_ingredient_id,
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
        removed_ingredients=sorted(set(body.removed_ingredients)),
        extras=body.extras,
        substitutions=body.substitutions,
        final_unit_price=final_unit_price,
    )
    return customization, final_unit_price, customization_rows


def _find_cart_line(
    db: Session,
    cart_id: int,
    product_id: int,
    customization_json: str | None,
) -> CartProduct | None:
    query = db.query(CartProduct).filter(
        CartProduct.cart_id == cart_id,
        CartProduct.product_id == product_id,
    )

    if customization_json is None:
        query = query.filter(CartProduct.customization.is_(None))
    else:
        query = query.filter(CartProduct.customization == customization_json)

    return query.first()


def _cart_item_out_from_product(
    product: Product,
    quantity: int,
    unit_price: Decimal,
    customization: ItemCustomization,
) -> CartItemOut:
    image = _product_image_path(product)
    return CartItemOut(
        cart_product_id=0,
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
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
    product: Product,
    quantity: int,
    customization: ItemCustomization | None,
) -> tuple[ItemCustomization | None, list[dict]]:
    if not customization:
        return None, []

    has_structured_choices = bool(
        customization.removed_ingredients
        or customization.extras
        or customization.substitutions
    )
    if has_structured_choices:
        body = CustomizedCartItemRequest(
            product_id=product.product_id,
            quantity=quantity,
            removed_ingredients=customization.removed_ingredients,
            extras=customization.extras,
            substitutions=customization.substitutions,
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
@router.get("/", response_model=CartOut)
def get_cart(
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    # If user is not authenticated, return empty guest cart
    if not current_user:
        return CartOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_cart(db, current_user.customer_id)
    return _build_cart_out(cart)


# POST /cart/add  ── add or increment item
@router.post("/add", response_model=CartOut)
def add_item(
    body: AddItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    product = _get_product_or_404(db, body.product_id)
    _ensure_product_orderable(db, product)
    customization = _price_legacy_customization(db, product, body.customization)
    customization_json = customization_to_json(customization)
    
    # If user is not authenticated, just validate and return empty cart response
    # Frontend will handle localStorage for guest cart
    if not current_user:
        _check_stock(product, body.quantity)
        # Return empty guest cart - frontend stores in localStorage
        return CartOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_cart(db, current_user.customer_id)

    existing = (
        _find_cart_line(db, cart.cart_id, body.product_id, customization_json)
    )

    new_quantity = (existing.quantity if existing else 0) + body.quantity
    _check_stock(product, new_quantity)

    if existing:
        existing.quantity = new_quantity
    else:
        db.add(
            CartProduct(
                cart_id=cart.cart_id,
                product_id=body.product_id,
                quantity=body.quantity,
                customization=customization_json,
            )
        )

    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


def _add_customized_item_impl(
    body: CustomizedCartItemRequest,
    db: Session,
    current_user: Optional[Customer],
) -> CartOut:
    product = _get_product_or_404(db, body.product_id)
    _ensure_product_orderable(db, product)
    _check_stock(product, body.quantity)
    customization, unit_price, customization_rows = _validate_and_build_customization(db, product, body)
    customization_json = customization_to_json(customization)

    if not current_user:
        return CartOut(
            cart_id=None,
            items=[_cart_item_out_from_product(product, body.quantity, unit_price, customization)],
            total=unit_price * body.quantity,
        )

    cart = _get_or_create_cart(db, current_user.customer_id)
    existing = _find_cart_line(db, cart.cart_id, body.product_id, customization_json)
    new_quantity = (existing.quantity if existing else 0) + body.quantity
    _check_stock(product, new_quantity)

    if existing:
        existing.quantity = new_quantity
    else:
        existing = CartProduct(
            cart_id=cart.cart_id,
            product_id=body.product_id,
            quantity=body.quantity,
            customization=customization_json,
        )
        db.add(existing)
        db.flush()
        for row in customization_rows:
            db.add(CartProductCustomization(
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


@router.post("/items/customizado", response_model=CartOut)
@alias_router.post("/items/customizado", response_model=CartOut)
def add_customized_item(
    body: CustomizedCartItemRequest,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    return _add_customized_item_impl(body, db, current_user)


# PUT /cart/update  ── set exact quantity for an item
@router.put("/update", response_model=CartOut)
def update_item(
    body: UpdateItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    # If user is not authenticated, just validate and return empty cart response
    if not current_user:
        product = _get_product_or_404(db, body.product_id)
        _ensure_product_orderable(db, product)
        _check_stock(product, body.quantity)
        return CartOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_cart(db, current_user.customer_id)

    if body.cart_product_id is not None:
        item = db.query(CartProduct).filter(
            CartProduct.cart_id == cart.cart_id,
            CartProduct.cart_product_id == body.cart_product_id,
        ).first()
    else:
        item = (
            db.query(CartProduct)
            .filter(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.product_id == body.product_id,
            )
            .first()
        )

    if not item:
        raise AppHTTPException(status_code=404, error="cart_item_not_found", message="Cart item not found.", details={"reason": "request_failed"})

    product = _get_product_or_404(db, item.product_id)
    _ensure_product_orderable(db, product)
    _check_stock(product, body.quantity)
    item.quantity = body.quantity
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# DELETE /cart/remove/{product_id}  ── remove one item
@router.delete("/remove/{product_id}", response_model=CartOut)
def remove_item(
    product_id: str,
    cart_product_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    parsed_product_id = parse_product_id(product_id)
    # If user is not authenticated, just validate product exists
    if not current_user:
        _get_product_or_404(db, parsed_product_id)
        return CartOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_cart(db, current_user.customer_id)

    if cart_product_id is not None:
        item = db.query(CartProduct).filter(
            CartProduct.cart_id == cart.cart_id,
            CartProduct.cart_product_id == cart_product_id,
        ).first()
    else:
        item = (
            db.query(CartProduct)
            .filter(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.product_id == parsed_product_id,
            )
            .first()
        )

    if not item:
        raise AppHTTPException(status_code=404, error="cart_item_not_found", message="Cart item not found.", details={"reason": "request_failed"})

    db.delete(item)
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# DELETE /cart/clear  ── empty the whole cart
@router.delete("/clear", response_model=CartOut)
def clear_cart(
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    # If user is not authenticated, just return empty cart
    if not current_user:
        return CartOut(cart_id=None, items=[], total=Decimal("0"))
    
    cart = _get_or_create_cart(db, current_user.customer_id)
    _delete_cart_items(db, cart.cart_id)
    db.commit()
    db.refresh(cart)
    return _build_cart_out(cart)


# POST /cart/merge  ── merge guest localStorage cart after login
@router.post("/merge", response_model=MergeResult)
def merge_cart(
    body: MergeCartSchema,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
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
    cart = _get_or_create_cart(db, current_user.customer_id)

    merged: List[int] = []
    capped: List[int] = []
    skipped: List[int] = []

    for guest_item in body.items:
        product = db.query(Product).filter(
            Product.product_id == guest_item.product_id,
            Product.status == EntityStatus.ACTIVE,
            Product.deleted_at.is_(None),
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
        except AppHTTPException:
            skipped.append(guest_item.product_id)
            continue

        customization_json = customization_to_json(trusted_customization)

        # Product not found or out of stock → skip
        existing = (
            _find_cart_line(db, cart.cart_id, guest_item.product_id, customization_json)
        )

        current_quantity = existing.quantity if existing else 0
        intended_quantity = current_quantity + guest_item.quantity

        # Cap to available stock
        if intended_quantity > product.stock:
            final_quantity = product.stock
            capped.append(guest_item.product_id)
        else:
            final_quantity = intended_quantity
            merged.append(guest_item.product_id)

        if existing:
            existing.quantity = final_quantity
        else:
            item = CartProduct(
                cart_id=cart.cart_id,
                product_id=guest_item.product_id,
                quantity=final_quantity,
                customization=customization_json,
            )
            db.add(item)
            db.flush()
            for row in customization_rows:
                db.add(CartProductCustomization(
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

    return MergeResult(
        merged=merged,
        capped=capped,
        skipped=skipped,
        cart=_build_cart_out(cart),
    )
