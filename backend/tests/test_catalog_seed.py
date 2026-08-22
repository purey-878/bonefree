from __future__ import annotations

import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

import app as app_module
from core.config import settings
from scripts.export_catalog_seed import check_export
from scripts.seed_catalog import (
    _install_staged_seed,
    _target_contains_only_development_users,
    seed_catalog,
    seed_catalog_on_development_startup,
)
from seeds.catalog_seed import (
    CATALOG_TABLES,
    RUNTIME_TABLES,
    CatalogSeedError,
    build_file_manifest,
    load_json,
    write_json,
    validate_catalog_bundle,
)


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
CATALOG_ROOT = BACKEND_DIR / "seeds" / "catalog"


def _database_fingerprint(database_path: Path) -> dict[str, list[tuple]]:
    connection = sqlite3.connect(database_path)
    try:
        tables = (
            "user",
            *CATALOG_TABLES,
            "media",
            "media_variant",
            "product_media",
        )
        fingerprint: dict[str, list[tuple]] = {}
        for table_name in tables:
            columns = [
                row[1]
                for row in connection.execute(f'PRAGMA table_info("{table_name}")')
                if row[1] not in {"created_at", "updated_at", "password"}
            ]
            column_sql = ", ".join(f'"{column}"' for column in columns)
            fingerprint[table_name] = connection.execute(
                f'SELECT {column_sql} FROM "{table_name}" ORDER BY id'
            ).fetchall()
        return fingerprint
    finally:
        connection.close()


