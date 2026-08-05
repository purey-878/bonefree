"""
Migration script to add deleted_at column to produto table.
Run this once to update the database schema.
"""
from database import engine
from sqlalchemy import text

def migrate_add_deleted_at():
    """Add deleted_at column to produto table if it doesn't exist."""
    with engine.connect() as connection:
        try:
            # Check if column exists
            result = connection.execute(text(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='produto' AND COLUMN_NAME='deleted_at'"
            ))
            
            if result.fetchone():
                print("Column 'deleted_at' already exists")
                return
            
            # Add column
            connection.execute(text(
                "ALTER TABLE produto ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL AFTER status"
            ))
            connection.commit()
            print("✓ Successfully added 'deleted_at' column to produto table")
            
        except Exception as e:
            print(f"✗ Error: {str(e)}")
            connection.rollback()

if __name__ == "__main__":
    migrate_add_deleted_at()
