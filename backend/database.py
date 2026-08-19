from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.event import listens_for
from sqlalchemy.orm import declarative_base, sessionmaker

from core.config import settings

DATABASE_URL = settings.database_url

database_url = make_url(DATABASE_URL)
engine_kwargs = {}

if database_url.get_backend_name() == "sqlite":
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    if database_url.database and database_url.database != ":memory:":
        Path(database_url.database).parent.mkdir(parents=True, exist_ok=True)
else:
    engine_kwargs.update(
        pool_pre_ping=settings.database_pool_pre_ping,
        pool_recycle=settings.database_pool_recycle_seconds,
        pool_timeout=settings.database_pool_timeout_seconds,
    )

engine = create_engine(DATABASE_URL, **engine_kwargs)


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
