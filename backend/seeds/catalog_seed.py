from __future__ import annotations

import hashlib
import json
from pathlib import Path
import time
from typing import Any, Callable, TypeVar


CATALOG_FORMAT_VERSION = 1
CATALOG_TABLES = (
    "category",
    "product",
    "ingredient",
    "product_ingredient",
    "product_customization_option",
    "site_setting",
)
CATALOG_OWNER_EMAIL = "owner@test.com"
NORMALIZED_IMAGE_NAMES = {
    "original": "catalog-original.webp",
    "thumb": "catalog-thumb.webp",
    "card": "catalog-card.webp",
    "detail": "catalog-detail.webp",
}
RUNTIME_TABLES = {
    "cart",
    "cart_product",
    "cart_product_customization",
    "coupon",
    "customer_billing_address",
    "customer_loyalty",
    "customer_order",
    "invoice",
    "order_product",
    "payment",
    "product_review",
    "review_reactions",
    "review_replies",
    "session",
    "user",
}


class CatalogSeedError(RuntimeError):
    pass


T = TypeVar("T")
_READ_RETRY_DELAYS_SECONDS = (0.05, 0.1, 0.2, 0.4)


def _retry_transient_file_read(operation: Callable[[], T]) -> T:
    """Retry Windows sharing violations caused by scanners and file watchers."""

    for delay in (*_READ_RETRY_DELAYS_SECONDS, None):
        try:
            return operation()
        except PermissionError:
            if delay is None:
                raise
            time.sleep(delay)
    raise AssertionError("unreachable")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with _retry_transient_file_read(lambda: path.open("rb")) as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_file_manifest(catalog_root: Path) -> dict[str, dict[str, int | str]]:
    products_root = catalog_root / "products"
    files: dict[str, dict[str, int | str]] = {}
    if not products_root.exists():
        return files
    for path in sorted(item for item in products_root.rglob("*") if item.is_file()):
        relative_path = path.relative_to(catalog_root).as_posix()
        files[relative_path] = {
            "sha256": sha256_file(path),
            "size_bytes": path.stat().st_size,
        }
    return files


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(
            _retry_transient_file_read(lambda: path.read_text(encoding="utf-8"))
        )
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogSeedError(f"Cannot read valid JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise CatalogSeedError(f"Expected a JSON object in {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _row_ids(rows: list[dict[str, Any]], table_name: str) -> set[int]:
    ids = [row.get("id") for row in rows]
    if any(not isinstance(row_id, int) for row_id in ids):
        raise CatalogSeedError(f"Every {table_name} row must have an integer id")
    if len(ids) != len(set(ids)):
        raise CatalogSeedError(f"Duplicate ids in {table_name}")
    return set(ids)


def validate_fixture(fixture: dict[str, Any]) -> dict[str, int]:
    if fixture.get("format_version") != CATALOG_FORMAT_VERSION:
        raise CatalogSeedError(
            f"Unsupported catalog format: {fixture.get('format_version')!r}"
        )
    if fixture.get("owner_email") != CATALOG_OWNER_EMAIL:
        raise CatalogSeedError("Catalog owner must be the deterministic development owner")

    tables = fixture.get("tables")
    if not isinstance(tables, dict) or set(tables) != set(CATALOG_TABLES):
        raise CatalogSeedError(
            f"Catalog tables must be exactly {sorted(CATALOG_TABLES)}"
        )
    if RUNTIME_TABLES.intersection(tables):
        raise CatalogSeedError("Runtime or personal tables cannot be present in the catalog")
    if any(not isinstance(tables[name], list) for name in CATALOG_TABLES):
        raise CatalogSeedError("Every catalog table value must be a row list")

    typed_tables: dict[str, list[dict[str, Any]]] = {}
    for table_name in CATALOG_TABLES:
        rows = tables[table_name]
        if any(not isinstance(row, dict) for row in rows):
            raise CatalogSeedError(f"Invalid row in {table_name}")
        typed_tables[table_name] = rows

    category_ids = _row_ids(typed_tables["category"], "category")
    product_ids = _row_ids(typed_tables["product"], "product")
    ingredient_ids = _row_ids(typed_tables["ingredient"], "ingredient")
    _row_ids(typed_tables["product_ingredient"], "product_ingredient")
    _row_ids(
        typed_tables["product_customization_option"],
        "product_customization_option",
    )
    _row_ids(typed_tables["site_setting"], "site_setting")

    for table_name in ("category", "product"):
        if any(row.get("admin_email") != CATALOG_OWNER_EMAIL for row in typed_tables[table_name]):
            raise CatalogSeedError(f"Every {table_name} row must reference {CATALOG_OWNER_EMAIL}")
        if any("admin_id" in row for row in typed_tables[table_name]):
            raise CatalogSeedError(f"Raw admin ids are forbidden in {table_name}")

    for row in typed_tables["product"]:
        if row.get("category_id") not in category_ids:
            raise CatalogSeedError(f"Product {row.get('id')} has an unknown category")
    for row in typed_tables["product_ingredient"]:
        if row.get("product_id") not in product_ids:
            raise CatalogSeedError("ProductIngredient has an unknown product")
        if row.get("ingredient_id") not in ingredient_ids:
            raise CatalogSeedError("ProductIngredient has an unknown ingredient")
    for row in typed_tables["product_customization_option"]:
        if row.get("product_id") not in product_ids:
            raise CatalogSeedError("Customization option has an unknown product")
        ingredient_id = row.get("ingredient_id")
        if ingredient_id is not None and ingredient_id not in ingredient_ids:
            raise CatalogSeedError("Customization option has an unknown ingredient")

    media_product_ids = fixture.get("media_product_ids")
    if (
        not isinstance(media_product_ids, list)
        or any(not isinstance(product_id, int) for product_id in media_product_ids)
        or len(media_product_ids) != len(set(media_product_ids))
    ):
        raise CatalogSeedError("media_product_ids must contain unique integer ids")
    if not set(media_product_ids).issubset(product_ids):
        raise CatalogSeedError("Media folders reference products outside the fixture")

    counts = {table_name: len(typed_tables[table_name]) for table_name in CATALOG_TABLES}
    expected_counts = fixture.get("counts")
    if expected_counts != counts:
        raise CatalogSeedError(
            f"Fixture counts do not match rows: expected {expected_counts}, got {counts}"
        )
    return counts


def validate_catalog_bundle(catalog_root: Path) -> tuple[dict[str, Any], dict[str, int]]:
    fixture = load_json(catalog_root / "catalog.json")
    counts = validate_fixture(fixture)
    manifest = load_json(catalog_root / "manifest.json")
    if manifest.get("format_version") != CATALOG_FORMAT_VERSION:
        raise CatalogSeedError("Unsupported manifest format")
    expected_files = manifest.get("files")
    if not isinstance(expected_files, dict):
        raise CatalogSeedError("Manifest files must be an object")
    actual_files = build_file_manifest(catalog_root)
    if actual_files != expected_files:
        raise CatalogSeedError("Catalog image files do not match manifest hashes and sizes")

    products_root = catalog_root / "products"
    if not products_root.is_dir():
        raise CatalogSeedError("Catalog products directory is missing")
    folder_ids: set[int] = set()
    for folder in sorted(path for path in products_root.iterdir() if path.is_dir()):
        if not folder.name.startswith("PRD-") or not folder.name[4:].isdigit():
            raise CatalogSeedError(f"Invalid product media folder: {folder.name}")
        folder_ids.add(int(folder.name[4:]))
        actual_names = {path.name for path in folder.iterdir() if path.is_file()}
        expected_names = set(NORMALIZED_IMAGE_NAMES.values())
        if actual_names != expected_names:
            raise CatalogSeedError(
                f"{folder.name} must contain exactly the four normalized WebP files"
            )
    if folder_ids != set(fixture["media_product_ids"]):
        raise CatalogSeedError("Media folders do not match media_product_ids")
    if len(actual_files) != len(folder_ids) * len(NORMALIZED_IMAGE_NAMES):
        raise CatalogSeedError("Unexpected number of catalog image files")
    return fixture, counts
