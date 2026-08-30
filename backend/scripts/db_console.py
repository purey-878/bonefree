r"""Interactive SQLAlchemy console with database-enforced read-only defaults.

Run from the repository root:

    .\.venv\Scripts\python.exe backend\scripts\db_console.py --organization bonefree

Inside Docker:

    docker compose exec api python scripts/db_console.py --organization bonefree

Write mode is deliberately explicit and commits remain manual:

    docker compose exec api python scripts/db_console.py --write --organization bonefree
"""

from __future__ import annotations

import argparse
import ast
import codeop
from code import InteractiveConsole
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from getpass import getpass
from pathlib import Path
import sys
from typing import Any

import sqlalchemy as sa
from sqlalchemy import and_, asc, case, create_engine, delete, desc, func, not_, or_, select, text, update
from sqlalchemy.engine import Connection, Result, URL, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.sql.base import Executable


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models as model_facade
from core.config import settings
from database import build_engine_kwargs
from models import Organization


DEFAULT_DISPLAY_LIMIT = 100
MAX_DISPLAY_LIMIT = 1_000
MAX_CELL_WIDTH = 48
POSTGRESQL_DIALECTS = {"postgres", "postgresql"}


def database_url_for_mode(
    database_url: str,
    *,
    write: bool,
    password_prompt: Callable[[str], str] = getpass,
) -> URL:
    """Return the connection URL, requiring a fresh PostgreSQL password for writes."""

    url = make_url(database_url)
    if write and url.get_backend_name() in POSTGRESQL_DIALECTS:
        supplied_password = password_prompt("PostgreSQL password: ")
        if not supplied_password:
            raise ValueError("A PostgreSQL password is required in write mode.")
        return url.set(password=supplied_password)
    return url


def _configure_read_only_connection(connection: Connection) -> None:
    dialect = connection.dialect.name
    if dialect == "sqlite":
        connection.exec_driver_sql("PRAGMA query_only = ON")
        connection.commit()
        return
    if dialect in POSTGRESQL_DIALECTS:
        connection.exec_driver_sql(
            "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY"
        )
        connection.commit()
        return
    raise RuntimeError(
        f"Read-only enforcement is not implemented for database dialect '{dialect}'."
    )


@contextmanager
def open_console_session(
    database_url: str,
    *,
    write: bool = False,
    password_prompt: Callable[[str], str] = getpass,
) -> Iterator[tuple[DBSession, URL]]:
    """Open an isolated console session and roll back pending work on exit."""

    connection_url = database_url_for_mode(
        database_url,
        write=write,
        password_prompt=password_prompt,
    )
    rendered_url = connection_url.render_as_string(hide_password=False)
    console_engine = create_engine(
        rendered_url,
        **build_engine_kwargs(rendered_url, settings),
    )
    try:
        with console_engine.connect() as connection:
            if not write:
                _configure_read_only_connection(connection)
            db = DBSession(bind=connection, autoflush=False, expire_on_commit=False)
            try:
                yield db, connection_url
            finally:
                if db.in_transaction():
                    db.rollback()
                db.close()
    finally:
        console_engine.dispose()


