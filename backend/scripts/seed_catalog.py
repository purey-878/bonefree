"""Build a sanitized development SQLite database and product uploads from the catalog seed."""

from __future__ import annotations

import argparse
from datetime import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from typing import Any, Callable
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import (
    Boolean,
    DateTime,
    Numeric,
    create_engine,
    event,
    insert,
    select,
    update,
)
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from core.config import settings
from core.database_types import StrEnumType
from core.organizations import bind_session_to_organization
from database import build_engine_kwargs
from models import (
    Category,
    Ingredient,
    OrganizationProfile,
    Product,
    ProductCustomizationOption,
    ProductIngredient,
    SiteSetting,
    User,
)
from modules.auth.models import UserRole
from scripts.migrate_product_images_to_media import migrate_product_images_to_media
from seeds.users import TEST_USERS, seed_test_users_in_session
from seeds.catalog_seed import (
    CATALOG_OWNER_EMAIL,
    RUNTIME_TABLES,
    CatalogSeedError,
    build_file_manifest,
    sha256_file,
    validate_catalog_bundle,
    write_json,
)


TABLE_MODELS = {
    "category": Category,
    "product": Product,
    "ingredient": Ingredient,
    "product_ingredient": ProductIngredient,
    "product_customization_option": ProductCustomizationOption,
    "site_setting": SiteSetting,
}
INSERT_ORDER = (
    "category",
    "site_setting",
    "ingredient",
    "product",
    "product_ingredient",
    "product_customization_option",
)


def _sqlite_url(database_path: Path) -> str:
    return f"sqlite:///{database_path.resolve().as_posix()}"


def _coerce_row(
    model: type[Any],
    row: dict[str, Any],
    owner_id: int,
    organization_id: int,
) -> dict[str, Any]:
    values = dict(row)
    values["organization_id"] = organization_id
    if "admin_email" in values:
        if values.pop("admin_email") != CATALOG_OWNER_EMAIL:
            raise CatalogSeedError("Unexpected catalog administrator")
        values["created_by_user_id"] = owner_id

    columns = model.__table__.columns
    for key, value in list(values.items()):
        if value is None or key not in columns:
            continue
        column_type = columns[key].type
        if isinstance(column_type, DateTime) and isinstance(value, str):
            values[key] = datetime.fromisoformat(value)
        elif isinstance(column_type, Numeric):
            values[key] = Decimal(str(value))
        elif isinstance(column_type, Boolean):
            values[key] = bool(value)
        elif isinstance(column_type, StrEnumType):
            values[key] = column_type.enum_class(value)
    return values


def insert_catalog_rows(
    db: Any,
    fixture: dict[str, Any],
    owner_id: int,
    organization_id: int,
) -> None:
    """Insert the validated canonical catalog into an existing transaction."""

    for table_name in INSERT_ORDER:
        model = TABLE_MODELS[table_name]
        rows = [
            _coerce_row(model, row, owner_id, organization_id)
            for row in fixture["tables"][table_name]
        ]
        if rows:
            db.execute(insert(model), rows)


def synchronize_catalog_organization_profile(
    db: Any,
    fixture: dict[str, Any],
    organization_id: int,
    *,
    preserve_existing: bool,
) -> None:
    """Apply catalog branding while preserving authoritative organization data when requested."""

    settings_by_key = {
        row["key"]: row.get("value")
        for row in fixture["tables"]["site_setting"]
    }
    company_details = json.loads(settings_by_key.get("company_details") or "{}")
    social_media = json.loads(settings_by_key.get("social_media") or "{}")
    profile_values = {
        "display_name": company_details.get("brand_name") or "BONEFREE",
        "description": company_details.get("description"),
        "email": company_details.get("email"),
        "phone": company_details.get("phone"),
        "address_line_1": company_details.get("address"),
        "social_links": social_media or None,
    }
    if preserve_existing:
        profile = db.scalar(
            select(OrganizationProfile).where(
                OrganizationProfile.organization_id == organization_id
            )
        )
        if profile is None:
            raise CatalogSeedError("The current organization profile is missing")
        for field, value in profile_values.items():
            if getattr(profile, field) in (None, "") and value not in (None, ""):
                setattr(profile, field, value)
        return

    db.execute(
        update(OrganizationProfile)
        .where(OrganizationProfile.organization_id == organization_id)
        .values(**profile_values)
    )


def _run_alembic_upgrade(database_path: Path) -> None:
    environment = os.environ.copy()
    environment["DATABASE_URL"] = _sqlite_url(database_path)
    environment["ENVIRONMENT"] = "test"
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise CatalogSeedError(f"Alembic failed for staged database: {detail}")


