"""Add nullable calorie fields to product and ingredient tables.

Run from the backend directory with:
    python migrate_add_calorie_fields.py
"""

from sqlalchemy import inspect, text

from database import engine


def migrate() -> None:
    inspector = inspect(engine)
    with engine.begin() as conn:
        if inspector.has_table("produto"):
            produto_columns = {column["name"] for column in inspector.get_columns("produto")}
            if "total_calorias" not in produto_columns:
                conn.execute(text("ALTER TABLE produto ADD COLUMN total_calorias NUMERIC(10, 2) NULL"))
                print("added produto.total_calorias")

        if inspector.has_table("ingrediente"):
            ingrediente_columns = {column["name"] for column in inspector.get_columns("ingrediente")}
            if "calorias_por_grama" not in ingrediente_columns:
                conn.execute(text("ALTER TABLE ingrediente ADD COLUMN calorias_por_grama NUMERIC(8, 4) NULL"))
                print("added ingrediente.calorias_por_grama")

    print("calorie fields migrated")


if __name__ == "__main__":
    migrate()
