"""Seed the local SQLite database from the phpMyAdmin MySQL dump.

Run from the project root or backend directory:
    python backend/seed_sqlite.py
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import make_url

from database import DATABASE_URL, Base, engine
import models  # noqa: F401  Ensures SQLAlchemy registers all models.


DEFAULT_DUMP_PATH = Path(__file__).resolve().parent / "prey_rest_2.sql"
INSERT_RE = re.compile(r"INSERT\s+INTO\s+`(?P<table>[^`]+)`\s+.*?;", re.DOTALL | re.IGNORECASE)


def seed_sqlite(dump_path: Path = DEFAULT_DUMP_PATH) -> None:
    url = make_url(DATABASE_URL)
    if url.get_backend_name() != "sqlite":
        raise RuntimeError(f"Refusing to seed non-SQLite database: {DATABASE_URL}")
    if not dump_path.exists():
        raise FileNotFoundError(f"SQL dump not found: {dump_path}")

    Base.metadata.create_all(bind=engine)
    existing_tables = set(inspect(engine).get_table_names())
    dump_sql = dump_path.read_text(encoding="utf-8")

    statements = []
    skipped_tables = set()
    for match in INSERT_RE.finditer(dump_sql):
        table = match.group("table")
        if table not in existing_tables:
            skipped_tables.add(table)
            continue
        statement = re.sub(
            r"^\s*INSERT\s+INTO",
            "INSERT OR IGNORE INTO",
            match.group(0),
            count=1,
            flags=re.IGNORECASE,
        )
        statements.append((table, statement))

    raw_connection = engine.raw_connection()
    try:
        cursor = raw_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=OFF")
        loaded_by_table: dict[str, int] = {}

        for table, statement in statements:
            cursor.execute(statement)
            loaded_by_table[table] = loaded_by_table.get(table, 0) + max(cursor.rowcount, 0)

        raw_connection.commit()
        cursor.execute("PRAGMA foreign_keys=ON")
    except Exception:
        raw_connection.rollback()
        raise
    finally:
        raw_connection.close()

    for table, inserted_rows in sorted(loaded_by_table.items()):
        print(f"{table}: inserted {inserted_rows} rows")
    if skipped_tables:
        print(f"Skipped tables missing from SQLAlchemy models: {', '.join(sorted(skipped_tables))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the SQLite database from prey_rest_2.sql.")
    parser.add_argument(
        "--dump",
        type=Path,
        default=DEFAULT_DUMP_PATH,
        help=f"Path to the MySQL dump. Defaults to {DEFAULT_DUMP_PATH}",
    )
    args = parser.parse_args()
    seed_sqlite(args.dump)


if __name__ == "__main__":
    main()
