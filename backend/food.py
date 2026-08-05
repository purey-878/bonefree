from sqlalchemy import text
from database import engine

columns = [
    "ALTER TABLE produto ADD COLUMN gluten_free INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE produto ADD COLUMN contains_alcohol INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE produto ADD COLUMN deleted_at DATETIME",
    "ALTER TABLE produto ADD COLUMN total_calorias NUMERIC(10,2)",
]

with engine.connect() as conn:
    for sql in columns:
        try:
            conn.execute(text(sql))
            print(f"✓ {sql}")
        except Exception as e:
            print(f"✗ Skipped (already exists?): {e}")
    conn.commit()

print("Done!")