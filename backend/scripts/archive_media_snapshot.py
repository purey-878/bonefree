"""Create a self-contained SQLite and uploads snapshot with SHA-256 manifests."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sqlite3
from zipfile import ZIP_DEFLATED, ZipFile


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _uploads_manifest(uploads_root: Path) -> dict[str, dict[str, int | str]]:
    manifest: dict[str, dict[str, int | str]] = {}
    for path in sorted(candidate for candidate in uploads_root.rglob("*") if candidate.is_file()):
        stat = path.stat()
        manifest[path.relative_to(uploads_root).as_posix()] = {
            "mtime_ns": stat.st_mtime_ns,
            "sha256": _sha256(path),
            "size_bytes": stat.st_size,
        }
    return manifest


def _verify_media_cutover(
    connection: sqlite3.Connection,
    expected_counts: dict[str, int],
) -> dict[str, int | str]:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise RuntimeError(f"Database integrity check failed: {integrity}")

    tables = {
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
    }
    required_tables = {"product", "media", "media_variant", "product_media"}
    missing_tables = required_tables - tables
    if missing_tables:
        raise RuntimeError(f"Missing Media tables: {sorted(missing_tables)}")
    if "product_image" in tables:
        raise RuntimeError("Legacy product_image table is still present")

    product_columns = {
        row[1] for row in connection.execute("PRAGMA table_info(product)")
    }
    if "image" in product_columns:
        raise RuntimeError("Legacy product.image column is still present")

    indexes = {
        row[1]: bool(row[2])
        for row in connection.execute("PRAGMA index_list(product_media)")
    }
    required_indexes = {
        "uq_product_media_product_sort_order",
        "uq_product_media_primary_per_product",
    }
    missing_indexes = required_indexes - indexes.keys()
    if missing_indexes:
        raise RuntimeError(f"Missing ProductMedia indexes: {sorted(missing_indexes)}")
    if any(not indexes[name] for name in required_indexes):
        raise RuntimeError("ProductMedia cutover indexes must be unique")

    actual_counts = {
        "products": connection.execute("SELECT COUNT(*) FROM product").fetchone()[0],
        "media": connection.execute("SELECT COUNT(*) FROM media").fetchone()[0],
        "variants": connection.execute(
            "SELECT COUNT(*) FROM media_variant"
        ).fetchone()[0],
        "product_links": connection.execute(
            "SELECT COUNT(*) FROM product_media"
        ).fetchone()[0],
        "primaries": connection.execute(
            "SELECT COUNT(*) FROM product_media WHERE is_primary = 1"
        ).fetchone()[0],
    }
    for name, expected in expected_counts.items():
        if actual_counts[name] != expected:
            raise RuntimeError(
                f"Unexpected {name} count: expected {expected}, got {actual_counts[name]}"
            )

    duplicate_sort_orders = connection.execute(
        """
        SELECT COUNT(*)
        FROM (
            SELECT product_id, sort_order
            FROM product_media
            GROUP BY product_id, sort_order
            HAVING COUNT(*) > 1
        )
        """
    ).fetchone()[0]
    duplicate_primaries = connection.execute(
        """
        SELECT COUNT(*)
        FROM (
            SELECT product_id
            FROM product_media
            WHERE is_primary = 1
            GROUP BY product_id
            HAVING COUNT(*) > 1
        )
        """
    ).fetchone()[0]
    if duplicate_sort_orders or duplicate_primaries:
        raise RuntimeError("ProductMedia ordering or primary constraints are violated")

    revision_row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    return {
        **actual_counts,
        "alembic_revision": revision_row[0] if revision_row else "missing",
    }


def archive_snapshot(
    database_path: Path,
    uploads_root: Path,
    output_directory: Path,
    compare_manifest: Path | None,
    expected_counts: dict[str, int],
) -> None:
    if not database_path.is_file():
        raise FileNotFoundError(f"Database does not exist: {database_path}")
    if not uploads_root.is_dir():
        raise FileNotFoundError(f"Uploads directory does not exist: {uploads_root}")

    manifest = _uploads_manifest(uploads_root)
    if compare_manifest is not None:
        expected = json.loads(compare_manifest.read_text(encoding="utf-8"))
        if manifest != expected:
            raise RuntimeError(
                f"Uploads differ from the reference manifest: {compare_manifest}"
            )

    source = sqlite3.connect(f"file:{database_path.resolve().as_posix()}?mode=ro", uri=True)
    try:
        database_report = _verify_media_cutover(source, expected_counts)
    finally:
        source.close()

    output_directory.mkdir(parents=True, exist_ok=False)
    database_backup = output_directory / "core_platform.db"
    uploads_archive = output_directory / "uploads.zip"
    manifest_path = output_directory / "uploads-manifest.json"

    source = sqlite3.connect(f"file:{database_path.resolve().as_posix()}?mode=ro", uri=True)
    destination = sqlite3.connect(database_backup)
    try:
        source.backup(destination)
        integrity = destination.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise RuntimeError(f"Backup integrity check failed: {integrity}")
    finally:
        destination.close()
        source.close()

    with ZipFile(uploads_archive, "w", compression=ZIP_DEFLATED) as archive:
        for relative_path in manifest:
            archive.write(uploads_root / relative_path, arcname=relative_path)

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    checksums = {
        database_backup.name: _sha256(database_backup),
        uploads_archive.name: _sha256(uploads_archive),
        manifest_path.name: _sha256(manifest_path),
    }
    (output_directory / "checksums.json").write_text(
        json.dumps(checksums, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        f"Archived database and {len(manifest)} upload files in {output_directory}.\n"
        f"Database: {database_report}\n"
        f"Checksums: {checksums}"
    )


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=project_root / "backend" / "core_platform.db",
    )
    parser.add_argument(
        "--uploads",
        type=Path,
        default=project_root / "uploads",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--compare-manifest", type=Path)
    parser.add_argument("--expected-products", type=int, required=True)
    parser.add_argument("--expected-media", type=int, required=True)
    parser.add_argument("--expected-variants", type=int, required=True)
    parser.add_argument("--expected-product-links", type=int, required=True)
    parser.add_argument("--expected-primaries", type=int, required=True)
    args = parser.parse_args()
    archive_snapshot(
        args.database,
        args.uploads,
        args.output,
        args.compare_manifest,
        {
            "products": args.expected_products,
            "media": args.expected_media,
            "variants": args.expected_variants,
            "product_links": args.expected_product_links,
            "primaries": args.expected_primaries,
        },
    )


if __name__ == "__main__":
    main()
