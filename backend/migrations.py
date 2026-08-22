from pathlib import Path

from alembic import command as alembic_command
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.script.revision import ResolutionError
from alembic.util.exc import CommandError
from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.engine import Connection

from core.config import settings
from database import engine

ALEMBIC_INI_PATH = Path(__file__).parent / "alembic.ini"
BASELINE_REVISION = "20260822_0001"


def _alembic_config(connection: Connection) -> Config:
    config = Config(ALEMBIC_INI_PATH)
    config.set_main_option("script_location", str(Path(__file__).parent / "alembic"))
    config.attributes["connection"] = connection
    config.attributes["skip_logging_config"] = True
    return config


def _upgrade_database(connection: Connection, alembic_config: Config) -> None:
    """Upgrade while allowing future SQLite migrations to rebuild FK tables."""

    is_sqlite = connection.dialect.name == "sqlite"
    if is_sqlite:
        if connection.in_transaction():
            connection.commit()
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.commit()

    try:
        alembic_command.upgrade(alembic_config, "head")
        connection.commit()
    except BaseException:
        if connection.in_transaction():
            connection.rollback()
        raise
    finally:
        if is_sqlite:
            if connection.in_transaction():
                connection.rollback()
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()


def _incompatible_database(reason: str) -> RuntimeError:
    return RuntimeError(
        f"Database is incompatible with the current Alembic baseline: {reason}. "
        "Legacy migration history is archived and is not supported by this build. "
        "Restore with the archived code or recreate the development database with "
        "`python scripts/seed_catalog.py --apply --reset --confirm-reset`."
    )


def _current_revision(connection: Connection) -> str | None:
    rows = connection.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    if len(rows) > 1:
        raise _incompatible_database("alembic_version contains multiple revisions")
    return rows[0] if rows else None


def _assert_known_revision(alembic_config: Config, revision: str) -> None:
    scripts = ScriptDirectory.from_config(alembic_config)
    try:
        resolved_revision = scripts.get_revision(revision)
    except (ResolutionError, CommandError) as exc:
        raise _incompatible_database(f"unknown revision {revision!r}") from exc
    if resolved_revision is None:
        raise _incompatible_database(f"unknown revision {revision!r}")


def run_migrations() -> None:
    """Upgrade empty or recognized databases and reject every legacy baseline."""

    if not settings.auto_apply_migrations:
        return

    with engine.connect() as connection:
        alembic_config = _alembic_config(connection)
        table_names = set(sa_inspect(connection).get_table_names())
        application_tables = table_names - {"alembic_version"}

        if "alembic_version" not in table_names:
            if application_tables:
                raise _incompatible_database("a non-empty database has no alembic_version")
        else:
            revision = _current_revision(connection)
            if revision is None and application_tables:
                raise _incompatible_database("a non-empty database has no current revision")
            if revision is not None:
                _assert_known_revision(alembic_config, revision)

        try:
            _upgrade_database(connection, alembic_config)
        except CommandError as exc:
            raise _incompatible_database(str(exc)) from exc
