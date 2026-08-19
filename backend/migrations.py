from pathlib import Path

from alembic import command as alembic_command
from alembic.config import Config
from alembic.util.exc import CommandError
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.engine import Connection, make_url

from core.config import Settings, settings
from database import engine

ALEMBIC_INI_PATH = Path(__file__).parent / "alembic.ini"

REQUIRED_SCHEMA_OBJECTS: dict[str, set[str]] = {
    "product": set(),
    "site_setting": {"key", "value"},
}


def _alembic_config(connection: Connection) -> Config:
    config = Config(ALEMBIC_INI_PATH)
    config.set_main_option("script_location", str(Path(__file__).parent / "alembic"))
    config.attributes["connection"] = connection
    config.attributes["skip_logging_config"] = True
    return config


def is_sqlite_database_url(database_url: str) -> bool:
    return make_url(database_url).get_backend_name() == "sqlite"


def can_stamp_existing_database_without_alembic(app_settings: Settings, database_url: str) -> bool:
    return (
        app_settings.environment in {"development", "test"}
        and app_settings.dev_stamp_existing_database_without_alembic
        and is_sqlite_database_url(database_url)
    )


def _missing_required_schema_objects(connection: Connection) -> list[str]:
    inspector = sa_inspect(connection)
    table_names = set(inspector.get_table_names())
    missing_objects: list[str] = []

    for table_name, required_columns in REQUIRED_SCHEMA_OBJECTS.items():
        if table_name not in table_names:
            missing_objects.append(f"table {table_name!r}")
            continue

        column_names = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name in sorted(required_columns - column_names):
            missing_objects.append(f"column {table_name}.{column_name}")

    return missing_objects


def existing_database_matches_current_baseline(connection: Connection) -> bool:
    return not _missing_required_schema_objects(connection)


def can_recreate_incompatible_sqlite_database(app_settings: Settings, database_url: str) -> bool:
    return (
        app_settings.environment in {"development", "test"}
        and app_settings.dev_reset_database_on_migration_error
        and is_sqlite_database_url(database_url)
    )


def _drop_sqlite_database_schema(connection: Connection) -> None:
    inspector = sa_inspect(connection)
    table_names = inspector.get_table_names()
    if not table_names:
        return

    connection.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        for table_name in table_names:
            escaped_table_name = table_name.replace('"', '""')
            connection.execute(text(f'DROP TABLE IF EXISTS "{escaped_table_name}"'))
    finally:
        connection.execute(text("PRAGMA foreign_keys=ON"))


def _unsafe_migration_error(reason: str) -> RuntimeError:
    return RuntimeError(
        f"Database schema preparation failed: {reason}. "
        "Automatic migration is enabled, but the database cannot be prepared safely. "
        "For an existing database that already matches the current models, run "
        "`alembic stamp head` manually or enable "
        "DEV_STAMP_EXISTING_DATABASE_WITHOUT_ALEMBIC=true only in development/test with SQLite."
    )


def run_or_stamp_migrations() -> None:
    """Apply Alembic migrations safely.

    - Empty databases are upgraded to head.
    - Databases with alembic_version are upgraded normally.
    - Existing SQLite development/test databases without alembic_version are
      stamped as head only when required baseline tables/columns already exist.
    - Incompatible SQLite development/test databases without alembic_version are
      recreated only when the development reset safety flag is enabled.
    - Existing production databases without alembic_version fail loudly.
    """
    if not settings.auto_apply_migrations:
        return

    with engine.begin() as conn:
        alembic_config = _alembic_config(conn)
        table_names = set(sa_inspect(conn).get_table_names())
        has_alembic_version = "alembic_version" in table_names
        has_application_tables = bool(table_names - {"alembic_version"})

        if not has_alembic_version and has_application_tables:
            missing_schema_objects = _missing_required_schema_objects(conn)

            if missing_schema_objects:
                missing_description = ", ".join(missing_schema_objects)
                if not can_recreate_incompatible_sqlite_database(settings, settings.database_url):
                    raise _unsafe_migration_error(
                        "the alembic_version table is missing and the existing schema is incomplete "
                        f"or incompatible; missing: {missing_description}"
                    )

                _drop_sqlite_database_schema(conn)
            else:
                if not can_stamp_existing_database_without_alembic(settings, settings.database_url):
                    raise _unsafe_migration_error("the alembic_version table is missing")

                alembic_command.stamp(alembic_config, "head")
                return

        try:
            alembic_command.upgrade(alembic_config, "head")
        except CommandError as exc:
            raise _unsafe_migration_error(str(exc)) from exc