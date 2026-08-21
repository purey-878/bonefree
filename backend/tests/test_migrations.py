from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from alembic.config import Config
from sqlalchemy import create_engine, event, text

from migrations import _upgrade_database


class MigrationRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        database_path = Path(self.temp_directory.name) / "migration.db"
        self.engine = create_engine(f"sqlite:///{database_path.as_posix()}")

        @event.listens_for(self.engine, "connect")
        def enable_foreign_keys(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        with self.engine.begin() as connection:
            connection.execute(text("CREATE TABLE parent (id INTEGER PRIMARY KEY)"))
            connection.execute(text(
                "CREATE TABLE child ("
                "id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL, "
                "FOREIGN KEY(parent_id) REFERENCES parent(id))"
            ))
            connection.execute(text("INSERT INTO parent (id) VALUES (1)"))
            connection.execute(text("INSERT INTO child (id, parent_id) VALUES (1, 1)"))

    def tearDown(self):
        self.engine.dispose()
        self.temp_directory.cleanup()

    def test_upgrade_suspends_sqlite_foreign_keys_before_alembic_transaction(self):
        with self.engine.connect() as connection:
            self.assertEqual(connection.scalar(text("PRAGMA foreign_keys")), 1)
            connection.execute(text("SELECT id FROM child")).all()

            def simulated_upgrade(_config, revision):
                self.assertEqual(revision, "head")
                self.assertEqual(connection.scalar(text("PRAGMA foreign_keys")), 0)
                connection.execute(text("UPDATE child SET parent_id = 999 WHERE id = 1"))
                connection.execute(text("INSERT INTO parent (id) VALUES (999)"))

            with patch("migrations.alembic_command.upgrade", side_effect=simulated_upgrade):
                _upgrade_database(connection, Config())

            self.assertEqual(connection.scalar(text("PRAGMA foreign_keys")), 1)
            self.assertEqual(connection.scalar(text("PRAGMA foreign_key_check")), None)
            self.assertEqual(connection.scalar(text("SELECT parent_id FROM child WHERE id = 1")), 999)

    def test_upgrade_restores_sqlite_foreign_keys_after_failure(self):
        with self.engine.connect() as connection:
            connection.execute(text("SELECT id FROM child")).all()

            def failing_upgrade(_config, _revision):
                self.assertEqual(connection.scalar(text("PRAGMA foreign_keys")), 0)
                raise RuntimeError("migration failed")

            with patch("migrations.alembic_command.upgrade", side_effect=failing_upgrade):
                with self.assertRaisesRegex(RuntimeError, "migration failed"):
                    _upgrade_database(connection, Config())

            self.assertEqual(connection.scalar(text("PRAGMA foreign_keys")), 1)


if __name__ == "__main__":
    unittest.main()
