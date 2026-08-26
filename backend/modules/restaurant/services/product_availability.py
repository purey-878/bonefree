"""Availability helpers shared by product, cart, checkout, and admin flows."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from modules.restaurant.models import EntityStatus, IngredientType
from modules.restaurant.models import Ingredient, Product, ProductIngredient

PRODUCT_UNAVAILABLE_REASON = "This item is currently unavailable."
UNAVAILABLE_BASE_REASON = "A required base ingredient is currently unavailable."


def unavailable_base_ingredients(
    db: Session,
    product_ids: list[int],
) -> dict[int, list[str]]:
    """Return unavailable active/base dependencies for many products in one query."""
    if not product_ids:
        return {}

    rows = db.execute(
        select(ProductIngredient.product_id, Ingredient.name)
        .join(Ingredient, Ingredient.ingredient_id == ProductIngredient.ingredient_id)
        .where(
            ProductIngredient.product_id.in_(product_ids),
            Ingredient.type == IngredientType.BASE,
            (
                (Ingredient.status == EntityStatus.INACTIVE)
                | Ingredient.available.is_(False)
            ),
        )
        .order_by(ProductIngredient.product_id, Ingredient.name)
    ).all()
    unavailable: dict[int, list[str]] = {}
    for product_id, ingredient_name in rows:
        unavailable.setdefault(product_id, []).append(ingredient_name)
    return unavailable


def unavailable_base_product_ids(db: Session, product_ids: list[int]) -> set[int]:
    return set(unavailable_base_ingredients(db, product_ids))


def effective_product_available(
    product: Product,
    unavailable_base_ids: set[int] | None = None,
) -> bool:
    return bool(
        product.status == EntityStatus.ACTIVE
        and product.deleted_at is None
        and product.available
        and product.product_id not in (unavailable_base_ids or set())
    )


def product_unavailable_reason(
    product: Product,
    unavailable_base_ids: set[int] | None = None,
) -> str | None:
    if product.product_id in (unavailable_base_ids or set()):
        return UNAVAILABLE_BASE_REASON
    if not effective_product_available(product, unavailable_base_ids):
        return PRODUCT_UNAVAILABLE_REASON
    return None

