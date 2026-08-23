from __future__ import annotations

import hashlib
from contextlib import ExitStack
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from PIL import Image
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from database import Base
from models import Category, Media, MediaVariant, Organization, Product, ProductMedia, User
from schemas.enums import EntityStatus, MediaOwnerType, MediaVariantKind, UserRole, UserStatus
from scripts import migrate_product_images_to_media as migration


class ProductMediaMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = TemporaryDirectory()
        self.root = Path(self.temp_directory.name)
        self.uploads_root = self.root / "uploads"
        self.product_media_dir = self.uploads_root / "products"
        self.product_media_dir.mkdir(parents=True)

        database_path = self.root / "migration-test.db"
        self.engine = create_engine(
            f"sqlite:///{database_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        organization = Organization(name="Bonefree", slug="bonefree", email="hello@bonefree.test")
        self.db.add(organization)
        self.db.flush()
        self.organization_id = organization.id
        self.db.info["organization_id"] = organization.id

        self.admin = User(
            name="Admin",
            last_name="User",
            email="admin@example.com",
            password="hash",
            role=UserRole.OWNER,
            status=UserStatus.ACTIVE,
        )
        self.db.add(self.admin)
        self.db.flush()
        self.category = Category(
            category_name="Mains",
            admin_id=self.admin.id,
            status=EntityStatus.ACTIVE,
        )
        self.db.add(self.category)
        self.db.flush()
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def _product(self) -> Product:
        product = Product(
            name="Test product",
            product_description="Test description",
            price=Decimal("12.00"),
            available=True,
            category_id=self.category.id,
            admin_id=self.admin.id,
            status=EntityStatus.ACTIVE,
            discount_percentage=Decimal("0"),
        )
        self.db.add(product)
        self.db.flush()
        return product

    def _write_product_folder(self, product_id: int, *, missing: str | None = None, duplicate: str | None = None) -> Path:
        folder = self.product_media_dir / f"PRD-{product_id:03d}"
        folder.mkdir(parents=True)
        for kind in ("original", "thumb", "card", "detail"):
            if kind == missing:
                continue
            Image.new("RGB", (40, 30), color="red").save(folder / f"opaque-name-{kind}.webp", "WEBP")
        if duplicate:
            Image.new("RGB", (20, 10), color="blue").save(folder / f"another-name-{duplicate}.webp", "WEBP")
        return folder

    def _patched_migration(self) -> ExitStack:
        stack = ExitStack()
        stack.enter_context(mock.patch.object(migration, "UPLOADS_ROOT", self.uploads_root))
        stack.enter_context(mock.patch.object(migration, "PRODUCT_MEDIA_DIR", self.product_media_dir))
        stack.enter_context(mock.patch.object(migration, "SessionLocal", return_value=Session(self.engine)))
        return stack

    @staticmethod
    def _file_state(folder: Path) -> dict[str, tuple[str, int]]:
        return {
            path.name: (hashlib.sha256(path.read_bytes()).hexdigest(), path.stat().st_mtime_ns)
            for path in folder.iterdir()
            if path.is_file()
        }

    def test_apply_registers_existing_files_without_changing_them_and_is_idempotent(self):
        product = self._product()
        self.db.commit()
        folder = self._write_product_folder(product.id)
        before = self._file_state(folder)

        with self._patched_migration():
            first = migration.migrate_product_images_to_media(apply=True)
            checked = migration.migrate_product_images_to_media(apply=False)
            second = migration.migrate_product_images_to_media(apply=True)

        self.assertEqual(first, migration.MigrationSummary(1, 1, 3, 1))
        self.assertEqual(checked, first)
        self.assertEqual(second, first)
        self.assertEqual(self._file_state(folder), before)

        with Session(self.engine) as db:
            db.info["organization_id"] = self.organization_id
            media = db.scalar(select(Media))
            variants = db.scalars(select(MediaVariant).order_by(MediaVariant.kind)).all()
            link = db.scalar(select(ProductMedia))
            self.assertIsNotNone(media)
            self.assertEqual(media.owner_type, MediaOwnerType.PRODUCT)
            self.assertTrue(media.storage_key.endswith("opaque-name-original.webp"))
            self.assertEqual({variant.kind for variant in variants}, {
                MediaVariantKind.THUMB,
                MediaVariantKind.CARD,
                MediaVariantKind.DETAIL,
            })
            self.assertEqual(link.product_id, product.id)
            self.assertEqual(link.sort_order, 0)
            self.assertTrue(link.is_primary)
            self.assertEqual(db.scalar(select(func.count()).select_from(Media)), 1)
            self.assertEqual(db.scalar(select(func.count()).select_from(MediaVariant)), 3)
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductMedia)), 1)

    def test_product_without_folder_is_left_without_media(self):
        self._product()
        self.db.commit()

        with self._patched_migration():
            summary = migration.migrate_product_images_to_media(apply=True)

        self.assertEqual(summary, migration.MigrationSummary(0, 0, 0, 0))
        with Session(self.engine) as db:
            db.info["organization_id"] = self.organization_id
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductMedia)), 0)

    def test_folder_without_product_fails_before_database_writes(self):
        self._write_product_folder(999)

        with self._patched_migration():
            with self.assertRaisesRegex(migration.MediaMigrationError, "no matching product"):
                migration.migrate_product_images_to_media(apply=True)

        with Session(self.engine) as db:
            db.info["organization_id"] = self.organization_id
            self.assertEqual(db.scalar(select(func.count()).select_from(Media)), 0)

    def test_missing_or_duplicate_variant_fails(self):
        product = self._product()
        self.db.commit()
        self._write_product_folder(product.id, missing="detail")

        with self._patched_migration():
            with self.assertRaisesRegex(migration.MediaMigrationError, "detail"):
                migration.discover_product_folders()

        for path in (self.product_media_dir / f"PRD-{product.id:03d}").iterdir():
            path.unlink()
        (self.product_media_dir / f"PRD-{product.id:03d}").rmdir()
        self._write_product_folder(product.id, duplicate="thumb")
        with self._patched_migration():
            with self.assertRaisesRegex(migration.MediaMigrationError, "thumb"):
                migration.discover_product_folders()

    def test_apply_repairs_partial_records_and_removes_stale_product_media(self):
        product = self._product()
        product_without_folder = self._product()
        self.db.commit()
        folder = self._write_product_folder(product.id)

        original_path = folder / "opaque-name-original.webp"
        stale_media = Media(
            owner_type=MediaOwnerType.PRODUCT,
            original_filename="stale.webp",
            content_type="image/webp",
            storage_key="products/stale/original.webp",
            public_url="/uploads/products/stale/original.webp",
        )
        partial_media = Media(
            owner_type=MediaOwnerType.PRODUCT,
            original_filename=original_path.name,
            content_type="image/webp",
            storage_key=f"products/PRD-{product.id:03d}/{original_path.name}",
            public_url="/wrong",
        )
        self.db.add_all([stale_media, partial_media])
        self.db.flush()
        self.db.add(ProductMedia(product_id=product_without_folder.id, media_id=stale_media.id, sort_order=0, is_primary=True))
        self.db.commit()

        with self._patched_migration():
            migration.migrate_product_images_to_media(apply=True)
            migration.migrate_product_images_to_media(apply=False)

        with Session(self.engine) as db:
            db.info["organization_id"] = self.organization_id
            media = db.scalars(select(Media)).all()
            links = db.scalars(select(ProductMedia)).all()
            self.assertEqual(len(media), 1)
            self.assertEqual(media[0].id, partial_media.id)
            self.assertEqual(media[0].public_url, f"/uploads/products/PRD-{product.id:03d}/{original_path.name}")
            self.assertEqual(len(media[0].variants), 3)
            self.assertEqual(len(links), 1)
            self.assertEqual(links[0].product_id, product.id)


if __name__ == "__main__":
    unittest.main()