def _create_seed_engine(database_path: Path):
    database_url = _sqlite_url(database_path)
    engine = create_engine(database_url, **build_engine_kwargs(database_url))

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    return engine


def _insert_catalog(
    database_path: Path,
    fixture: dict[str, Any],
    *,
    preserve_organization_profile: bool = False,
) -> None:
    engine = _create_seed_engine(database_path)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    try:
        with session_factory() as db:
            organization_id = bind_session_to_organization(db, "bonefree")
            seed_test_users_in_session(db)
            db.flush()
            owner_id = db.scalar(
                select(User.id).where(
                    User.email == CATALOG_OWNER_EMAIL,
                    User.role == UserRole.OWNER,
                )
            )
            if owner_id is None:
                raise CatalogSeedError("Development owner was not created")

            insert_catalog_rows(db, fixture, owner_id, organization_id)
            synchronize_catalog_organization_profile(
                db,
                fixture,
                organization_id,
                preserve_existing=preserve_organization_profile,
            )
            db.commit()

        migrate_product_images_to_media(
            apply=True,
            product_media_dir=database_path.parent / "uploads" / "products",
            uploads_root=database_path.parent / "uploads",
            session_factory=session_factory,
        )
    finally:
        engine.dispose()


def _database_counts(database_path: Path) -> dict[str, int | str]:
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise CatalogSeedError(f"Seed database integrity check failed: {integrity}")
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        if "product_image" in tables:
            raise CatalogSeedError("Seed database contains legacy product_image")
        if "image" in {
            row[1] for row in connection.execute("PRAGMA table_info(product)")
        }:
            raise CatalogSeedError("Seed database contains legacy product.image")

        counts: dict[str, int | str] = {}
        counted_tables = (
            *TABLE_MODELS,
            "user",
            "media",
            "media_variant",
            "product_media",
        )
        for table_name in counted_tables:
            counts[table_name] = connection.execute(
                f'SELECT COUNT(*) FROM "{table_name}"'
            ).fetchone()[0]
        counts["primaries"] = connection.execute(
            "SELECT COUNT(*) FROM product_media WHERE is_primary = 1"
        ).fetchone()[0]
        counts["products_without_media"] = connection.execute(
            "SELECT COUNT(*) FROM product p "
            "WHERE NOT EXISTS (SELECT 1 FROM product_media pm WHERE pm.product_id = p.id)"
        ).fetchone()[0]
        for table_name in sorted(RUNTIME_TABLES - {"user"}):
            if table_name in tables:
                row_count = connection.execute(
                    f'SELECT COUNT(*) FROM "{table_name}"'
                ).fetchone()[0]
                if row_count:
                    raise CatalogSeedError(
                        f"Runtime table {table_name} is not empty in seeded database"
                    )
        revision_row = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()
        counts["alembic_revision"] = revision_row[0] if revision_row else "missing"
        return counts
    finally:
        connection.close()


def _validate_seeded_state(
    database_path: Path,
    staged_catalog_root: Path,
    fixture: dict[str, Any],
) -> dict[str, int | str]:
    counts = _database_counts(database_path)
    for table_name, expected in fixture["counts"].items():
        if counts[table_name] != expected:
            raise CatalogSeedError(
                f"Unexpected {table_name} count: expected {expected}, got {counts[table_name]}"
            )
    expected_media = len(fixture["media_product_ids"])
    expected = {
        "user": 5,
        "media": expected_media,
        "media_variant": expected_media * 3,
        "product_media": expected_media,
        "primaries": expected_media,
        "products_without_media": fixture["counts"]["product"] - expected_media,
    }
    for name, expected_count in expected.items():
        if counts[name] != expected_count:
            raise CatalogSeedError(
                f"Unexpected {name} count: expected {expected_count}, got {counts[name]}"
            )

    seed_manifest = build_file_manifest(staged_catalog_root)
    source_manifest = build_file_manifest(staged_catalog_root.parent / "seed-source")
    if seed_manifest != source_manifest:
        raise CatalogSeedError("Staged product uploads differ from catalog seed")
    return counts


def _copy_seed_products(catalog_root: Path, staged_root: Path) -> None:
    source_snapshot = staged_root / "seed-source"
    source_snapshot.mkdir()
    shutil.copytree(catalog_root / "products", source_snapshot / "products")
    uploads_root = staged_root / "uploads"
    shutil.copytree(catalog_root / "products", uploads_root / "products")


