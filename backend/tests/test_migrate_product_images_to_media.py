from __future__ import annotations

from contextlib import ExitStack
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from PIL import Image
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.orm import Session

from database import Base
from models import Category, Media, MediaVariant, Product, ProductImage, ProductMedia, User
from schemas.enums import EntityStatus, UserRole, UserStatus
from scripts import migrate_product_images_to_media as migration


class ProductImageMediaMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = TemporaryDirectory()
        self.root = Path(self.temp_directory.name)
        self.legacy_menu_images_root = self.root / "frontend" / "public" / "assets" / "images" / "menu-images"
        self.frontend_asset_root = self.root / "frontend" / "public" / "assets"
        self.legacy_asset_root = self.root / "public" / "assets"
        self.legacy_uploads_root = self.root / "uploads"
        self.uploads_root = self.root / "new-uploads"
        self.product_media_dir = self.uploads_root / "products"
        self.legacy_menu_images_root.mkdir(parents=True)
        self.legacy_asset_root.mkdir(parents=True)
        self.legacy_uploads_root.mkdir(parents=True)

        database_path = self.root / "migration-test.db"
        self.engine = create_engine(
            f"sqlite:///{database_path.as_posix()}",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

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

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def _product(self, *, image: str | None = None) -> Product:
        product = Product(
            name="Test product",
            product_description="Test description",
            price=Decimal("12.00"),
            available=True,
            category_id=self.category.id,
            admin_id=self.admin.id,
            image=image,
            status=EntityStatus.ACTIVE,
            discount_percentage=Decimal("0"),
        )
        self.db.add(product)
        self.db.flush()
        return product

    def _write_image(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (40, 30), color="red").save(path)

    def _patched_migration_paths(self) -> ExitStack:
        stack = ExitStack()
        stack.enter_context(mock.patch.object(migration, "LEGACY_MENU_IMAGES_ROOT", self.legacy_menu_images_root))
        stack.enter_context(mock.patch.object(migration, "LEGACY_FRONTEND_ASSET_ROOT", self.frontend_asset_root))
        stack.enter_context(mock.patch.object(migration, "LEGACY_ASSET_ROOT", self.legacy_asset_root))
        stack.enter_context(mock.patch.object(migration, "LEGACY_UPLOADS_ROOT", self.legacy_uploads_root))
        stack.enter_context(mock.patch.object(migration, "UPLOADS_ROOT", self.uploads_root))
        stack.enter_context(mock.patch.object(migration, "PRODUCT_MEDIA_DIR", self.product_media_dir))
        return stack

    def test_legacy_loader_includes_product_image_product_image_field_and_prd_files(self):
        product_with_row = self._product(image="/assets/images/menu-images/PRD-001-row.png")
        self.db.add(ProductImage(product_id=product_with_row.id, image_path="/assets/images/menu-images/PRD-001-row.png"))
        product_with_image = self._product(image="/assets/images/menu-images/PRD-002-main.png")
        file_only_product = self._product()
        self.db.commit()

        self._write_image(self.legacy_menu_images_root / "PRD-001-row.png")
        self._write_image(self.legacy_menu_images_root / "PRD-002-main.png")
        self._write_image(self.legacy_menu_images_root / f"PRD-{file_only_product.id:03d}_gallery.png")

        with self._patched_migration_paths():
            legacy_images = migration._legacy_product_images(self.db)

        self.assertEqual(
            [(item.product_id, item.source_label, item.create_product_image) for item in legacy_images],
            [
                (product_with_row.id, "product_image 1", False),
                (product_with_image.id, "product.image", True),
                (file_only_product.id, "legacy file", True),
            ],
        )

    def test_migration_creates_media_variants_and_product_image_from_product_image_field(self):
        product = self._product(image="/assets/images/menu-images/PRD-001-main.png")
        self.db.commit()
        self._write_image(self.legacy_menu_images_root / "PRD-001-main.png")

        with self._patched_migration_paths():
            with mock.patch.object(migration, "SessionLocal", return_value=Session(self.engine)):
                migration.migrate_product_images_to_media()

        with Session(self.engine) as db:
            migrated_product = db.scalar(select(Product).where(Product.id == product.id))
            product_image = db.scalar(select(ProductImage).where(ProductImage.product_id == product.id))
            media = db.scalar(select(Media).join(ProductMedia, ProductMedia.media_id == Media.id).where(ProductMedia.product_id == product.id))
            variant_count = db.scalar(select(func.count()).select_from(MediaVariant))

            self.assertIsNotNone(migrated_product)
            self.assertIsNotNone(product_image)
            self.assertIsNotNone(media)
            self.assertEqual(variant_count, 3)
            self.assertEqual(product_image.image_path, migrated_product.image)
            self.assertTrue(product_image.image_path.startswith("/uploads/products/PRD-001/legacy-product-1-image-card.webp"))
            self.assertTrue((self.product_media_dir / "PRD-001" / "legacy-product-1-image-original.webp").exists())
            self.assertTrue((self.product_media_dir / "PRD-001" / "legacy-product-1-image-card.webp").exists())

    def test_migration_reads_legacy_portuguese_tables_when_product_table_is_empty(self):
        self.db.execute(text("CREATE TABLE produto (id_produto INTEGER PRIMARY KEY, nome VARCHAR(150), imagem VARCHAR(255))"))
        self.db.execute(text("CREATE TABLE imagem_produto (id_imagem INTEGER PRIMARY KEY, id_produto INTEGER, caminho_imagem VARCHAR(255))"))
        self.db.execute(text("INSERT INTO produto (id_produto, nome, imagem) VALUES (1, 'Legacy one', 'legacy-main.png')"))
        self.db.execute(text("INSERT INTO imagem_produto (id_imagem, id_produto, caminho_imagem) VALUES (10, 1, 'PRD001_row.png')"))
        self.db.commit()
        self.db.close()
        self._write_image(self.legacy_menu_images_root / "legacy-main.png")
        self._write_image(self.legacy_menu_images_root / "PRD001_row.png")

        with self._patched_migration_paths():
            with Session(self.engine) as loader_db:
                legacy_images = migration._legacy_product_images(loader_db)
                self.assertEqual([item.source_label for item in legacy_images], ["imagem_produto 10", "produto.imagem"])
            with mock.patch.object(migration, "SessionLocal", return_value=Session(self.engine)):
                migration.migrate_product_images_to_media()

        with Session(self.engine) as db:
            media_count = db.scalar(select(func.count()).select_from(Media))
            variant_count = db.scalar(select(func.count()).select_from(MediaVariant))
            product_media_count = db.scalar(select(func.count()).select_from(ProductMedia))
            legacy_product_image_path = db.execute(text("SELECT caminho_imagem FROM imagem_produto WHERE id_imagem = 10")).scalar_one()
            legacy_product_path = db.execute(text("SELECT imagem FROM produto WHERE id_produto = 1")).scalar_one()

            self.assertEqual(media_count, 2)
            self.assertEqual(variant_count, 6)
            self.assertEqual(product_media_count, 0)
            self.assertTrue(legacy_product_image_path.startswith("/uploads/products/PRD-001/legacy-legacy-product-image-10-card.webp"))
            self.assertTrue(legacy_product_path.startswith("/uploads/products/PRD-001/legacy-legacy-product-1-image-card.webp"))


if __name__ == "__main__":
    unittest.main()
