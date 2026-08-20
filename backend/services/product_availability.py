"""Availability helpers shared by product, cart, and checkout flows."""

from sqlalchemy.orm import Session

from schemas.enums import EntityStatus, IngredientType
from models import Ingredient, Product, ProductIngredient

INACTIVE_BASE_REASON = "Not available right now"


def inactive_base_product_ids(db: Session, product_ids: list[str]) -> set[str]:
    """Return product ids linked to at least one inactive BASE ingredient."""
    if not product_ids:
        return set()

    rows = (
        db.query(ProductIngredient.product_id)
        .join(Ingredient, Ingredient.ingredient_id == ProductIngredient.ingredient_id)
        .filter(
            ProductIngredient.product_id.in_(product_ids),
            Ingredient.type == IngredientType.BASE,
            Ingredient.status == EntityStatus.INACTIVE,
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def unavailable_due_to_inactive_base(db: Session, product: Product) -> bool:
    return product.product_id in inactive_base_product_ids(db, [product.product_id])