def _build_staged_seed(
    catalog_root: Path,
    staged_root: Path,
    fixture: dict[str, Any],
    source_database_path: Path | None = None,
) -> tuple[Path, Path, dict[str, int | str]]:
    _copy_seed_products(catalog_root, staged_root)
    database_path = staged_root / "bonefree-seed.db"
    if source_database_path is None:
        _run_alembic_upgrade(database_path)
    else:
        source = sqlite3.connect(
            f"file:{source_database_path.resolve().as_posix()}?mode=ro",
            uri=True,
        )
        destination = sqlite3.connect(database_path)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
    _insert_catalog(
        database_path,
        fixture,
        preserve_organization_profile=source_database_path is not None,
    )
    counts = _validate_seeded_state(database_path, staged_root / "uploads", fixture)
    return database_path, staged_root / "uploads" / "products", counts


def _target_has_data(database_path: Path) -> bool:
    if not database_path.exists() or database_path.stat().st_size == 0:
        return False
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise CatalogSeedError(f"Target database integrity check failed: {integrity}")
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master "
                "WHERE type = 'table' AND name NOT IN ('alembic_version', 'sqlite_sequence')"
            )
        ]
        return any(
            connection.execute(f'SELECT EXISTS(SELECT 1 FROM "{table}" LIMIT 1)').fetchone()[0]
            for table in tables
        )
    finally:
        connection.close()


def _catalog_has_data(database_path: Path) -> bool:
    if not database_path.exists() or database_path.stat().st_size == 0:
        return False
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        for table_name in TABLE_MODELS:
            if table_name in tables and connection.execute(
                f'SELECT EXISTS(SELECT 1 FROM "{table_name}" LIMIT 1)'
            ).fetchone()[0]:
                return True
        return False
    finally:
        connection.close()


def _has_tenancy_bootstrap_schema(database_path: Path) -> bool:
    if not database_path.exists() or database_path.stat().st_size == 0:
        return False
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        return {
            "organization",
            "organization_domain",
            "organization_profile",
        }.issubset(tables)
    finally:
        connection.close()


def _target_contains_only_development_users(database_path: Path) -> bool:
    if not database_path.exists() or database_path.stat().st_size == 0:
        return True
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    try:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        allowed_emails = {seed.email for seed in TEST_USERS}
        if "user" in tables:
            emails = {
                row[0]
                for row in connection.execute('SELECT email FROM "user"')
            }
            if not emails.issubset(allowed_emails):
                return False

        tenancy_tables = {
            "organization",
            "organization_domain",
            "organization_experience",
            "organization_feature_entitlement",
            "organization_profile",
        }
        present_tenancy_tables = tenancy_tables & tables
        if present_tenancy_tables:
            if present_tenancy_tables != tenancy_tables:
                return False
            organizations = connection.execute(
                "SELECT id, slug FROM organization"
            ).fetchall()
            if len(organizations) != 1 or organizations[0][1] != "bonefree":
                return False
            organization_id = organizations[0][0]
            domains = {
                (row[0], bool(row[1]), bool(row[2]), row[3])
                for row in connection.execute(
                    "SELECT domain, is_primary, is_verified, organization_id "
                    "FROM organization_domain"
                )
            }
            expected_domains = {
                ("bonefree.pt", True, True, organization_id),
                ("www.bonefree.pt", False, True, organization_id),
                ("bonefree.localhost", False, True, organization_id),
                ("127.0.0.1", False, True, organization_id),
            }
            if domains != expected_domains:
                return False
            profiles = connection.execute(
                "SELECT organization_id FROM organization_profile"
            ).fetchall()
            if profiles != [(organization_id,)]:
                return False
            experiences = connection.execute(
                "SELECT organization_id, schema_version, theme_key, theme_mode "
                "FROM organization_experience"
            ).fetchall()
            if experiences != [(organization_id, 1, "bonefree", "default")]:
                return False
            entitlements = {
                (row[0], bool(row[1]), row[2])
                for row in connection.execute(
                    "SELECT feature_key, enabled, organization_id "
                    "FROM organization_feature_entitlement"
                )
            }
            if entitlements != {
                (feature_key, True, organization_id)
                for feature_key in (
                    "catalog",
                    "customer_accounts",
                    "events",
                    "loyalty",
                    "ordering",
                    "reviews",
                )
            }:
                return False
            user_columns = {
                row[1] for row in connection.execute('PRAGMA table_info("user")')
            }
            if "organization_id" in user_columns and connection.execute(
                'SELECT EXISTS(SELECT 1 FROM "user" WHERE organization_id != ?)',
                (organization_id,),
            ).fetchone()[0]:
                return False

        ignored_tables = {
            "alembic_version",
            "sqlite_sequence",
            "user",
            *tenancy_tables,
        }
        for table_name in tables - ignored_tables:
            if connection.execute(
                f'SELECT EXISTS(SELECT 1 FROM "{table_name}" LIMIT 1)'
            ).fetchone()[0]:
                return False
        return True
    finally:
        connection.close()


