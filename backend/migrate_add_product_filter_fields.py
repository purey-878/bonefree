"""Migration script to add product dietary/drink filter columns.

Usage:
    python migrate_add_product_filter_fields.py
"""

from sqlalchemy import inspect, text

from database import engine


def migrate() -> None:
    inspector = inspect(engine)

    with engine.begin() as conn:
        if not inspector.has_table("produto"):
            print("produto table not found")
            return

        columns = {column["name"] for column in inspector.get_columns("produto")}

        if "gluten_free" not in columns:
            conn.execute(text("ALTER TABLE produto ADD COLUMN gluten_free INTEGER NOT NULL DEFAULT 0"))
            print("added produto.gluten_free")

        if "contains_alcohol" not in columns:
            conn.execute(text("ALTER TABLE produto ADD COLUMN contains_alcohol INTEGER NOT NULL DEFAULT 0"))
            print("added produto.contains_alcohol")

    print("product filter fields migrated")


if __name__ == "__main__":
    migrate()
