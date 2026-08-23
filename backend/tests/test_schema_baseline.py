import os
import json
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
HEAD_REVISION = "20260823_0002"
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

    def test_history_preserves_the_static_baseline_and_adds_tenancy(self):
        engine = create_engine("sqlite://")
        connection = engine.connect()
        config = migrations._alembic_config(connection)
        try:
            scripts = ScriptDirectory.from_config(config)
            revisions = list(scripts.walk_revisions())
        finally:
            connection.close()
            engine.dispose()

        self.assertEqual(
            [revision.revision for revision in revisions],
            [HEAD_REVISION, BASELINE_REVISION],
        )
        self.assertEqual(revisions[0].down_revision, BASELINE_REVISION)
        self.assertIsNone(revisions[1].down_revision)
        baseline_source = Path(revisions[1].path).read_text(encoding="utf-8")
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

    def test_tenancy_upgrade_preserves_legacy_profile_and_backfills_rows(self):
        self._alembic("upgrade", BASELINE_REVISION)
        engine = create_engine(self.database_url)
        now = "2026-08-23 12:00:00"
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO company_config "
                        "(company_name, company_tax_id, address, postal_code, city, country, email, phone, created_at, updated_at) "
                        "VALUES (:name, :tax_id, :address, :postal_code, :city, :country, :email, :phone, :now, :now)"
                    ),
                    {
                        "name": "Bonefree Legacy, Lda.",
                        "tax_id": "501964843",
                        "address": "Legacy street 1",
                        "postal_code": "1000-001",
                        "city": "Lisbon",
                        "country": "Portugal",
                        "email": "legacy@example.com",
                        "phone": "912345678",
                        "now": now,
                    },
                )
                connection.execute(
                    text(
                        "INSERT INTO site_setting (key, value, created_at, updated_at) "
                        "VALUES (:key, :value, :now, :now)"
                    ),
                    {
                        "key": "company_details",
                        "value": json.dumps({
                            "brand_name": "BONEFREE",
                            "email": "site@example.com",
                            "phone": "999999999",
                            "address": "Site street 2",
                            "description": "Restaurant description",
                        }),
                        "now": now,
                    },
                )
                connection.execute(
                    text(
                        "INSERT INTO ingredient "
                        "(name, type, status, available, created_at, updated_at) "
                        "VALUES ('Legacy ingredient', 'base', 'active', 1, :now, :now)"
                    ),
                    {"now": now},
                )
        finally:
            engine.dispose()

        self._alembic("upgrade", "head")
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                profile = connection.execute(
                    text(
                        "SELECT display_name, legal_name, tax_id, address_line_1, email, description, currency_code "
                        "FROM organization_profile"
                    )
                ).mappings().one()
                self.assertEqual(profile["display_name"], "BONEFREE")
                self.assertEqual(profile["legal_name"], "Bonefree Legacy, Lda.")
                self.assertEqual(profile["tax_id"], "501964843")
                self.assertEqual(profile["address_line_1"], "Legacy street 1")
                self.assertEqual(profile["email"], "legacy@example.com")
                self.assertEqual(profile["description"], "Restaurant description")
                self.assertEqual(profile["currency_code"], "EUR")
                domains = set(connection.scalars(text("SELECT domain FROM organization_domain")))
                self.assertEqual(
                    domains,
                    {"bonefree.pt", "www.bonefree.pt", "bonefree.localhost", "127.0.0.1"},
                )
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM ingredient")), 1)
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM ingredient WHERE organization_id IS NULL")), 0)
                self.assertEqual(connection.execute(text("PRAGMA foreign_key_check")).fetchall(), [])
        finally:
            engine.dispose()

    def test_tenancy_upgrade_aborts_when_multiple_company_profiles_exist(self):
        self._alembic("upgrade", BASELINE_REVISION)
        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO company_config "
                        "(company_name, company_tax_id, country, created_at, updated_at) "
                        "VALUES (:name, :tax, 'Portugal', :now, :now)"
                    ),
                    [
                        {"name": "First", "tax": "111", "now": "2026-08-23 12:00:00"},
                        {"name": "Second", "tax": "222", "now": "2026-08-23 12:00:00"},
                    ],
                )
        finally:
            engine.dispose()

        result = self._alembic("upgrade", "head", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "more than one legacy row exists",
            f"{result.stdout}\n{result.stderr}",
        )

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