def _products_have_files(products_root: Path) -> bool:
    return products_root.exists() and any(
        path.is_file() for path in products_root.rglob("*")
    )


def _backup_current_state(
    database_path: Path,
    products_root: Path,
    backup_root: Path,
) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    output = backup_root / f"pre-catalog-seed-{timestamp}"
    output.mkdir(parents=True, exist_ok=False)
    checksums: dict[str, str] = {}

    if database_path.exists() and database_path.stat().st_size:
        database_backup = output / "core_platform.db"
        source = sqlite3.connect(
            f"file:{database_path.resolve().as_posix()}?mode=ro",
            uri=True,
        )
        destination = sqlite3.connect(database_backup)
        try:
            source.backup(destination)
        finally:
            destination.close()
            source.close()
        checksums[database_backup.name] = sha256_file(database_backup)

    if products_root.exists():
        uploads_archive = output / "products.zip"
        with ZipFile(uploads_archive, "w", compression=ZIP_DEFLATED) as archive:
            for path in sorted(item for item in products_root.rglob("*") if item.is_file()):
                archive_path = Path("products") / path.relative_to(products_root)
                archive.write(path, arcname=archive_path.as_posix())
        checksums[uploads_archive.name] = sha256_file(uploads_archive)

    write_json(output / "checksums.json", checksums)
    return output


def _assert_safe_products_target(uploads_root: Path, products_root: Path) -> None:
    if products_root.resolve() != (uploads_root.resolve() / "products"):
        raise CatalogSeedError("Unsafe products target")


def _assert_products_target_accessible(products_root: Path) -> None:
    if products_root.exists():
        return
    try:
        entry_exists = any(
            entry.name == products_root.name for entry in products_root.parent.iterdir()
        )
    except OSError as exc:
        raise CatalogSeedError(
            f"Cannot inspect uploads directory {products_root.parent}: {exc}"
        ) from exc
    if entry_exists:
        raise CatalogSeedError(
            f"Product uploads directory {products_root} exists but is not accessible; "
            "repair its ownership or permissions before running the catalog seed"
        )


def _install_staged_seed(
    staged_database: Path,
    staged_products: Path,
    database_path: Path,
    uploads_root: Path,
    validate_installed: Callable[[], dict[str, int | str]],
) -> dict[str, int | str]:
    products_root = uploads_root / "products"
    _assert_safe_products_target(uploads_root, products_root)
    database_path.parent.mkdir(parents=True, exist_ok=True)
    uploads_root.mkdir(parents=True, exist_ok=True)
    _assert_products_target_accessible(products_root)

    # A directory moved out of TemporaryDirectory retains its private Windows ACL.
    # Build the install candidate beside the destination so it inherits uploads/ ACLs.
    install_products = uploads_root / f".catalog-seed-products-{uuid4().hex}"
    try:
        shutil.copytree(staged_products, install_products)
    except BaseException:
        if install_products.exists():
            shutil.rmtree(install_products)
        raise

    rollback_root = staged_database.parent / "rollback"
    rollback_root.mkdir()
    rollback_database = rollback_root / database_path.name
    rollback_products = rollback_root / "products"
    moved_sidecars: list[tuple[Path, Path]] = []

    try:
        if database_path.exists():
            os.replace(database_path, rollback_database)
        for suffix in ("-wal", "-shm"):
            sidecar = Path(f"{database_path}{suffix}")
            if sidecar.exists():
                rollback_sidecar = rollback_root / sidecar.name
                os.replace(sidecar, rollback_sidecar)
                moved_sidecars.append((sidecar, rollback_sidecar))
        if products_root.exists():
            os.replace(products_root, rollback_products)

        os.replace(staged_database, database_path)
        os.replace(install_products, products_root)
        return validate_installed()
    except BaseException:
        if database_path.exists():
            database_path.unlink()
        if rollback_database.exists():
            os.replace(rollback_database, database_path)
        if products_root.exists():
            shutil.rmtree(products_root)
        if rollback_products.exists():
            os.replace(rollback_products, products_root)
        for original, rollback in moved_sidecars:
            if rollback.exists():
                os.replace(rollback, original)
        raise
    finally:
        if install_products.exists():
            shutil.rmtree(install_products)