def _short_value(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        rendered = f"<{len(value)} bytes>"
    else:
        rendered = str(value).replace("\r", "\\r").replace("\n", "\\n")
    if len(rendered) > MAX_CELL_WIDTH:
        return f"{rendered[: MAX_CELL_WIDTH - 1]}…"
    return rendered


def _mapped_record(value: Any) -> dict[str, Any] | None:
    inspection = sa.inspect(value, raiseerr=False)
    mapper = getattr(inspection, "mapper", None)
    if mapper is None:
        return None
    return {
        attribute.key: getattr(value, attribute.key)
        for attribute in mapper.column_attrs
    }


def _record_from_row(row: Any) -> dict[str, Any]:
    mapping = getattr(row, "_mapping", None)
    if mapping is None:
        mapped = _mapped_record(row)
        return mapped if mapped is not None else {"value": row}

    values = list(mapping.values())
    if len(values) == 1:
        mapped = _mapped_record(values[0])
        if mapped is not None:
            return mapped
    return {str(key): value for key, value in mapping.items()}


def _print_records(
    records: Sequence[Mapping[str, Any]],
    *,
    truncated: bool,
    output: Callable[[str], None] = print,
) -> None:
    if not records:
        output("(0 rows)")
        return

    columns = list(records[0])
    widths = {
        column: min(
            MAX_CELL_WIDTH,
            max(
                len(column),
                *(len(_short_value(record.get(column))) for record in records),
            ),
        )
        for column in columns
    }

    def render(values: Mapping[str, Any]) -> str:
        return " | ".join(
            _short_value(values.get(column)).ljust(widths[column])
            for column in columns
        )

    output(render({column: column for column in columns}))
    output("-+-".join("-" * widths[column] for column in columns))
    for record in records:
        output(render(record))
    suffix = "+ rows not displayed" if truncated else "rows"
    output(f"({len(records)} {suffix})")


def print_result(
    result: Result[Any],
    *,
    display_limit: int,
    output: Callable[[str], None] = print,
) -> None:
    if getattr(result, "returns_rows", True) is False:
        rowcount = getattr(result, "rowcount", None)
        output(
            "Statement executed; "
            f"affected rows: {rowcount if rowcount is not None and rowcount >= 0 else 'unknown'}."
        )
        return

    rows = result.fetchmany(display_limit + 1)
    truncated = len(rows) > display_limit
    visible_rows = rows[:display_limit]
    _print_records(
        [_record_from_row(row) for row in visible_rows],
        truncated=truncated,
        output=output,
    )


def execute_console_value(
    db: DBSession,
    value: Any,
    *,
    display_limit: int,
    output: Callable[[str], None] = print,
) -> None:
    if value is None:
        return
    if isinstance(value, Executable):
        print_result(
            db.execute(value),
            display_limit=display_limit,
            output=output,
        )
        return
    if isinstance(value, Result):
        print_result(value, display_limit=display_limit, output=output)
        return

    mapped = _mapped_record(value)
    if mapped is not None:
        _print_records([mapped], truncated=False, output=output)
        return
    output(repr(value))


class SQLAlchemyConsole(InteractiveConsole):
    """Interactive console that automatically executes SQLAlchemy expressions."""

    def __init__(
        self,
        locals: dict[str, Any],
        *,
        db: DBSession,
        display_limit: int,
    ) -> None:
        super().__init__(locals=locals, filename="<db-console>")
        self.db = db
        self.display_limit = display_limit

    def runsource(
        self,
        source: str,
        filename: str = "<db-console>",
        symbol: str = "single",
    ) -> bool:
        try:
            compiled = codeop.compile_command(source, filename, "exec")
        except (OverflowError, SyntaxError, ValueError):
            self.showsyntaxerror(filename)
            return False
        if compiled is None:
            return True

        try:
            tree = ast.parse(source, filename=filename, mode="exec")
        except SyntaxError:
            self.showsyntaxerror(filename)
            return False

        if len(tree.body) == 1 and isinstance(tree.body[0], ast.Expr):
            expression = ast.Expression(tree.body[0].value)
            ast.fix_missing_locations(expression)
            try:
                value = eval(compile(expression, filename, "eval"), self.locals)
                execute_console_value(
                    self.db,
                    value,
                    display_limit=self.display_limit,
                )
            except SystemExit:
                raise
            except SQLAlchemyError as exc:
                database_message = str(getattr(exc, "orig", exc)).strip()
                self.write(
                    f"Database error: {database_message}\n"
                    "Run rollback() before the next statement if the transaction failed.\n"
                )
            except BaseException:
                self.showtraceback()
            return False

        self.runcode(compiled)
        return False


def _find_organization(db: DBSession, identifier: str | int) -> Organization:
    statement = select(Organization)
    parsed_id: int | None = None
    try:
        parsed_id = int(identifier)
    except (TypeError, ValueError):
        pass
    if parsed_id is not None:
        statement = statement.where(Organization.id == parsed_id)
    else:
        statement = statement.where(Organization.slug == str(identifier).strip())
    organization = db.scalar(
        statement.execution_options(skip_organization_scope=True)
    )
    if organization is None:
        raise ValueError(f"Organization '{identifier}' was not found.")
    return organization


def build_console_namespace(
    db: DBSession,
    *,
    write: bool,
) -> dict[str, Any]:
    def use_organization(identifier: str | int) -> Organization:
        if db.new or db.dirty or db.deleted:
            raise RuntimeError("Commit or roll back pending ORM changes before changing organization.")
        organization = _find_organization(db, identifier)
        db.info["organization_id"] = organization.id
        print(f"Organization scope: {organization.slug} (id={organization.id})")
        return organization

    def clear_organization() -> None:
        if db.new or db.dirty or db.deleted:
            raise RuntimeError("Commit or roll back pending ORM changes before clearing organization.")
        db.info.pop("organization_id", None)
        print("Organization scope cleared.")

    def current_organization() -> int | None:
        organization_id = db.info.get("organization_id")
        print(f"Organization id: {organization_id if organization_id is not None else 'none'}")
        return organization_id

    def commit() -> None:
        if not write:
            raise PermissionError("Commit is disabled in read-only mode. Restart with --write.")
        db.commit()
        print("Transaction committed.")

    def rollback() -> None:
        db.rollback()
        print("Transaction rolled back.")

    namespace: dict[str, Any] = {
        "sa": sa,
        "db": db,
        "session": db,
        "select": select,
        "update": update,
        "delete": delete,
        "text": text,
        "func": func,
        "case": case,
        "and_": and_,
        "or_": or_,
        "not_": not_,
        "asc": asc,
        "desc": desc,
        "use_organization": use_organization,
        "clear_organization": clear_organization,
        "current_organization": current_organization,
        "commit": commit,
        "rollback": rollback,
    }
    namespace.update(
        {
            model_name: getattr(model_facade, model_name)
            for model_name in model_facade.__all__
        }
    )
    return namespace


def _banner(*, write: bool, database_url: URL, display_limit: int) -> str:
    mode = "WRITE — explicit commit required" if write else "READ ONLY — enforced by database connection"
    write_help = (
        "  update(Product).where(Product.id == 1).values(available=False)\n"
        "  commit()  # or rollback()"
        if write
        else "  Restart with --write to enable mutations."
    )
    return f"""
SQLAlchemy database console
Mode: {mode}
Database: {database_url.render_as_string(hide_password=True)}
Display limit: {display_limit} rows

Examples:
  select(Organization).where(Organization.id == 1)
  use_organization('bonefree')
  select(Product).where(Product.available.is_(True)).limit(20)
  db.scalar(select(func.count()).select_from(Order))
{write_help}

Helpers: use_organization(), clear_organization(), current_organization(),
         commit(), rollback(), db/session, select(), text(), func(), update(), delete().
Use Ctrl+D (Linux/macOS) or Ctrl+Z then Enter (Windows) to exit.
Any uncommitted transaction is rolled back on exit.
""".strip()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Open an interactive SQLAlchemy console (read-only by default)."
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Enable mutations. PostgreSQL requires its password and commits remain manual.",
    )
    parser.add_argument(
        "--organization",
        help="Initial organization slug or numeric ID for tenant-scoped models.",
    )
    parser.add_argument(
        "--display-limit",
        type=int,
        default=DEFAULT_DISPLAY_LIMIT,
        choices=range(1, MAX_DISPLAY_LIMIT + 1),
        metavar="1..1000",
        help=f"Maximum displayed rows per result (default: {DEFAULT_DISPLAY_LIMIT}).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        with open_console_session(
            settings.database_url,
            write=args.write,
        ) as (db, connection_url):
            namespace = build_console_namespace(db, write=args.write)
            if args.organization:
                namespace["use_organization"](args.organization)
            SQLAlchemyConsole(
                namespace,
                db=db,
                display_limit=args.display_limit,
            ).interact(
                banner=_banner(
                    write=args.write,
                    database_url=connection_url,
                    display_limit=args.display_limit,
                ),
                exitmsg="Database console closed.",
            )
    except (SQLAlchemyError, RuntimeError, ValueError) as exc:
        print(f"Database console error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
