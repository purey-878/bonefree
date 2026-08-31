import os
import json
from datetime import datetime
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
import sqlalchemy as sa
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session

import migrations
from database import Base
import models  # noqa: F401 - register every model in Base.metadata.


BACKEND_DIR = Path(__file__).resolve().parents[1]
BASELINE_REVISION = "20260822_0001"
TENANCY_REVISION = "20260823_0002"
EXPERIENCE_REVISION = "20260825_0003"
ADMIN_REVISION = "20260826_0004"
STR_ENUM_REVISION = "20260826_0005"
HEAD_REVISION = "20260831_0006"
LEGACY_HEAD_REVISION = "b6d8f0a2c4e7"

ENUM_COLUMN_VALUES = {
    "organization": {"organization_type": "restaurant"},
    "user": {"status": "active", "role": "owner"},
    "admin": {"status": "active"},
    "category": {"status": "active"},
    "site_setting": {"key": "site_theme"},
    "product": {"status": "active"},
    "media": {"owner_type": "product"},
    "media_variant": {"kind": "original"},
    "coupon": {"type": "fixed_value"},
    "ingredient": {"type": "normal", "status": "active"},
    "product_customization_option": {"type": "add", "status": "active"},
    "cart_product_customization": {"action": "remove_ingredient"},
    "customer_order": {
        "state": "pending",
        "payment_method": "card",
        "payment_status": "unpaid",
        "cancellation_origin": "client",
    },
    "product_review": {"status": "approved"},
    "review_reactions": {"type": "like"},
    "payment": {"method": "card", "state": "pending"},
}

