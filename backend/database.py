from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.event import listens_for
from sqlalchemy.orm import Session, sessionmaker, with_loader_criteria
from sqlalchemy.pool import StaticPool

from core.base import Base, OrganizationModel
from core.config import Settings, settings

DATABASE_URL = settings.database_url


def build_engine_kwargs(
    database_url: str,
    app_settings: Settings = settings,
) -> dict[str, Any]:
    parsed_url = make_url(database_url)

    if parsed_url.get_backend_name() == "sqlite":
        sqlite_connect_args = {"check_same_thread": False}

        if (
            database_url in {"sqlite://", "sqlite:///:memory:"}
            or parsed_url.database == ":memory:"
            or ":memory:" in database_url
        ):
            return {
                "connect_args": sqlite_connect_args,
                "poolclass": StaticPool,
                "echo": False,
            }

        if parsed_url.database:
            Path(parsed_url.database).parent.mkdir(parents=True, exist_ok=True)

        return {
            "connect_args": sqlite_connect_args,
            "echo": False,
        }

    return {
        "pool_size": app_settings.database_pool_size,
        "max_overflow": app_settings.database_max_overflow,
        "pool_pre_ping": app_settings.database_pool_pre_ping,
        "pool_recycle": app_settings.database_pool_recycle_seconds,
        "pool_timeout": app_settings.database_pool_timeout_seconds,
        "echo": False,
        "connect_args": {
            "connect_timeout": app_settings.database_connect_timeout_seconds,
        },
    }


database_url = make_url(DATABASE_URL)
engine = create_engine(DATABASE_URL, **build_engine_kwargs(DATABASE_URL))


@listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, _connection_record):
    if database_url.get_backend_name() == "sqlite":
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@listens_for(Session, "do_orm_execute")
def add_organization_scope(execute_state) -> None:
    if (
        not execute_state.is_select
        or execute_state.is_column_load
        or execute_state.is_relationship_load
        or execute_state.execution_options.get("skip_organization_scope")
    ):
        return

    organization_id = execute_state.session.info.get("organization_id")
    if organization_id is None:
        tenant_entities = {
            description.get("entity")
            for description in getattr(execute_state.statement, "column_descriptions", ())
            if isinstance(description.get("entity"), type)
            and issubclass(description["entity"], OrganizationModel)
        }
        if tenant_entities:
            raise RuntimeError(
                "Organization context is required for tenant-scoped queries."
            )
        return

    execute_state.statement = execute_state.statement.options(
        with_loader_criteria(
            OrganizationModel,
            lambda model: model.organization_id == organization_id,
            include_aliases=True,
        )
    )


@listens_for(Session, "before_flush")
def assign_and_validate_organization_id(session: Session, _flush_context, _instances) -> None:
    if session.info.get("skip_organization_scope"):
        return

    scoped_instances = {
        instance
        for collection in (session.new, session.dirty, session.deleted)
        for instance in collection
        if isinstance(instance, OrganizationModel)
    }
    if not scoped_instances:
        return

    organization_id = session.info.get("organization_id")
    if organization_id is None:
        raise RuntimeError("Organization context is required for tenant-scoped writes.")

    for instance in scoped_instances:
        instance_organization_id = getattr(instance, "organization_id", None)
        if instance in session.new and instance_organization_id is None:
            instance.organization_id = organization_id
            continue
        if instance_organization_id != organization_id:
            raise RuntimeError("Tenant-scoped write does not match the current organization.")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
