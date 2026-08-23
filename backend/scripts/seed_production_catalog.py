"""Safely load the canonical catalog into a new production PostgreSQL database."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import sys
import tempfile
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from core.config import settings
from database import SessionLocal, engine
from models import Media, MediaVariant, ProductMedia, User
from schemas.enums import UserRole, UserStatus
from scripts.migrate_product_images_to_media import (
    audit_product_media_in_session,
    reconcile_product_media_in_session,
)
from scripts.seed_catalog import INSERT_ORDER, TABLE_MODELS, insert_catalog_rows
from seeds.catalog_seed import CatalogSeedError, build_file_manifest, validate_catalog_bundle

DEFAULT_CATALOG_ROOT = BACKEND_DIR / "seeds" / "catalog"
DEFAULT_UPLOADS_ROOT = PROJECT_ROOT / "uploads"
MEDIA_MODELS = {
    "media": Media,
    "media_variant": MediaVariant,
    "product_media": ProductMedia,
}


def _count_rows(db: Session, model: type[Any]) -> int:
    return int(db.scalar(select(func.count()).select_from(model)) or 0)


def target_counts(db: Session) -> dict[str, int]:
    return {
        table_name: _count_rows(db, model)
        for table_name, model in {**TABLE_MODELS, **MEDIA_MODELS}.items()
    }


def _assert_empty_target(db: Session, products_root: Path) -> None:
    nonempty_tables = {
        name: count for name, count in target_counts(db).items() if count
    }
    if nonempty_tables:
        raise CatalogSeedError(
            f"Production catalog target is not empty: {nonempty_tables}. No data was changed."
        )
    if products_root.exists() and any(products_root.iterdir()):
        raise CatalogSeedError(
            f"Production uploads target is not empty: {products_root}. No files were changed."
        )


def _get_owner(db: Session, owner_email: str) -> User:
    normalized_email = owner_email.strip().lower()
    owner = db.scalar(
        select(User).where(
            User.email == normalized_email,
            User.role == UserRole.OWNER,
            User.status == UserStatus.ACTIVE,
        )
    )
    if owner is None:
        raise CatalogSeedError(
            f"No active owner exists for {normalized_email!r}. Create the first owner before loading the catalog."
        )
    return owner


def _lock_production_catalog(db: Session) -> None:
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(
            text(
                "SELECT pg_advisory_xact_lock(hashtext('bonefree-production-catalog'))"
            )
        )


def _synchronize_postgres_sequences(db: Session) -> None:
    if db.bind is None or db.bind.dialect.name != "postgresql":
        return
    for table_name in INSERT_ORDER:
        model = TABLE_MODELS[table_name]
        highest_id = int(db.scalar(select(func.max(model.id))) or 0)
        if not highest_id:
            continue
        db.execute(
            text(
                "SELECT setval(pg_get_serial_sequence(:table_name, 'id'), :highest_id, true)"
            ),
            {"table_name": table_name, "highest_id": highest_id},
        )


def check_production_catalog(
    db: Session,
    *,
    catalog_root: Path = DEFAULT_CATALOG_ROOT,
    uploads_root: Path = DEFAULT_UPLOADS_ROOT,
) -> dict[str, int]:
    _, fixture_counts = validate_catalog_bundle(catalog_root.resolve())
    _assert_empty_target(db, uploads_root.resolve() / "products")
    return fixture_counts


def apply_production_catalog(
    db: Session,
    *,
    owner_email: str,
    catalog_root: Path = DEFAULT_CATALOG_ROOT,
    uploads_root: Path = DEFAULT_UPLOADS_ROOT,
) -> dict[str, int]:
    catalog_root = catalog_root.resolve()
    uploads_root = uploads_root.resolve()
    products_root = uploads_root / "products"
    fixture, fixture_counts = validate_catalog_bundle(catalog_root)
    _lock_production_catalog(db)
    owner = _get_owner(db, owner_email)
    _assert_empty_target(db, products_root)

    uploads_root.mkdir(parents=True, exist_ok=True)
    stage_root = Path(tempfile.mkdtemp(prefix=".catalog-production-", dir=uploads_root))
    staged_products = stage_root / "products"
    installed_products = False
    committed = False
    try:
        shutil.copytree(catalog_root / "products", staged_products)
        if build_file_manifest(stage_root) != build_file_manifest(catalog_root):
            raise CatalogSeedError("Staged production uploads differ from the canonical catalog.")

        insert_catalog_rows(db, fixture, owner.id)
        db.flush()

        if products_root.exists():
            products_root.rmdir()
        os.replace(staged_products, products_root)
        installed_products = True

        media_summary = reconcile_product_media_in_session(
            db,
            product_media_dir=products_root,
            uploads_root=uploads_root,
        )
        _synchronize_postgres_sequences(db)
        db.flush()

        actual_counts = target_counts(db)
        expected_counts = {
            **fixture_counts,
            "media": len(fixture["media_product_ids"]),
            "media_variant": len(fixture["media_product_ids"]) * 3,
            "product_media": len(fixture["media_product_ids"]),
        }
        if actual_counts != expected_counts:
            raise CatalogSeedError(
                f"Seeded production counts differ from the catalog: expected {expected_counts}, got {actual_counts}."
            )
        if media_summary.product_links != expected_counts["product_media"]:
            raise CatalogSeedError("Seeded product media links are incomplete.")
        audit_product_media_in_session(
            db,
            product_media_dir=products_root,
            uploads_root=uploads_root,
        )

        db.commit()
        committed = True
        return actual_counts
    except Exception:
        db.rollback()
        if installed_products and not committed and products_root.exists():
            shutil.rmtree(products_root)
        raise
    finally:
        shutil.rmtree(stage_root, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="Validate the bundle and confirm that the target is empty.")
    mode.add_argument("--apply", action="store_true", help="Load the validated catalog into the empty target.")
    parser.add_argument("--owner-email", help="Email of the active owner that will own categories and products.")
    args = parser.parse_args()

    if settings.environment != "production":
        raise SystemExit("Error: ENVIRONMENT must be production.")
    if engine.dialect.name != "postgresql":
        raise SystemExit("Error: the production catalog command requires PostgreSQL.")
    if args.apply and not args.owner_email:
        parser.error("--owner-email is required with --apply")

    db = SessionLocal()
    try:
        if args.check:
            counts = check_production_catalog(db)
            print(f"Catalog is valid and the production target is empty: {counts}")
        else:
            counts = apply_production_catalog(db, owner_email=args.owner_email)
            print(f"Production catalog loaded successfully: {counts}")
    except CatalogSeedError as exc:
        db.rollback()
        raise SystemExit(f"Error: {exc}") from exc
    finally:
        db.close()


if __name__ == "__main__":
    main()
