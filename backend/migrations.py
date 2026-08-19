from pathlib import Path

from alembic import command as alembic_command
from alembic.config import Config
from alembic.util.exc import CommandError
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.engine import Connection, make_url

from core.config import Settings, settings
from database import engine

ALEMBIC_INI_PATH = Path(__file__).parent / "alembic.ini"


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
      stamped as head instead of recreating all tables.
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
            if not can_stamp_existing_database_without_alembic(settings, settings.database_url):
                raise _unsafe_migration_error("the alembic_version table is missing")

            alembic_command.stamp(alembic_config, "head")
            return

        try:
            alembic_command.upgrade(alembic_config, "head")
        except CommandError as exc:
            raise _unsafe_migration_error(str(exc)) from exc