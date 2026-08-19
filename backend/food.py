from sqlalchemy import text
from database import engine

columns = [
    "ALTER TABLE product ADD COLUMN gluten_free INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE product ADD COLUMN contains_alcohol INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE product ADD COLUMN deleted_at DATETIME",
    "ALTER TABLE product ADD COLUMN total_calories NUMERIC(10,2)",
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