POSTGRES_ENUM_TYPES = {
    "adminstatus",
    "organizationtype",
    "cancellationorigin",
    "cartcustomizationaction",
    "coupontype",
    "entitystatus",
    "ingredienttype",
    "mediaownertype",
    "mediavariantkind",
    "orderstate",
    "paymentmethod",
    "paymentstate",
    "paymentstatus",
    "productcustomizationoptiontype",
    "reviewreactiontype",
    "reviewstatus",
    "sitesettingkey",
    "userrole",
    "userstatus",
}


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

    def _insert_representative_enum_rows(self) -> None:
        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                for table_name, enum_values in ENUM_COLUMN_VALUES.items():
                    table = sa.Table(
                        table_name,
                        sa.MetaData(),
                        autoload_with=connection,
                    )
                    existing_id = connection.scalar(sa.select(table.c.id).limit(1))
                    if existing_id is not None:
                        connection.execute(
                            table.update()
                            .where(table.c.id == existing_id)
                            .values(**enum_values)
                        )
                        continue

                    values = dict(enum_values)
                    for column in table.columns:
                        if (
                            column.name in values
                            or column.primary_key
                            or column.nullable
                            or column.server_default is not None
                        ):
                            continue
                        if isinstance(column.type, sa.Boolean):
                            values[column.name] = False
                        elif isinstance(column.type, sa.DateTime):
                            values[column.name] = datetime(2026, 8, 26, 12, 0, 0)
                        elif isinstance(column.type, (sa.Integer, sa.Numeric)):
                            values[column.name] = 1
                        elif isinstance(column.type, sa.JSON):
                            values[column.name] = {}
                        else:
                            length = getattr(column.type, "length", None)
                            values[column.name] = "x" if length and length <= 3 else column.name
                    connection.execute(table.insert().values(**values))
        finally:
            engine.dispose()

    def _assert_representative_enum_values(self) -> None:
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                for table_name, enum_values in ENUM_COLUMN_VALUES.items():
                    table = sa.Table(
                        table_name,
                        sa.MetaData(),
                        autoload_with=connection,
                    )
                    row = connection.execute(
                        sa.select(*(table.c[name] for name in enum_values)).limit(1)
                    ).one()
                    self.assertEqual(tuple(row), tuple(enum_values.values()))
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
            [
                HEAD_REVISION,
                STR_ENUM_REVISION,
                ADMIN_REVISION,
                EXPERIENCE_REVISION,
                TENANCY_REVISION,
                BASELINE_REVISION,
            ],
        )
        self.assertEqual(revisions[0].down_revision, STR_ENUM_REVISION)
        self.assertEqual(revisions[1].down_revision, ADMIN_REVISION)
        self.assertEqual(revisions[2].down_revision, EXPERIENCE_REVISION)
        self.assertEqual(revisions[3].down_revision, TENANCY_REVISION)
        self.assertEqual(revisions[4].down_revision, BASELINE_REVISION)
        self.assertIsNone(revisions[5].down_revision)
        baseline_source = Path(revisions[5].path).read_text(encoding="utf-8")
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
                self.assertNotIn(
                    "organization_id",
                    {column["name"] for column in inspector.get_columns("admin")},
                )
                self.assertNotIn(
                    "organization_id",
                    {column["name"] for column in inspector.get_columns("admin_session")},
                )
                admin_session_foreign_keys = inspector.get_foreign_keys("admin_session")
                self.assertEqual(len(admin_session_foreign_keys), 1)
                self.assertEqual(admin_session_foreign_keys[0]["referred_table"], "admin")
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

    def test_global_admin_upgrade_preserves_tenant_data_and_downgrades_cleanly(self):
        self._alembic("upgrade", EXPERIENCE_REVISION)
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                organization_count = connection.scalar(text("SELECT COUNT(*) FROM organization"))
                entitlement_count = connection.scalar(
                    text("SELECT COUNT(*) FROM organization_feature_entitlement")
                )
        finally:
            engine.dispose()

        self._alembic("upgrade", STR_ENUM_REVISION)
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                inspector = inspect(connection)
                self.assertIn("admin", inspector.get_table_names())
                self.assertIn("admin_session", inspector.get_table_names())
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM admin")), 0)
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM admin_session")), 0)
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM organization")), organization_count)
                self.assertEqual(
                    connection.scalar(text("SELECT COUNT(*) FROM organization_feature_entitlement")),
                    entitlement_count,
                )
        finally:
            engine.dispose()

        self._alembic("downgrade", EXPERIENCE_REVISION)
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                tables = set(inspect(connection).get_table_names())
                self.assertNotIn("admin", tables)
                self.assertNotIn("admin_session", tables)
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM organization")), organization_count)
        finally:
            engine.dispose()

    def test_str_enum_upgrade_preserves_all_enum_families_and_is_reversible(self):
        self._alembic("upgrade", ADMIN_REVISION)
        self._insert_representative_enum_rows()

        self._alembic("upgrade", STR_ENUM_REVISION)
        self._assert_representative_enum_values()

        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                inspector = inspect(connection)
                for table_name, enum_values in ENUM_COLUMN_VALUES.items():
                    columns = {
                        column["name"]: column
                        for column in inspector.get_columns(table_name)
                    }
                    for column_name in enum_values:
                        with self.subTest(table=table_name, column=column_name):
                            self.assertIsInstance(columns[column_name]["type"], sa.String)
                            self.assertEqual(columns[column_name]["type"].length, 50)
        finally:
            engine.dispose()

        self._alembic("downgrade", ADMIN_REVISION)
        self._assert_representative_enum_values()
        self._alembic("upgrade", HEAD_REVISION)
        self._assert_representative_enum_values()
        self._assert_schema_matches_models(self.database_url)

    def test_str_enum_upgrade_rejects_unknown_values_without_changes(self):
        self._alembic("upgrade", ADMIN_REVISION)
        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE organization "
                        "SET organization_type = 'unknown'"
                    )
                )
        finally:
            engine.dispose()

        result = self._alembic("upgrade", STR_ENUM_REVISION, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "invalid organizationtype values: 'unknown'",
            f"{result.stdout}\n{result.stderr}",
        )

        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                self.assertEqual(
                    connection.scalar(text("SELECT version_num FROM alembic_version")),
                    ADMIN_REVISION,
                )
                self.assertEqual(
                    connection.scalar(
                        text("SELECT organization_type FROM organization LIMIT 1")
                    ),
                    "unknown",
                )
        finally:
            engine.dispose()

        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE organization "
                        "SET organization_type = 'restaurant'"
                    )
                )
        finally:
            engine.dispose()
        self._alembic("upgrade", STR_ENUM_REVISION)

        engine = create_engine(self.database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "UPDATE organization "
                        "SET organization_type = 'future_type'"
                    )
                )
        finally:
            engine.dispose()

        result = self._alembic("downgrade", ADMIN_REVISION, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "invalid organizationtype values: 'future_type'",
            f"{result.stdout}\n{result.stderr}",
        )
        engine = create_engine(self.database_url)
        try:
            with engine.connect() as connection:
                self.assertEqual(
                    connection.scalar(text("SELECT version_num FROM alembic_version")),
                    STR_ENUM_REVISION,
                )
                self.assertEqual(
                    connection.scalar(
                        text("SELECT organization_type FROM organization LIMIT 1")
                    ),
                    "future_type",
                )
        finally:
            engine.dispose()

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
                        "SELECT display_name, legal_name, tax_id, address_line_1, email, "
                        "privacy_contact_email, description, currency_code "
                        "FROM organization_profile"
                    )
                ).mappings().one()
                self.assertEqual(profile["display_name"], "BONEFREE")
                self.assertEqual(profile["legal_name"], "Bonefree Legacy, Lda.")
                self.assertEqual(profile["tax_id"], "501964843")
                self.assertEqual(profile["address_line_1"], "Legacy street 1")
                self.assertEqual(profile["email"], "legacy@example.com")
                self.assertEqual(profile["privacy_contact_email"], "legacy@example.com")
                self.assertEqual(profile["description"], "Restaurant description")
                self.assertEqual(profile["currency_code"], "EUR")
                domains = set(connection.scalars(text("SELECT domain FROM organization_domain")))
                self.assertEqual(
                    domains,
                    {"bonefree.pt", "www.bonefree.pt", "bonefree.localhost", "127.0.0.1"},
                )
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM ingredient")), 1)
                self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM ingredient WHERE organization_id IS NULL")), 0)
                self.assertEqual(
                    connection.scalar(text("SELECT theme_key FROM organization_experience")),
                    "bonefree",
                )
                self.assertEqual(
                    connection.scalar(
                        text(
                            "SELECT COUNT(*) FROM organization_feature_entitlement "
                            "WHERE enabled = 1"
                        )
                    ),
                    6,
                )
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

        self._alembic("upgrade", ADMIN_REVISION, database_url=database_url)
        engine = create_engine(database_url)
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "INSERT INTO admin "
                        "(name, email, password_hash, status, created_at, updated_at) "
                        "VALUES ('Platform Admin', 'admin@example.com', 'hash', "
                        "'active', :now, :now)"
                    ),
                    {"now": datetime(2026, 8, 26, 12, 0, 0)},
                )
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
                physical_columns = {
                    (row.table_name, row.column_name): (
                        row.data_type,
                        row.character_maximum_length,
                    )
                    for row in connection.execute(
                        text(
                            "SELECT table_name, column_name, data_type, "
                            "character_maximum_length "
                            "FROM information_schema.columns "
                            "WHERE table_schema = current_schema()"
                        )
                    )
                }
                for table_name, enum_values in ENUM_COLUMN_VALUES.items():
                    for column_name in enum_values:
                        self.assertEqual(
                            physical_columns[(table_name, column_name)],
                            ("character varying", 50),
                        )

                remaining_types = set(
                    connection.scalars(text("SELECT typname FROM pg_type"))
                ) & POSTGRES_ENUM_TYPES
                self.assertEqual(remaining_types, set())
                self.assertIn(
                    "restaurant",
                    connection.scalar(
                        text(
                            "SELECT column_default FROM information_schema.columns "
                            "WHERE table_schema = current_schema() "
                            "AND table_name = 'organization' "
                            "AND column_name = 'organization_type'"
                        )
                    ),
                )
                self.assertIn(
                    "active",
                    connection.scalar(
                        text(
                            "SELECT column_default FROM information_schema.columns "
                            "WHERE table_schema = current_schema() "
                            "AND table_name = 'admin' AND column_name = 'status'"
                        )
                    ),
                )
                self.assertEqual(
                    connection.scalar(text("SELECT status FROM admin")),
                    "active",
                )

            with Session(engine) as db:
                self.assertIs(
                    db.scalar(sa.select(models.Organization.organization_type)),
                    models.OrganizationType.RESTAURANT,
                )
                self.assertIs(
                    db.scalar(sa.select(models.Admin.status)),
                    models.AdminStatus.ACTIVE,
                )
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
