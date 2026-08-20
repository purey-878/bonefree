"""Availability helpers shared by product, cart, and checkout flows."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from schemas.enums import EntityStatus, IngredientType
from models import Ingredient, Product, ProductIngredient

INACTIVE_BASE_REASON = "Not available right now"


def inactive_base_product_ids(db: Session, product_ids: list[int]) -> set[int]:
    """Return product ids linked to at least one inactive BASE ingredient."""
    if not product_ids:
        return set()

    product_ids_with_inactive_base = db.scalars(
        select(ProductIngredient.product_id)
        .join(Ingredient, Ingredient.ingredient_id == ProductIngredient.ingredient_id)
        .where(
            ProductIngredient.product_id.in_(product_ids),
            Ingredient.type == IngredientType.BASE,
            Ingredient.status == EntityStatus.INACTIVE,
        )
        .distinct()
    ).all()
    return set(product_ids_with_inactive_base)


def unavailable_due_to_inactive_base(db: Session, product: Product) -> bool:
    return product.product_id in inactive_base_product_ids(db, [product.product_id])

