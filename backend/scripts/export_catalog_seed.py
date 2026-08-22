"""Export a sanitized, reproducible catalog seed from the canonical SQLite database."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from scripts.migrate_product_images_to_media import discover_product_folders
from seeds.catalog_seed import (
    CATALOG_FORMAT_VERSION,
    CATALOG_OWNER_EMAIL,
    CATALOG_TABLES,
    NORMALIZED_IMAGE_NAMES,
    CatalogSeedError,
    load_json,
    sha256_file,
    validate_catalog_bundle,
    write_json,
)


def _open_read_only(database_path: Path) -> sqlite3.Connection:
    if not database_path.is_file():
        raise CatalogSeedError(f"Source database does not exist: {database_path}")
    connection = sqlite3.connect(
        f"file:{database_path.resolve().as_posix()}?mode=ro",
        uri=True,
    )
    connection.row_factory = sqlite3.Row
    return connection


def _table_rows(connection: sqlite3.Connection, table_name: str) -> list[dict[str, Any]]:
    columns = [
        row[1]
        for row in connection.execute(f'PRAGMA table_info("{table_name}")')
    ]
    if not columns:
        raise CatalogSeedError(f"Missing source table: {table_name}")
    selected_columns = [column for column in columns if column != "admin_id"]
    column_sql = ", ".join(f'"{column}"' for column in selected_columns)
    rows = [
        dict(row)
        for row in connection.execute(
            f'SELECT {column_sql} FROM "{table_name}" ORDER BY id'
        )
    ]
    if table_name in {"category", "product"}:
        for row in rows:
            row["admin_email"] = CATALOG_OWNER_EMAIL
    return rows


def build_fixture(
    database_path: Path,
    uploads_root: Path,
) -> tuple[dict[str, Any], dict[str, Path]]:
    connection = _open_read_only(database_path)
    try:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise CatalogSeedError(f"Source database integrity check failed: {integrity}")
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        missing_tables = set(CATALOG_TABLES) - tables
        if missing_tables:
            raise CatalogSeedError(f"Missing source tables: {sorted(missing_tables)}")
        if "product_image" in tables:
            raise CatalogSeedError("Legacy product_image cannot be exported")
        product_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(product)")
        }
        if "image" in product_columns:
            raise CatalogSeedError("Legacy product.image cannot be exported")

        table_rows = {
            table_name: _table_rows(connection, table_name)
            for table_name in CATALOG_TABLES
        }
        revision_row = connection.execute(
            "SELECT version_num FROM alembic_version"
        ).fetchone()
        revision = revision_row[0] if revision_row else None
    finally:
        connection.close()

    products_root = uploads_root / "products"
    folders = discover_product_folders(
        product_media_dir=products_root,
        uploads_root=uploads_root,
    )
    source_images: dict[str, Path] = {}
    for folder in folders:
        files_by_suffix = {
            "original": folder.original.path,
            **{kind.value: metadata.path for kind, metadata in folder.variants.items()},
        }
        for suffix, normalized_name in NORMALIZED_IMAGE_NAMES.items():
            relative_path = f"products/{folder.folder.name}/{normalized_name}"
            source_images[relative_path] = files_by_suffix[suffix]

    fixture = {
        "format_version": CATALOG_FORMAT_VERSION,
        "source_alembic_revision": revision,
        "owner_email": CATALOG_OWNER_EMAIL,
        "counts": {
            table_name: len(table_rows[table_name])
            for table_name in CATALOG_TABLES
        },
        "media_product_ids": [folder.product_id for folder in folders],
        "tables": table_rows,
    }
    return fixture, source_images


def _expected_manifest(source_images: dict[str, Path]) -> dict[str, Any]:
    return {
        "format_version": CATALOG_FORMAT_VERSION,
        "files": {
            relative_path: {
                "sha256": sha256_file(source_path),
                "size_bytes": source_path.stat().st_size,
            }
            for relative_path, source_path in sorted(source_images.items())
        },
    }


def check_export(
    database_path: Path,
    uploads_root: Path,
    output_directory: Path,
) -> None:
    fixture, source_images = build_fixture(database_path, uploads_root)
    expected_manifest = _expected_manifest(source_images)
    actual_fixture, _ = validate_catalog_bundle(output_directory)
    actual_manifest = load_json(output_directory / "manifest.json")
    if actual_fixture != fixture:
        raise CatalogSeedError("catalog.json is not synchronized with the source database")
    if actual_manifest != expected_manifest:
        raise CatalogSeedError("manifest.json is not synchronized with source uploads")
    print(
        f"Catalog seed is current: products={fixture['counts']['product']}, "
        f"folders={len(fixture['media_product_ids'])}, files={len(source_images)}."
    )


def apply_export(
    database_path: Path,
    uploads_root: Path,
    output_directory: Path,
) -> None:
    fixture, source_images = build_fixture(database_path, uploads_root)
    manifest = _expected_manifest(source_images)
    output_directory.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(
        prefix="catalog-seed-export-",
        dir=output_directory.parent,
    ) as temporary_directory:
        stage = Path(temporary_directory) / "catalog"
        stage.mkdir()
        write_json(stage / "catalog.json", fixture)
        write_json(stage / "manifest.json", manifest)
        for relative_path, source_path in source_images.items():
            destination = stage / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source_path, destination)
        validate_catalog_bundle(stage)

        previous = Path(temporary_directory) / "previous-catalog"
        if output_directory.exists():
            os.replace(output_directory, previous)
        try:
            os.replace(stage, output_directory)
        except BaseException:
            if previous.exists() and not output_directory.exists():
                os.replace(previous, output_directory)
            raise

    print(
        f"Exported sanitized catalog seed: products={fixture['counts']['product']}, "
        f"folders={len(fixture['media_product_ids'])}, files={len(source_images)}."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--source-database",
        type=Path,
        default=BACKEND_DIR / "bonefree.db",
    )
    parser.add_argument(
        "--source-uploads",
        type=Path,
        default=PROJECT_ROOT / "uploads",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BACKEND_DIR / "seeds" / "catalog",
    )
    args = parser.parse_args()

    if args.check:
        check_export(args.source_database, args.source_uploads, args.output)
    else:
        apply_export(args.source_database, args.source_uploads, args.output)


if __name__ == "__main__":
    main()
