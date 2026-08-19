"""Availability helpers shared by product, cart, and checkout flows."""

from sqlalchemy.orm import Session

from models import Ingrediente, Produto, ProdutoIngrediente

INACTIVE_BASE_REASON = "Not available right now"


def inactive_base_product_ids(db: Session, product_ids: list[str]) -> set[str]:
    """Return product ids linked to at least one inactive BASE ingredient."""
    if not product_ids:
        return set()

    rows = (
        db.query(ProdutoIngrediente.product_id)
        .join(Ingrediente, Ingrediente.ingredient_id == ProdutoIngrediente.ingredient_id)
        .filter(
            ProdutoIngrediente.product_id.in_(product_ids),
            Ingrediente.type == "BASE",
            Ingrediente.status == 0,
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


def unavailable_due_to_inactive_base(db: Session, product: Produto) -> bool:
    return product.product_id in inactive_base_product_ids(db, [product.product_id])

