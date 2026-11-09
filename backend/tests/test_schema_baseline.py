import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

import migrations
from database import Base
import models  # noqa: F401 - register every model in Base.metadata.


BACKEND_DIR = Path(__file__).resolve().parents[1]
BASELINE_REVISION = "20260822_0001"
HEAD_REVISION = "20261108_0004"
LEGACY_HEAD_REVISION = "b6d8f0a2c4e7"


class SchemaBaselineTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary_directory.name) / "baseline.db"
        self.database_url = f"sqlite:///{self.database_path.as_posix()}"

    def tearDown(self):
        self.temporary_directory.cleanup()

    def _alembic(
        self,
        *arguments: str,
        database_url: str | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        environment = os.environ.copy()
        environment.update(
            {
                "AUTO_APPLY_MIGRATIONS": "false",
                "DATABASE_URL": database_url or self.database_url,
                "ENVIRONMENT": "test",
            }
        )
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", *arguments],
            cwd=BACKEND_DIR,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        if check and result.returncode:
            self.fail(
                f"Alembic {' '.join(arguments)} failed.\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        return result

    def _assert_schema_matches_models(self, database_url: str) -> None:
        engine = create_engine(database_url)
        try:
            with engine.connect() as connection:
                context = MigrationContext.configure(
                    connection,
                    opts={"compare_type": True, "target_metadata": Base.metadata},
                )
                self.assertEqual(compare_metadata(context, Base.metadata), [])
        finally:
            engine.dispose()

    def test_history_preserves_the_static_baseline_and_adds_translations(self):
        engine = create_engine("sqlite://")
        connection = engine.connect()
        config = migrations._alembic_config(connection)
        try:
            scripts = ScriptDirectory.from_config(config)
            revisions = list(scripts.walk_revisions())
        finally:
            connection.close()
            engine.dispose()

        self.assertEqual([revision.revision for revision in revisions], [HEAD_REVISION, "20261108_0003", "20261103_0002", BASELINE_REVISION])
        self.assertEqual(revisions[0].down_revision, "20261108_0003")
        self.assertEqual(revisions[2].down_revision, BASELINE_REVISION)
        self.assertIsNone(revisions[-1].down_revision)
        baseline_source = Path(revisions[-1].path).read_text(encoding="utf-8")
        self.assertNotIn("Base.metadata", baseline_source)
        self.assertNotIn("product_image", baseline_source)

    def test_sqlite_upgrade_is_idempotent_matches_models_and_downgrades(self):
        self._alembic("upgrade", "head")
        self._alembic("upgrade", "head")

        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                inspector = inspect(connection)
                self.assertEqual(
                    connection.scalar(text("SELECT version_num FROM alembic_version")),
                    HEAD_REVISION,
                )
                self.assertEqual(
                    set(inspector.get_table_names()) - {"alembic_version"},
                    set(Base.metadata.tables),
                )
                self.assertNotIn("product_image", inspector.get_table_names())
                self.assertNotIn(
                    "image",
                    {column["name"] for column in inspector.get_columns("product")},
                )
        finally:
            engine.dispose()

        self._assert_schema_matches_models(self.database_url)
        self._alembic("downgrade", "base")

        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                self.assertEqual(
                    set(inspect(connection).get_table_names()),
                    {"alembic_version"},
                )
        finally:
            engine.dispose()

        self._alembic("upgrade", "head")
        self._assert_schema_matches_models(self.database_url)

    def test_startup_rejects_the_archived_head_revision(self):
        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "CREATE TABLE alembic_version "
                        "(version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
                    )
                )
                connection.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                    {"revision": LEGACY_HEAD_REVISION},
                )

            with patch.object(migrations, "engine", engine):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "unknown revision 'b6d8f0a2c4e7'",
                ):
                    migrations.run_migrations()
        finally:
            engine.dispose()

    def test_translation_upgrade_preserves_populated_catalog_and_repeated_startup(self):
        from sqlalchemy.orm import Session
        from models import User, Category, Ingredient, Product, ProductTranslation
        from schemas.enums import UserRole, UserStatus, EntityStatus, IngredientType
        from sqlalchemy import select, func

        self._alembic("upgrade", BASELINE_REVISION)
        engine = create_engine(self.database_url)
        try:
            with Session(engine) as db:
                owner = User(name="Owner", email="owner@example.test", password="unchanged-hash", role=UserRole.OWNER, status=UserStatus.ACTIVE)
                db.add(owner)
                db.flush()
                category = Category(category_name="Pratos", category_description="Original category", admin_id=owner.id, status=EntityStatus.ACTIVE)
                ingredient = Ingredient(name="Cogumelo", type=IngredientType.NORMAL, status=EntityStatus.ACTIVE, available=True, calories_per_gram=2)
                db.add_all([category, ingredient])
                db.flush()
                product = Product(name="Cogumelos", product_description="Original description", category_id=category.id, admin_id=owner.id, price=12.5, status=EntityStatus.ACTIVE, total_calories=100)
                db.add(product)
                db.flush()
                identifiers = (owner.id, category.id, ingredient.id, product.id)
                db.commit()
            with patch.object(migrations, "engine", engine):
                migrations.run_migrations()
                migrations.run_migrations()
            with Session(engine) as db:
                self.assertEqual(db.get(User, identifiers[0]).password, "unchanged-hash")
                self.assertEqual(db.get(Category, identifiers[1]).category_description, "Original category")
                self.assertEqual(db.get(Ingredient, identifiers[2]).name, "Cogumelo")
                product = db.get(Product, identifiers[3])
                self.assertEqual((product.name, product.product_description, float(product.price), float(product.total_calories)), ("Cogumelos", "Original description", 12.5, 100))
                self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 0)
        finally:
            engine.dispose()

    def test_pricing_migration_repeated_upgrade_and_feature_only_downgrade(self):
        from sqlalchemy.orm import Session
        from models import User, Category, Product, ProductPricingOption, ProductPricingOptionTranslation
        from schemas.enums import UserRole, UserStatus, EntityStatus
        self._alembic("upgrade", "head")
        engine = create_engine(self.database_url)
        try:
            with Session(engine) as db:
                owner = User(name="Owner", email="pricing@example.test", password="preserved", role=UserRole.OWNER, status=UserStatus.ACTIVE)
                db.add(owner)
                db.flush()
                category = Category(category_name="Food", admin_id=owner.id, status=EntityStatus.ACTIVE)
                db.add(category)
                db.flush()
                product = Product(name="Legacy", category_id=category.id, admin_id=owner.id, price=12.5, status=EntityStatus.ACTIVE)
                product.pricing_options = [ProductPricingOption(label="3 peças", price=8.5, kind="portion", display_order=0, is_available=True,
                    translations=[ProductPricingOptionTranslation(locale="en-GB", name="3 pieces")])]
                db.add(product)
                db.flush()
                product_id = product.id
                db.commit()
            self._alembic("upgrade", "head")
            with Session(engine) as db:
                product = db.get(Product, product_id)
                self.assertEqual(len(product.pricing_options), 1)
                self.assertEqual(product.pricing_options[0].translations[0].name, "3 pieces")
            self._alembic("downgrade", "20261103_0002")
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT name, price FROM product WHERE id = :id"), {"id": product_id}).one(), ("Legacy", 12.5))
                self.assertNotIn("product_pricing_option", inspect(connection).get_table_names())
                self.assertIn("product_customization_option", inspect(connection).get_table_names())
            self._alembic("upgrade", "head")
            self._assert_schema_matches_models(self.database_url)
            with Session(engine) as db:
                self.assertEqual(db.get(Product, product_id).pricing_options, [])
        finally:
            engine.dispose()

    def test_startup_upgrades_empty_and_recognized_databases(self):
        engine = create_engine(self.database_url)
        try:
            with patch.object(migrations, "engine", engine):
                migrations.run_migrations()
                migrations.run_migrations()

            with engine.connect() as connection:
                self.assertEqual(
                    connection.scalar(text("SELECT version_num FROM alembic_version")),
                    HEAD_REVISION,
                )
        finally:
            engine.dispose()

    def test_startup_rejects_a_nonempty_unversioned_database(self):
        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("CREATE TABLE unexpected (id INTEGER PRIMARY KEY)"))

            with patch.object(migrations, "engine", engine):
                with self.assertRaisesRegex(RuntimeError, "has no alembic_version"):
                    migrations.run_migrations()
        finally:
            engine.dispose()

    @unittest.skipUnless(
        os.environ.get("TEST_POSTGRES_DATABASE_URL"),
        "TEST_POSTGRES_DATABASE_URL is required for the PostgreSQL baseline test",
    )
    def test_clean_postgresql_install_reaches_the_baseline(self):
        database_url = os.environ["TEST_POSTGRES_DATABASE_URL"]
        engine = create_engine(database_url)
        try:
            with engine.connect() as connection:
                self.assertEqual(connection.scalar(text("SELECT current_database()")), "bonefree_test")
                self.assertIn(engine.url.host, {"localhost", "127.0.0.1", "postgres"})
            with engine.begin() as connection:
                connection.execute(text("DROP SCHEMA public CASCADE"))
                connection.execute(text("CREATE SCHEMA public"))
        finally:
            engine.dispose()

        self._alembic("upgrade", "head", database_url=database_url)
        self._alembic("upgrade", "head", database_url=database_url)
        self._assert_schema_matches_models(database_url)

        engine = create_engine(database_url)
        try:
            with engine.connect() as connection:
                self.assertEqual(
                    connection.scalar(text("SELECT version_num FROM alembic_version")),
                    HEAD_REVISION,
                )
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
