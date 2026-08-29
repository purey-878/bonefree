from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import and_, delete, or_, select
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from database import get_db
from schemas.enums import CartCustomizationAction, EntityStatus, IngredientType, ProductCustomizationOptionType
from models import (
    Cart,
    CartProduct,
    CartProductCustomization,
    Customer,
    Ingredient,
    Media,
    Product,
    ProductIngredient,
    ProductCustomizationOption,
    ProductMedia,
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
from services.product_availability import (
    effective_product_available,
    product_unavailable_reason,
    unavailable_base_product_ids,
)
from services.product_pricing import discounted_product_price
from services.product_media import primary_product_media_response
from utils.id_format import format_product_id, parse_product_id
from core.errors import AppHTTPException

router = APIRouter(prefix="/cart", tags=["Cart"])
CUSTOMIZATION_ADD_SURCHARGE = Decimal("1.00")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_or_create_cart(db: Session, customer_id: int) -> Cart:
    """Return the customer's cart, creating one if it doesn't exist yet."""
    cart = db.scalar(select(Cart).where(Cart.customer_id == customer_id))
    if not cart:
        cart = Cart(customer_id=customer_id, created_at=datetime.utcnow().date())
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def _build_item_out(item: CartProduct, unavailable_base_ids: set[int]) -> CartItemOut:
    """Convert a CartProduct ORM row into the response schema."""
    product = item.product
    customization = customization_from_json(item.customization)
    price = (
        Decimal(str(customization.final_unit_price))
        if customization and customization.final_unit_price is not None
        else discounted_product_price(product)
    )
    quantity = item.quantity
    available = effective_product_available(product, unavailable_base_ids)
    return CartItemOut(
        cart_product_id=item.cart_product_id,
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product.name,
        price=price,
        quantity=quantity,
        available=available,
        unavailable_reason=product_unavailable_reason(product, unavailable_base_ids),
        media=primary_product_media_response(product),
        customization=customization,
        subtotal=price * quantity,
    )


def _build_cart_out(db: Session, cart: Cart) -> CartOut:
    """Convert a Cart ORM object into the full response schema."""
    unavailable_base_ids = unavailable_base_product_ids(
        db,
        [item.product_id for item in cart.items],
    )
    items = [_build_item_out(item, unavailable_base_ids) for item in cart.items]
    total = sum((i.subtotal for i in items), Decimal("0"))
    return CartOut(cart_id=cart.cart_id, items=items, total=total)


def _get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product).options(
            selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        ).where(
            and_(Product.product_id == product_id, Product.status == EntityStatus.ACTIVE, Product.deleted_at.is_(None))
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    return product


def _ensure_product_orderable(db: Session, product: Product) -> None:
    unavailable_base_ids = unavailable_base_product_ids(db, [product.product_id])
    if not effective_product_available(product, unavailable_base_ids):
        raise AppHTTPException(
            status_code=status.HTTP_409_CONFLICT,
            error="product_unavailable",
            message="Product is currently unavailable.",
            details={
                "product_id": product.product_id,
                "reason": product_unavailable_reason(product, unavailable_base_ids),
            },
        )


def _delete_cart_items(db: Session, cart_id: int) -> None:
    cart_item_ids = db.scalars(
        select(CartProduct.cart_product_id).where(CartProduct.cart_id == cart_id)
    ).all()
    if not cart_item_ids:
        return

    db.execute(
        delete(CartProductCustomization).where(
            CartProductCustomization.cart_product_id.in_(cart_item_ids)
        )
    )
    db.execute(
        delete(CartProduct).where(CartProduct.cart_product_id.in_(cart_item_ids))
    )


def _ensure_quantity_limit(product: Product, requested_quantity: int) -> None:
    if not 1 <= requested_quantity <= 99:
        raise AppHTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            error="invalid_quantity",
            message="Quantity must be between 1 and 99.",
            details={"product_id": product.product_id, "quantity": requested_quantity},
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
        rows = db.scalars(
            select(ProductIngredient)
            .join(ProductIngredient.ingredient)
            .where(
                ProductIngredient.product_id == product.product_id,
                ProductIngredient.removable.is_(True),
                ProductIngredient.ingredient.has(
                    (Ingredient.type == IngredientType.NORMAL)
                    & (Ingredient.status == EntityStatus.ACTIVE)
                    & Ingredient.available.is_(True)
                ),
            )
        ).all()
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

    ingredient_rows = db.scalars(
        select(ProductIngredient)
        .join(ProductIngredient.ingredient)
        .where(ProductIngredient.product_id == product.product_id)
    ).all()
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
        if ingredient_row.ingredient.status != EntityStatus.ACTIVE or not ingredient_row.ingredient.available:
            raise AppHTTPException(status_code=status.HTTP_409_CONFLICT, error="customization_ingredient_unavailable", message="A selected customization ingredient is currently unavailable.", details={"product_id": product.product_id, "ingredient_id": ingredient_id})

        remove_names.append(ingredient_name)
        customization_rows.append({
            "ingredient_id": ingredient_id,
            "option_id": None,
            "action": CartCustomizationAction.REMOVE_INGREDIENT,
            "quantity": 1,
            "extra_price": Decimal("0"),
        })

    options = {}
    extra_option_ids = {extra.option_id for extra in body.extras}
    substitution_ingredient_ids = {
        substitution.new_ingredient_id for substitution in body.substitutions
    }
    if extra_option_ids or substitution_ingredient_ids:
        requested_options = db.scalars(
            select(ProductCustomizationOption).where(
                ProductCustomizationOption.product_id == product.product_id,
                ProductCustomizationOption.status == EntityStatus.ACTIVE,
                or_(
                    ProductCustomizationOption.option_id.in_(extra_option_ids),
                    and_(
                        ProductCustomizationOption.ingredient_id.in_(substitution_ingredient_ids),
                        ProductCustomizationOption.type.in_(
                            (
                                ProductCustomizationOptionType.SUBSTITUTE_SAUCE,
                                ProductCustomizationOptionType.SUBSTITUTE_SIDE,
                            )
                        ),
                    ),
                ),
            )
        ).all()
        unavailable_option = next(
            (
                option
                for option in requested_options
                if option.ingredient
                and (
                    option.ingredient.status != EntityStatus.ACTIVE
                    or not option.ingredient.available
                )
            ),
            None,
        )
        if unavailable_option:
            raise AppHTTPException(
                status_code=status.HTTP_409_CONFLICT,
                error="customization_ingredient_unavailable",
                message="A selected customization ingredient is currently unavailable.",
                details={
                    "product_id": product.product_id,
                    "ingredient_id": unavailable_option.ingredient_id,
                },
            )
        options = {option.option_id: option for option in requested_options}

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
        note=body.notes,
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
    statement = select(CartProduct).where(
        CartProduct.cart_id == cart_id,
        CartProduct.product_id == product_id,
    )

    if customization_json is None:
        statement = statement.where(CartProduct.customization.is_(None))
    else:
        statement = statement.where(CartProduct.customization == customization_json)

    return db.scalar(statement.limit(1))


def _cart_item_out_from_product(
    product: Product,
    quantity: int,
    unit_price: Decimal,
    customization: ItemCustomization,
) -> CartItemOut:
    return CartItemOut(
        cart_product_id=0,
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product.name,
        price=unit_price,
        quantity=quantity,
        available=True,
        unavailable_reason=None,
        media=primary_product_media_response(product),
        customization=customization,
        subtotal=unit_price * quantity,
    )


def trusted_guest_customization(
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
            notes=customization.note,
        )
        trusted, _, customization_rows = _validate_and_build_customization(db, product, body)
        return trusted, customization_rows

    return _price_legacy_customization(db, product, ItemCustomization(
        remove=customization.remove,
        add=customization.add,
        preferences=customization.preferences,
        note=customization.note,
    )), []


# Compatibility alias for internal callers that imported the former private name.
_trusted_guest_customization = trusted_guest_customization


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# GET /cart/  ── view cart
@router.get("/", response_model=CartOut, operation_id="cart_get_cart")
def get_cart(
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    # If user is not authenticated, return empty guest cart
    if not current_user:
        return CartOut(cart_id=None, items=[], total=Decimal("0"))

    cart = _get_or_create_cart(db, current_user.customer_id)
    return _build_cart_out(db, cart)


# POST /cart/add  ── add or increment item
@router.post("/add", response_model=CartOut, operation_id="cart_add_item")
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
        # Return empty guest cart - frontend stores in localStorage
        return CartOut(cart_id=None, items=[], total=Decimal("0"))

    cart = _get_or_create_cart(db, current_user.customer_id)

    existing = (
        _find_cart_line(db, cart.cart_id, body.product_id, customization_json)
    )

    new_quantity = (existing.quantity if existing else 0) + body.quantity
    _ensure_quantity_limit(product, new_quantity)

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
    return _build_cart_out(db, cart)


def _add_customized_item_impl(
    body: CustomizedCartItemRequest,
    db: Session,
    current_user: Optional[Customer],
) -> CartOut:
    product = _get_product_or_404(db, body.product_id)
    _ensure_product_orderable(db, product)
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
    _ensure_quantity_limit(product, new_quantity)

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
                notes=body.notes,
            ))

    db.commit()
    db.refresh(cart)
    return _build_cart_out(db, cart)


