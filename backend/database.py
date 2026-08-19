from pathlib import Path
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.event import listens_for
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

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
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