class CatalogSeedTests(unittest.TestCase):
    def test_committed_bundle_is_current_sanitized_and_complete(self):
        fixture, counts = validate_catalog_bundle(CATALOG_ROOT)

        self.assertEqual(
            counts,
            {
                "category": 7,
                "product": 54,
                "ingredient": 148,
                "product_ingredient": 162,
                "product_customization_option": 298,
                "site_setting": 6,
            },
        )
        self.assertEqual(len(fixture["media_product_ids"]), 53)
        self.assertEqual(len(build_file_manifest(CATALOG_ROOT)), 212)
        self.assertEqual(set(fixture["tables"]), set(CATALOG_TABLES))
        self.assertFalse(set(fixture["tables"]).intersection(RUNTIME_TABLES))
        serialized = json.dumps(fixture)
        self.assertNotIn('"admin_id"', serialized)
        self.assertNotIn('"password"', serialized)
        self.assertNotIn("legacy-product-image", serialized)

        canonical_database = BACKEND_DIR / "bonefree.db"
        canonical_uploads = PROJECT_ROOT / "uploads"
        if canonical_database.is_file() and canonical_uploads.is_dir():
            check_export(canonical_database, canonical_uploads, CATALOG_ROOT)

    def test_missing_and_corrupted_catalog_images_fail_validation(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            invalid_root = temporary_root / "invalid"
            invalid_root.mkdir()
            invalid_fixture = load_json(CATALOG_ROOT / "catalog.json")
            invalid_fixture["tables"]["product"][0]["category_id"] = 999999
            write_json(invalid_root / "catalog.json", invalid_fixture)
            shutil.copy2(CATALOG_ROOT / "manifest.json", invalid_root / "manifest.json")
            with self.assertRaisesRegex(CatalogSeedError, "unknown category"):
                validate_catalog_bundle(invalid_root)

            missing_root = temporary_root / "missing"
            missing_root.mkdir()
            shutil.copy2(CATALOG_ROOT / "catalog.json", missing_root / "catalog.json")
            shutil.copy2(CATALOG_ROOT / "manifest.json", missing_root / "manifest.json")
            with self.assertRaises(CatalogSeedError):
                validate_catalog_bundle(missing_root)

            corrupt_root = temporary_root / "corrupt"
            shutil.copytree(CATALOG_ROOT, corrupt_root)
            image_path = next((corrupt_root / "products").rglob("*.webp"))
            image_path.write_bytes(image_path.read_bytes() + b"corrupt")
            with self.assertRaises(CatalogSeedError):
                validate_catalog_bundle(corrupt_root)

    def test_catalog_json_read_retries_a_transient_windows_lock(self):
        with (
            patch.object(
                Path,
                "read_text",
                side_effect=[PermissionError("temporarily locked"), '{"value": 1}'],
            ) as read_text,
            patch("seeds.catalog_seed.time.sleep") as retry_sleep,
        ):
            self.assertEqual(load_json(Path("catalog.json")), {"value": 1})

        self.assertEqual(read_text.call_count, 2)
        retry_sleep.assert_called_once_with(0.05)

    def test_fresh_seeds_are_reproducible_and_reset_is_explicit_and_backed_up(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            fingerprints: list[dict[str, list[tuple]]] = []
            manifests: list[dict[str, dict[str, int | str]]] = []
            targets: list[tuple[Path, Path, Path]] = []

            for index in range(2):
                target_root = temporary_root / f"target-{index}"
                database_path = target_root / "bonefree.db"
                uploads_root = target_root / "uploads"
                backups_root = target_root / "backups"
                counts = seed_catalog(
                    apply=True,
                    reset=False,
                    confirm_reset=False,
                    database_path=database_path,
                    uploads_root=uploads_root,
                    catalog_root=CATALOG_ROOT,
                    backup_root=backups_root,
                )
                self.assertEqual(counts["product"], 54)
                self.assertEqual(counts["media"], 53)
                self.assertEqual(counts["media_variant"], 159)
                self.assertEqual(counts["product_media"], 53)
                self.assertEqual(counts["primaries"], 53)
                self.assertEqual(counts["products_without_media"], 1)
                fingerprints.append(_database_fingerprint(database_path))
                manifests.append(build_file_manifest(uploads_root))
                targets.append((database_path, uploads_root, backups_root))

            self.assertEqual(fingerprints[0], fingerprints[1])
            self.assertEqual(manifests[0], manifests[1])
            self.assertEqual(manifests[0], build_file_manifest(CATALOG_ROOT))

            database_path, uploads_root, backups_root = targets[0]
            with self.assertRaises(CatalogSeedError):
                seed_catalog(
                    apply=True,
                    reset=False,
                    confirm_reset=False,
                    database_path=database_path,
                    uploads_root=uploads_root,
                    catalog_root=CATALOG_ROOT,
                    backup_root=backups_root,
                )

            reset_counts = seed_catalog(
                apply=True,
                reset=True,
                confirm_reset=True,
                database_path=database_path,
                uploads_root=uploads_root,
                catalog_root=CATALOG_ROOT,
                backup_root=backups_root,
            )
            self.assertEqual(reset_counts["user"], 5)
            backup_directories = list(backups_root.glob("pre-catalog-seed-*"))
            self.assertEqual(len(backup_directories), 1)
            self.assertTrue((backup_directories[0] / "bonefree.db").is_file())
            self.assertTrue((backup_directories[0] / "products.zip").is_file())
            self.assertTrue((backup_directories[0] / "checksums.json").is_file())
            self.assertEqual(_database_fingerprint(database_path), fingerprints[0])

    def test_production_apply_is_refused_before_staging(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            with patch.object(settings, "environment", "production"):
                with self.assertRaisesRegex(CatalogSeedError, "production"):
                    seed_catalog(
                        apply=True,
                        reset=False,
                        confirm_reset=False,
                        database_path=root / "bonefree.db",
                        uploads_root=root / "uploads",
                        catalog_root=CATALOG_ROOT,
                        backup_root=root / "backups",
                    )

    def test_development_startup_seeds_only_an_empty_catalog(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            database_path = root / "bonefree.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            uploads_root = root / "uploads"

            with (
                patch.object(settings, "environment", "development"),
                patch.object(settings, "database_url", database_url),
                patch("scripts.seed_catalog.seed_catalog") as apply_seed,
            ):
                self.assertTrue(
                    seed_catalog_on_development_startup(
                        uploads_root=uploads_root,
                        catalog_root=CATALOG_ROOT,
                        backup_root=root / "backups",
                    )
                )
                apply_seed.assert_called_once()
                self.assertTrue(
                    apply_seed.call_args.kwargs["allow_existing_development_users"]
                )
                self.assertFalse(apply_seed.call_args.kwargs["reset"])
                self.assertFalse(apply_seed.call_args.kwargs["confirm_reset"])

            existing_products = uploads_root / "products"
            existing_products.mkdir(parents=True)
            (existing_products / "existing.webp").write_bytes(b"existing")
            with (
                patch.object(settings, "environment", "development"),
                patch.object(settings, "database_url", database_url),
                patch("scripts.seed_catalog.seed_catalog") as apply_seed,
            ):
                self.assertTrue(
                    seed_catalog_on_development_startup(uploads_root=uploads_root)
                )
                self.assertTrue(apply_seed.call_args.kwargs["reset"])
                self.assertTrue(apply_seed.call_args.kwargs["confirm_reset"])

            connection = sqlite3.connect(database_path)
            try:
                connection.execute("CREATE TABLE product (id INTEGER PRIMARY KEY)")
                connection.execute("INSERT INTO product (id) VALUES (1)")
                connection.commit()
            finally:
                connection.close()

            with (
                patch.object(settings, "environment", "development"),
                patch.object(settings, "database_url", database_url),
                patch("scripts.seed_catalog.seed_catalog") as apply_seed,
            ):
                self.assertFalse(
                    seed_catalog_on_development_startup(uploads_root=uploads_root)
                )
                apply_seed.assert_not_called()

    def test_automatic_seed_accepts_only_known_development_users(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "bonefree.db"
            connection = sqlite3.connect(database_path)
            try:
                connection.execute('CREATE TABLE "user" (email TEXT NOT NULL)')
                connection.execute("CREATE TABLE product (id INTEGER PRIMARY KEY)")
                connection.execute(
                    'INSERT INTO "user" (email) VALUES (\'owner@test.com\')'
                )
                connection.commit()
            finally:
                connection.close()
            self.assertTrue(_target_contains_only_development_users(database_path))

            connection = sqlite3.connect(database_path)
            try:
                connection.execute(
                    'INSERT INTO "user" (email) VALUES (\'real@example.com\')'
                )
                connection.commit()
            finally:
                connection.close()
            self.assertFalse(_target_contains_only_development_users(database_path))

    def test_development_startup_rebuilds_a_missing_database_with_existing_uploads(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            database_path = root / "bonefree.db"
            database_url = f"sqlite:///{database_path.as_posix()}"
            uploads_root = root / "uploads"
            products_root = uploads_root / "products"
            products_root.mkdir(parents=True)
            (products_root / "old-runtime-file.webp").write_bytes(b"old")

            with (
                patch.object(settings, "environment", "development"),
                patch.object(settings, "database_url", database_url),
            ):
                self.assertTrue(
                    seed_catalog_on_development_startup(
                        uploads_root=uploads_root,
                        catalog_root=CATALOG_ROOT,
                        backup_root=root / "backups",
                    )
                )

            counts = _database_fingerprint(database_path)
            self.assertEqual(len(counts["product"]), 54)
            self.assertEqual(len(counts["media"]), 53)
            self.assertEqual(build_file_manifest(uploads_root), build_file_manifest(CATALOG_ROOT))
            local_backups = list((root / "backups").glob("pre-catalog-seed-*"))
            self.assertEqual(len(local_backups), 1)
            self.assertTrue((local_backups[0] / "products.zip").is_file())

    def test_failed_install_restores_database_uploads_and_sidecars(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            target_database = root / "target" / "bonefree.db"
            uploads_root = root / "target" / "uploads"
            target_products = uploads_root / "products"
            target_products.mkdir(parents=True)
            target_database.parent.mkdir(parents=True, exist_ok=True)
            target_database.write_bytes(b"old-database")
            Path(f"{target_database}-wal").write_bytes(b"old-wal")
            (target_products / "old.webp").write_bytes(b"old-image")

            stage = root / "stage"
            staged_database = stage / "bonefree.db"
            staged_products = stage / "products"
            staged_products.mkdir(parents=True)
            staged_database.write_bytes(b"new-database")
            (staged_products / "new.webp").write_bytes(b"new-image")

            def fail_validation():
                raise CatalogSeedError("simulated validation failure")

            with self.assertRaisesRegex(CatalogSeedError, "simulated"):
                _install_staged_seed(
                    staged_database,
                    staged_products,
                    target_database,
                    uploads_root,
                    fail_validation,
                )

            self.assertEqual(target_database.read_bytes(), b"old-database")
            self.assertEqual(Path(f"{target_database}-wal").read_bytes(), b"old-wal")
            self.assertEqual((target_products / "old.webp").read_bytes(), b"old-image")
            self.assertFalse((target_products / "new.webp").exists())


class CatalogStartupWiringTests(unittest.IsolatedAsyncioTestCase):
    async def test_app_runs_catalog_seed_before_user_seed_in_development(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            assets_root = root / "assets"
            uploads_root = root / "uploads"
            application = app_module.create_app(
                run_startup_tasks=True,
                public_assets_dir=assets_root,
                uploads_dir=uploads_root,
            )
            redis_client = AsyncMock()
            calls: list[str] = []

            with (
                patch.object(settings, "environment", "development"),
                patch.object(
                    app_module,
                    "create_redis_client",
                    return_value=redis_client,
                ),
                patch.object(
                    app_module,
                    "run_or_stamp_migrations",
                    side_effect=lambda: calls.append("migrations"),
                ),
                patch.object(
                    app_module,
                    "seed_catalog_on_development_startup",
                    side_effect=lambda **_kwargs: calls.append("catalog"),
                ) as catalog_seed,
                patch.object(
                    app_module,
                    "seed_test_users",
                    side_effect=lambda: calls.append("users"),
                ),
                patch.object(
                    app_module.database_engine,
                    "dispose",
                ) as dispose_engine,
                patch.object(app_module, "validate_email_config", return_value=[]),
            ):
                async with application.router.lifespan_context(application):
                    pass

            self.assertEqual(calls, ["migrations", "catalog", "users"])
            catalog_seed.assert_called_once_with(uploads_root=uploads_root)
            self.assertEqual(dispose_engine.call_count, 2)


if __name__ == "__main__":
    unittest.main()
