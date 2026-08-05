"""Normalize admin roles to super_admin/staff_admin/chef.

Run from the backend directory with:
    python migrate_admin_roles.py
"""

from sqlalchemy import inspect, text

from database import engine


def migrate() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("admin"):
        print("admin table not found")
        return

    columns = {column["name"] for column in inspector.get_columns("admin")}
    with engine.begin() as conn:
        if "role" not in columns:
            if engine.dialect.name == "mysql":
                conn.execute(text("ALTER TABLE admin ADD COLUMN role ENUM('super_admin','staff_admin','chef') NOT NULL DEFAULT 'staff_admin'"))
            else:
                conn.execute(text("ALTER TABLE admin ADD COLUMN role VARCHAR(30) NOT NULL DEFAULT 'staff_admin'"))
            print("added admin.role")
            return

        if engine.dialect.name == "mysql":
            conn.execute(text("ALTER TABLE admin MODIFY COLUMN role ENUM('admin','staff_admin','super_admin','chef') NOT NULL DEFAULT 'staff_admin'"))
            conn.execute(text("UPDATE admin SET role = 'staff_admin' WHERE role = 'admin' OR role IS NULL OR role = ''"))
            conn.execute(text("ALTER TABLE admin MODIFY COLUMN role ENUM('super_admin','staff_admin','chef') NOT NULL DEFAULT 'staff_admin'"))
        else:
            conn.execute(text("UPDATE admin SET role = 'staff_admin' WHERE role = 'admin' OR role IS NULL OR role = ''"))

    print("admin roles migrated")


if __name__ == "__main__":
    migrate()