@router.post("/items/customized", response_model=CartOut, operation_id="cart_add_customized_item")
def add_customized_item(
    body: CustomizedCartItemRequest,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    return _add_customized_item_impl(body, db, current_user)


# PUT /cart/update  ── set exact quantity for an item
@router.put("/update", response_model=CartOut, operation_id="cart_update_item")
def update_item(
    body: UpdateItemSchema,
    db: Session = Depends(get_db),
    current_user: Optional[Customer] = Depends(get_current_user_optional),
):
    # If user is not authenticated, just validate and return empty cart response
    if not current_user:
        product = _get_product_or_404(db, body.product_id)
        _ensure_product_orderable(db, product)
        return CartOut(cart_id=None, items=[], total=Decimal("0"))

    cart = _get_or_create_cart(db, current_user.customer_id)

    if body.cart_product_id is not None:
        item = db.scalar(
            select(CartProduct).where(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.cart_product_id == body.cart_product_id,
            ).limit(1)
        )
    else:
        item = db.scalar(
            select(CartProduct).where(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.product_id == body.product_id,
            ).limit(1)
        )

    if not item:
        raise AppHTTPException(status_code=404, error="cart_item_not_found", message="Cart item not found.", details={"reason": "request_failed"})

    product = _get_product_or_404(db, item.product_id)
    _ensure_quantity_limit(product, body.quantity)
    item.quantity = body.quantity
    db.commit()
    db.refresh(cart)
    return _build_cart_out(db, cart)


# DELETE /cart/remove/{product_id}  ── remove one item
@router.delete("/remove/{product_id}", response_model=CartOut, operation_id="cart_remove_item")
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
        item = db.scalar(
            select(CartProduct).where(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.cart_product_id == cart_product_id,
            ).limit(1)
        )
    else:
        item = db.scalar(
            select(CartProduct).where(
                CartProduct.cart_id == cart.cart_id,
                CartProduct.product_id == parsed_product_id,
            ).limit(1)
        )

    if not item:
        raise AppHTTPException(status_code=404, error="cart_item_not_found", message="Cart item not found.", details={"reason": "request_failed"})

    db.delete(item)
    db.commit()
    db.refresh(cart)
    return _build_cart_out(db, cart)


# DELETE /cart/clear  ── empty the whole cart
@router.delete("/clear", response_model=CartOut, operation_id="cart_clear_cart")
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
    return _build_cart_out(db, cart)


# POST /cart/merge  ── merge guest localStorage cart after login
@router.post("/merge", response_model=MergeResult, operation_id="cart_merge_cart")
def merge_cart(
    body: MergeCartSchema,
    db: Session = Depends(get_db),
    current_user: Customer = Depends(get_current_user),
):
    """
    Called immediately after login.
    Frontend sends the items it had in localStorage.
    Rules:
      - If item already exists in the DB cart, add quantities up to 99.
      - If item is new, add it up to the same technical limit.
      - If the product is unavailable, skip it.
    Returns lists of merged / capped / skipped product ids so the
    frontend can show the user what happened.
    """
    cart = _get_or_create_cart(db, current_user.customer_id)

    merged: List[int] = []
    capped: List[int] = []
    skipped: List[int] = []

    product_ids = {item.product_id for item in body.items}
    products = db.scalars(
        select(Product).where(
            Product.product_id.in_(product_ids),
            Product.status == EntityStatus.ACTIVE,
            Product.deleted_at.is_(None),
        )
    ).unique().all()
    product_map = {product.product_id: product for product in products}
    unavailable_base_ids = unavailable_base_product_ids(db, list(product_ids))

    for guest_item in body.items:
        product = product_map.get(guest_item.product_id)
        if not product or not effective_product_available(product, unavailable_base_ids):
            skipped.append(guest_item.product_id)
            continue
        try:
            trusted_customization, customization_rows = trusted_guest_customization(
                db,
                product,
                guest_item.quantity,
                guest_item.customization,
            )
        except AppHTTPException:
            skipped.append(guest_item.product_id)
            continue

        customization_json = customization_to_json(trusted_customization)

        existing = (
            _find_cart_line(db, cart.cart_id, guest_item.product_id, customization_json)
        )

        current_quantity = existing.quantity if existing else 0
        intended_quantity = current_quantity + guest_item.quantity

        if intended_quantity > 99:
            final_quantity = 99
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
        cart=_build_cart_out(db, cart),
    )