def seed_catalog(
    *,
    apply: bool,
    reset: bool,
    confirm_reset: bool,
    database_path: Path,
    uploads_root: Path,
    catalog_root: Path,
    backup_root: Path,
    allow_existing_development_users: bool = False,
) -> dict[str, int | str]:
    catalog_root = catalog_root.resolve()
    database_path = database_path.resolve()
    uploads_root = uploads_root.resolve()
    backup_root = backup_root.resolve()
    fixture, fixture_counts = validate_catalog_bundle(catalog_root)
    products_root = uploads_root / "products"
    target_has_data = _target_has_data(database_path)
    safe_development_bootstrap = (
        allow_existing_development_users
        and _target_contains_only_development_users(database_path)
    )
    if safe_development_bootstrap:
        target_has_data = False
    preserve_source_database = (
        database_path
        if safe_development_bootstrap
        and _has_tenancy_bootstrap_schema(database_path)
        else None
    )
    target_has_uploads = _products_have_files(products_root)

    if not apply:
        print(
            f"Catalog seed is valid: {fixture_counts}; "
            f"target_requires_reset={target_has_data or target_has_uploads}."
        )
        return fixture_counts

    if settings.environment == "production":
        raise CatalogSeedError("Catalog seed cannot be applied in production")
    if reset != confirm_reset:
        raise CatalogSeedError("Reset requires both --reset and --confirm-reset")
    if (target_has_data or target_has_uploads) and not reset:
        raise CatalogSeedError("Target is not empty; use --reset --confirm-reset")

    database_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="catalog-seed-stage-",
        dir=database_path.parent,
    ) as temporary_directory:
        staged_root = Path(temporary_directory)
        staged_database, staged_products, counts = _build_staged_seed(
            catalog_root,
            staged_root,
            fixture,
            preserve_source_database,
        )
        backup_path = None
        if reset and (database_path.exists() or products_root.exists()):
            backup_path = _backup_current_state(
                database_path,
                products_root,
                backup_root,
            )

        def validate_installed() -> dict[str, int | str]:
            installed_counts = _database_counts(database_path)
            if installed_counts != counts:
                raise CatalogSeedError(
                    "Installed database differs from validated staged database"
                )
            if build_file_manifest(uploads_root) != build_file_manifest(catalog_root):
                raise CatalogSeedError("Installed uploads differ from catalog seed")
            return installed_counts

        final_counts = _install_staged_seed(
            staged_database,
            staged_products,
            database_path,
            uploads_root,
            validate_installed,
        )
    print(f"Catalog seed applied successfully: {final_counts}.")
    if backup_path is not None:
        print(f"Previous state backed up to {backup_path}.")
    return final_counts


def seed_catalog_on_development_startup(
    *,
    uploads_root: Path,
    catalog_root: Path | None = None,
    backup_root: Path | None = None,
) -> bool:
    """Initialize the canonical catalog once for an empty development database."""

    if settings.environment != "development":
        return False

    database_url = make_url(settings.database_url)
    if database_url.get_backend_name() != "sqlite" or not database_url.database:
        raise CatalogSeedError(
            "Automatic development catalog seeding requires a file-based SQLite database"
        )
    database_path = Path(database_url.database).resolve()
    catalog_root = catalog_root or BACKEND_DIR / "seeds" / "catalog"
    backup_root = backup_root or BACKEND_DIR / "backups"

    if _catalog_has_data(database_path):
        print("Development catalog already contains data; automatic seed skipped.")
        return False

    validate_catalog_bundle(catalog_root)
    if not _target_contains_only_development_users(database_path):
        raise CatalogSeedError(
            "Automatic development catalog seeding refused a database containing "
            "non-development or operational data"
        )

    replace_existing_uploads = _products_have_files(uploads_root / "products")

    seed_catalog(
        apply=True,
        reset=replace_existing_uploads,
        confirm_reset=replace_existing_uploads,
        database_path=database_path,
        uploads_root=uploads_root,
        catalog_root=catalog_root,
        backup_root=backup_root,
        allow_existing_development_users=True,
    )
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--confirm-reset", action="store_true")
    parser.add_argument(
        "--database",
        type=Path,
        default=BACKEND_DIR / "core_platform.db",
    )
    parser.add_argument(
        "--uploads",
        type=Path,
        default=PROJECT_ROOT / "uploads",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=BACKEND_DIR / "seeds" / "catalog",
    )
    parser.add_argument(
        "--backups",
        type=Path,
        default=BACKEND_DIR / "backups",
    )
    args = parser.parse_args()
    seed_catalog(
        apply=args.apply,
        reset=args.reset,
        confirm_reset=args.confirm_reset,
        database_path=args.database,
        uploads_root=args.uploads,
        catalog_root=args.catalog,
        backup_root=args.backups,
    )


if __name__ == "__main__":
    main()
