from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

from scripts.db_console import database_url_for_mode, open_console_session, print_result


class DatabaseConsoleTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = TemporaryDirectory()
        database_path = Path(self.temporary_directory.name) / "console.db"
        self.database_url = f"sqlite:///{database_path.as_posix()}"
        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE sample (id INTEGER PRIMARY KEY, name TEXT)"))
            connection.execute(text("INSERT INTO sample (id, name) VALUES (1, 'original')"))
        engine.dispose()

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_read_only_mode_is_enforced_by_sqlite_connection(self):
        with open_console_session(self.database_url) as (db, _url):
            self.assertEqual(
                db.scalar(text("SELECT name FROM sample WHERE id = 1")),
                "original",
            )
            with self.assertRaises(OperationalError):
                db.execute(text("UPDATE sample SET name = 'changed' WHERE id = 1"))
            db.rollback()

        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            self.assertEqual(
                connection.scalar(text("SELECT name FROM sample WHERE id = 1")),
                "original",
            )
        engine.dispose()

    def test_write_mode_commits_only_when_requested(self):
        with open_console_session(self.database_url, write=True) as (db, _url):
            db.execute(text("UPDATE sample SET name = 'committed' WHERE id = 1"))
            db.commit()

        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            self.assertEqual(
                connection.scalar(text("SELECT name FROM sample WHERE id = 1")),
                "committed",
            )
        engine.dispose()

    def test_postgresql_write_mode_requires_and_uses_fresh_password(self):
        prompts: list[str] = []

        url = database_url_for_mode(
            "postgresql+psycopg2://console:configured@postgres/database",
            write=True,
            password_prompt=lambda prompt: prompts.append(prompt) or "typed-secret",
        )

        self.assertEqual(url.password, "typed-secret")
        self.assertEqual(prompts, ["PostgreSQL password: "])

    def test_postgresql_write_mode_rejects_empty_password(self):
        with self.assertRaisesRegex(ValueError, "password is required"):
            database_url_for_mode(
                "postgresql://console:configured@postgres/database",
                write=True,
                password_prompt=lambda _prompt: "",
            )

    def test_read_only_mode_never_prompts_for_database_password(self):
        url = database_url_for_mode(
            "postgresql://console:configured@postgres/database",
            write=False,
            password_prompt=lambda _prompt: self.fail("Password prompt should not run"),
        )
        self.assertEqual(url.password, "configured")

    def test_result_renderer_accepts_orm_style_result_without_returns_rows(self):
        class ExampleRow:
            _mapping = {"id": 1, "name": "example"}

        class ORMStyleResult:
            def fetchmany(self, _limit):
                return [ExampleRow()]

        output: list[str] = []
        print_result(
            ORMStyleResult(),  # type: ignore[arg-type]
            display_limit=100,
            output=output.append,
        )

        self.assertIn("id", output[0])
        self.assertIn("example", "\n".join(output))


if __name__ == "__main__":
    unittest.main()
