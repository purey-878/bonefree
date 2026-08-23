from __future__ import annotations

import json
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session

from database import Base
from models import Category, Media, Product, User
from schemas.enums import UserRole, UserStatus
from scripts.create_first_owner import OwnerBootstrapError, create_first_owner
from scripts import seed_production_catalog as production_seed
from seeds.catalog_seed import CatalogSeedError
from services.auth_service import verify_password


class ProductionBootstrapTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = TemporaryDirectory()
        self.root = Path(self.temp_directory.name)
        self.uploads_root = self.root / "uploads"
        self.database_path = self.root / "production-bootstrap.db"
        self.engine = create_engine(
            f"sqlite:///{self.database_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def _owner(self, email: str = "owner@example.com") -> User:
        owner = User(
            name="Production",
            last_name="Owner",
            email=email,
            password="existing-hash",
            role=UserRole.OWNER,
            status=UserStatus.ACTIVE,
        )
        self.db.add(owner)
        self.db.commit()
        return owner

    def test_create_first_owner_hashes_password_and_normalizes_fields(self):
        owner = create_first_owner(
            self.db,
            name="  Production  ",
            last_name="  Owner  ",
            email="  OWNER@Example.com ",
            password="Secure123!",
        )
        self.db.commit()

        self.assertEqual(owner.name, "Production")
        self.assertEqual(owner.last_name, "Owner")
        self.assertEqual(owner.email, "owner@example.com")
        self.assertEqual(owner.role, UserRole.OWNER)
        self.assertEqual(owner.status, UserStatus.ACTIVE)
        self.assertNotEqual(owner.password, "Secure123!")
        self.assertTrue(verify_password("Secure123!", owner.password))

    def test_create_first_owner_refuses_existing_owner_and_duplicate_email(self):
        self._owner()
        with self.assertRaisesRegex(OwnerBootstrapError, "already exists"):
            create_first_owner(
                self.db,
                name="Another",
                last_name="Owner",
                email="another@example.com",
                password="Secure123!",
            )

        self.db.execute(delete(User))
        self.db.add(
            User(
                name="Existing",
                last_name="Client",
                email="client@example.com",
                password="hash",
                role=UserRole.CLIENT,
                status=UserStatus.ACTIVE,
            )
        )
        self.db.commit()
        with self.assertRaisesRegex(OwnerBootstrapError, "already associated"):
            create_first_owner(
                self.db,
                name="Production",
                last_name="Owner",
                email="client@example.com",
                password="Secure123!",
            )

    def test_create_first_owner_rejects_invalid_password_without_writes(self):
        with self.assertRaisesRegex(ValueError, "uppercase and lowercase"):
            create_first_owner(
                self.db,
                name="Production",
                last_name="Owner",
                email="owner@example.com",
                password="weak",
            )
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 0)

    def test_catalog_check_validates_bundle_and_empty_target(self):
        counts = production_seed.check_production_catalog(
            self.db,
            uploads_root=self.uploads_root,
        )
        self.assertGreater(counts["product"], 0)
        self.assertEqual(production_seed.target_counts(self.db)["product"], 0)

    def test_catalog_apply_requires_active_owner(self):
        with self.assertRaisesRegex(CatalogSeedError, "No active owner"):
            production_seed.apply_production_catalog(
                self.db,
                owner_email="missing@example.com",
                uploads_root=self.uploads_root,
            )
        self.assertFalse((self.uploads_root / "products").exists())

    def test_catalog_apply_loads_rows_media_and_files_once(self):
        owner = self._owner()
        counts = production_seed.apply_production_catalog(
            self.db,
            owner_email=owner.email,
            uploads_root=self.uploads_root,
        )

        self.assertGreater(counts["product"], 0)
        self.assertGreater(counts["media"], 0)
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 1)
        self.assertEqual(set(self.db.scalars(select(Category.admin_id))), {owner.id})
        self.assertEqual(set(self.db.scalars(select(Product.admin_id))), {owner.id})
        self.assertEqual(
            self.db.scalar(select(func.count()).select_from(Media)),
            counts["media"],
        )
        self.assertTrue(any((self.uploads_root / "products").rglob("*.webp")))

        with self.assertRaisesRegex(CatalogSeedError, "not empty"):
            production_seed.apply_production_catalog(
                self.db,
                owner_email=owner.email,
                uploads_root=self.uploads_root,
            )
        self.assertEqual(production_seed.target_counts(self.db), counts)

    def test_catalog_rejects_invalid_manifest_before_writes(self):
        owner = self._owner()
        invalid_catalog = self.root / "invalid-catalog"
        shutil.copytree(production_seed.DEFAULT_CATALOG_ROOT, invalid_catalog)
        manifest_path = invalid_catalog / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        first_name = next(iter(manifest["files"]))
        manifest["files"][first_name]["size_bytes"] += 1
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

        with self.assertRaisesRegex(CatalogSeedError, "manifest"):
            production_seed.apply_production_catalog(
                self.db,
                owner_email=owner.email,
                catalog_root=invalid_catalog,
                uploads_root=self.uploads_root,
            )
        self.assertEqual(production_seed.target_counts(self.db)["product"], 0)
        self.assertFalse((self.uploads_root / "products").exists())

    def test_catalog_rolls_back_database_and_installed_files(self):
        owner = self._owner()
        with mock.patch.object(
            production_seed,
            "reconcile_product_media_in_session",
            side_effect=RuntimeError("forced media failure"),
        ):
            with self.assertRaisesRegex(RuntimeError, "forced media failure"):
                production_seed.apply_production_catalog(
                    self.db,
                    owner_email=owner.email,
                    uploads_root=self.uploads_root,
                )

        self.assertFalse((self.uploads_root / "products").exists())
        self.assertTrue(all(count == 0 for count in production_seed.target_counts(self.db).values()))


if __name__ == "__main__":
    unittest.main()
