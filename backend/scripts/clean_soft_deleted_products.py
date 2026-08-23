from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from database import SessionLocal
from core.organizations import bind_session_to_organization
from models import (
    CartProduct,
    CartProductCustomization,
    Media,
    MediaVariant,
    OrderProduct,
    Product,
    ProductCustomizationOption,
    ProductIngredient,
    ProductMedia,
    ProductReview,
    ReviewReaction,
    ReviewReply,
)
from services.media_storage import delete_storage_key


def _log(message: str) -> None:
    print(message, flush=True)


def _count(db: Session, model, *criteria) -> int:
    return db.scalar(select(func.count()).select_from(model).where(*criteria)) or 0


def _ids(db: Session, statement) -> list[int]:
    return list(db.scalars(statement).all())


def _delete_storage_files(db: Session, media_ids: list[int]) -> None:
    if not media_ids:
        return

    storage_keys = list(
        db.scalars(
            select(MediaVariant.storage_key).where(MediaVariant.media_id.in_(media_ids))
        ).all()
    )
    storage_keys.extend(
        db.scalars(select(Media.storage_key).where(Media.id.in_(media_ids))).all()
    )

    for storage_key in storage_keys:
        delete_storage_key(storage_key)


def clean_soft_deleted_products(
    *,
    apply: bool,
    delete_files: bool,
    organization_slug: str = "bonefree",
) -> None:
    db = SessionLocal()
    try:
        organization_id = bind_session_to_organization(db, organization_slug)
        product_ids = _ids(
            db,
            select(Product.id).where(Product.deleted_at.is_not(None)).order_by(Product.id.asc()),
        )
        if not product_ids:
            _log("No soft-deleted products found.")
            return

        blocked_product_ids = _ids(
            db,
            select(OrderProduct.product_id)
            .where(OrderProduct.product_id.in_(product_ids))
            .distinct()
            .order_by(OrderProduct.product_id.asc()),
        )
        deletable_product_ids = [
            product_id for product_id in product_ids if product_id not in set(blocked_product_ids)
        ]

        product_ingredient_count = _count(db, ProductIngredient, ProductIngredient.product_id.in_(deletable_product_ids)) if deletable_product_ids else 0
        product_option_ids = _ids(db, select(ProductCustomizationOption.id).where(ProductCustomizationOption.product_id.in_(deletable_product_ids))) if deletable_product_ids else []
        cart_product_ids = _ids(db, select(CartProduct.id).where(CartProduct.product_id.in_(deletable_product_ids))) if deletable_product_ids else []
        product_review_ids = _ids(db, select(ProductReview.id).where(ProductReview.product_id.in_(deletable_product_ids))) if deletable_product_ids else []
        product_media_ids = _ids(db, select(ProductMedia.media_id).where(ProductMedia.product_id.in_(deletable_product_ids))) if deletable_product_ids else []
        shared_media_ids = set(_ids(
            db,
            select(ProductMedia.media_id).where(
                ProductMedia.media_id.in_(product_media_ids),
                ProductMedia.product_id.not_in(deletable_product_ids),
            ),
        )) if product_media_ids else set()
        orphan_media_ids = sorted(set(product_media_ids) - shared_media_ids)

        _log(f"Soft-deleted products found: {len(product_ids)}")
        _log(f"Products eligible for hard delete: {len(deletable_product_ids)}")
        if blocked_product_ids:
            _log(f"Products skipped because they have order history: {len(blocked_product_ids)}")
        _log(f"Product ingredient links to delete: {product_ingredient_count}")
        _log(f"Product customization options to delete: {len(product_option_ids)}")
        _log(f"Cart items to delete: {len(cart_product_ids)}")
        _log(f"Product reviews to delete: {len(product_review_ids)}")
        _log("Order product rows to delete: 0")
        _log(f"Product media links to delete: {len(product_media_ids)}")
        _log(f"Orphan media records to delete: {len(orphan_media_ids)}")

        if not apply:
            _log("Dry run only. Re-run with --apply to delete.")
            return

        if not deletable_product_ids:
            _log("No products can be hard-deleted with the selected options.")
            return

        if delete_files:
            _delete_storage_files(db, orphan_media_ids)

        if product_review_ids:
            db.execute(delete(ReviewReaction).where(ReviewReaction.review_id.in_(product_review_ids), ReviewReaction.organization_id == organization_id))
            db.execute(delete(ReviewReply).where(ReviewReply.review_id.in_(product_review_ids), ReviewReply.organization_id == organization_id))
            db.execute(delete(ProductReview).where(ProductReview.id.in_(product_review_ids), ProductReview.organization_id == organization_id))

        if cart_product_ids:
            db.execute(delete(CartProductCustomization).where(CartProductCustomization.cart_product_id.in_(cart_product_ids), CartProductCustomization.organization_id == organization_id))
            db.execute(delete(CartProduct).where(CartProduct.id.in_(cart_product_ids), CartProduct.organization_id == organization_id))

        if product_option_ids:
            db.execute(delete(CartProductCustomization).where(CartProductCustomization.option_id.in_(product_option_ids), CartProductCustomization.organization_id == organization_id))
            db.execute(delete(ProductCustomizationOption).where(ProductCustomizationOption.id.in_(product_option_ids), ProductCustomizationOption.organization_id == organization_id))

        db.execute(delete(ProductIngredient).where(ProductIngredient.product_id.in_(deletable_product_ids), ProductIngredient.organization_id == organization_id))
        db.execute(delete(ProductMedia).where(ProductMedia.product_id.in_(deletable_product_ids), ProductMedia.organization_id == organization_id))

        if orphan_media_ids:
            db.execute(delete(MediaVariant).where(MediaVariant.media_id.in_(orphan_media_ids), MediaVariant.organization_id == organization_id))
            db.execute(delete(Media).where(Media.id.in_(orphan_media_ids), Media.organization_id == organization_id))

        db.execute(delete(Product).where(Product.id.in_(deletable_product_ids), Product.organization_id == organization_id))
        db.commit()
        _log(f"Hard-deleted {len(deletable_product_ids)} soft-deleted products.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Hard-delete products marked with deleted_at.")
    parser.add_argument("--apply", action="store_true", help="Execute deletion. Without this flag, only prints a dry run.")
    parser.add_argument(
        "--keep-files",
        action="store_true",
        help="Keep uploaded media files on disk. Database media rows are still deleted.",
    )
    parser.add_argument(
        "--organization-slug",
        default="bonefree",
        help="Organization whose soft-deleted products will be cleaned.",
    )
    args = parser.parse_args()
    clean_soft_deleted_products(
        apply=args.apply,
        delete_files=not args.keep_files,
        organization_slug=args.organization_slug,
    )


if __name__ == "__main__":
    main()
