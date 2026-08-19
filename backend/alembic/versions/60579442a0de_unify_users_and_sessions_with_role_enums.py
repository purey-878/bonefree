"""Unify users and sessions with role enums.

Revision ID: 60579442a0de
Revises: 16a66bc997c1
Create Date: 2026-08-19 19:56:04.824853
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "60579442a0de"
down_revision: Union[str, None] = "16a66bc997c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ADMIN_FK_TABLES = [
    ("category", "admin_id"),
    ("product", "admin_id"),
    ("customer_order", "admin_id"),
    ("payment", "confirmed_by_admin_id"),
    ("refund", "admin_id"),
    ("review_replies", "admin_id"),
    ("review_reactions", "admin_id"),
]

CUSTOMER_FK_TABLES = [
    ("customer_billing_address", "customer_id"),
    ("customer_loyalty", "customer_id"),
    ("coupon", "customer_id"),
    ("cart", "customer_id"),
    ("customer_order", "customer_id"),
    ("product_review", "customer_id"),
]


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in _inspector().get_indexes(table_name))


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    if not _table_exists(table_name):
        return

    if any(not _column_exists(table_name, column) for column in columns):
        return

    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _col(table_name: str, column_name: str, default_sql: str) -> str:
    return column_name if _column_exists(table_name, column_name) else default_sql


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _disable_sqlite_foreign_keys() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute(sa.text("PRAGMA foreign_keys=OFF"))


def _enable_sqlite_foreign_keys() -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute(sa.text("PRAGMA foreign_keys=ON"))


def _create_user_table() -> None:
    if _table_exists("user"):
        return

    op.create_table(
        "user",
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=True),
        sa.Column("tax_id", sa.String(length=20), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("password_reset_code_hash", sa.String(length=255), nullable=True),
        sa.Column("password_reset_expires_at", sa.DateTime(), nullable=True),
        sa.Column("password_reset_attempts", sa.Integer(), nullable=True),
        sa.Column("password_reset_verified_until", sa.DateTime(), nullable=True),
        sa.Column("password_reset_token_hash", sa.String(length=255), nullable=True),
        sa.Column("status", sa.Integer(), nullable=True),
        sa.Column(
            "role",
            sa.Enum(
                "owner",
                "manager",
                "waiter",
                "chef",
                "client",
                "super_admin",
                "staff_admin",
                "admin",
                "customer",
                name="userrole",
            ),
            nullable=False,
        ),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tax_id"),
    )


def _copy_users() -> None:
    if _table_exists("customer"):
        customer_created_at = _col("customer", "created_at", "CURRENT_TIMESTAMP")
        customer_updated_at = _col("customer", "updated_at", customer_created_at)
        op.execute(
            sa.text(
                f"""
                INSERT OR IGNORE INTO user (
                    id, name, last_name, tax_id, phone, email, password,
                    password_reset_code_hash, password_reset_expires_at,
                    password_reset_attempts, password_reset_verified_until,
                    password_reset_token_hash, status, role, created_at, updated_at
                )
                SELECT
                    id,
                    {_col("customer", "name", "''")},
                    {_col("customer", "last_name", "NULL")},
                    {_col("customer", "tax_id", "NULL")},
                    {_col("customer", "phone", "NULL")},
                    email,
                    password,
                    {_col("customer", "password_reset_code_hash", "NULL")},
                    {_col("customer", "password_reset_expires_at", "NULL")},
                    {_col("customer", "password_reset_attempts", "0")},
                    {_col("customer", "password_reset_verified_until", "NULL")},
                    {_col("customer", "password_reset_token_hash", "NULL")},
                    {_col("customer", "status", "1")},
                    'client',
                    {customer_created_at},
                    {customer_updated_at}
                FROM customer
                """
            )
        )

    if _table_exists("admin"):
        admin_created_at = _col("admin", "created_at", "CURRENT_TIMESTAMP")
        admin_updated_at = _col("admin", "updated_at", admin_created_at)
        admin_role = (
            "CASE admin.role "
            "WHEN 'super_admin' THEN 'owner' "
            "WHEN 'staff_admin' THEN 'manager' "
            "WHEN 'admin' THEN 'manager' "
            "WHEN 'chef' THEN 'chef' "
            "WHEN 'owner' THEN 'owner' "
            "WHEN 'manager' THEN 'manager' "
            "WHEN 'waiter' THEN 'waiter' "
            "ELSE 'manager' END"
            if _column_exists("admin", "role")
            else "'manager'"
        )
        op.execute(
            sa.text(
                f"""
                INSERT OR IGNORE INTO user (
                    id, name, last_name, tax_id, phone, email, password,
                    password_reset_code_hash, password_reset_expires_at,
                    password_reset_attempts, password_reset_verified_until,
                    password_reset_token_hash, status, role, created_at, updated_at
                )
                SELECT
                    (SELECT COALESCE(MAX(id), 0) FROM customer) + admin.id,
                    {_col("admin", "name", "''")},
                    NULL,
                    NULL,
                    NULL,
                    email,
                    password,
                    NULL,
                    NULL,
                    0,
                    NULL,
                    NULL,
                    {_col("admin", "status", "1")},
                    {admin_role},
                    {admin_created_at},
                    {admin_updated_at}
                FROM admin
                """
            )
        )


def _remap_admin_references() -> None:
    if not _table_exists("admin"):
        return

    offset_expr = "(SELECT COALESCE(MAX(id), 0) FROM customer)"
    for table_name, column_name in ADMIN_FK_TABLES:
        if _table_exists(table_name) and _column_exists(table_name, column_name):
            op.execute(sa.text(f"UPDATE {table_name} SET {column_name} = {offset_expr} + {column_name} WHERE {column_name} IS NOT NULL"))


def _create_or_rebuild_session_table() -> None:
    if not _table_exists("session"):
        op.create_table(
            "session",
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("revoked", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        return

    if _column_exists("session", "user_id"):
        return

    op.execute(sa.text("ALTER TABLE session RENAME TO legacy_customer_session"))
    op.create_table(
        "session",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("revoked", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    session_created_at = _col("legacy_customer_session", "created_at", "CURRENT_TIMESTAMP")
    session_updated_at = _col("legacy_customer_session", "updated_at", session_created_at)
    op.execute(
        sa.text(
            f"""
            INSERT INTO session (
                id, user_id, token_hash, expires_at, last_seen_at,
                ip_address, user_agent, revoked, created_at, updated_at
            )
            SELECT
                id,
                customer_id,
                token_hash,
                expires_at,
                {_col("legacy_customer_session", "last_seen_at", "expires_at")},
                {_col("legacy_customer_session", "ip_address", "NULL")},
                {_col("legacy_customer_session", "user_agent", "NULL")},
                {_col("legacy_customer_session", "revoked", "0")},
                {session_created_at},
                {session_updated_at}
            FROM legacy_customer_session
            WHERE customer_id IS NOT NULL
            """
        )
    )
    op.drop_table("legacy_customer_session")


def _copy_admin_sessions() -> None:
    if not _table_exists("admin_session") or not _table_exists("admin"):
        return

    admin_session_created_at = _col("admin_session", "created_at", "CURRENT_TIMESTAMP")
    admin_session_updated_at = _col("admin_session", "updated_at", admin_session_created_at)
    op.execute(
        sa.text(
            f"""
            INSERT OR IGNORE INTO session (
                user_id, token_hash, expires_at, last_seen_at,
                ip_address, user_agent, revoked, created_at, updated_at
            )
            SELECT
                (SELECT COALESCE(MAX(id), 0) FROM customer) + admin_id,
                token_hash,
                expires_at,
                {_col("admin_session", "last_seen_at", "expires_at")},
                {_col("admin_session", "ip_address", "NULL")},
                {_col("admin_session", "user_agent", "NULL")},
                {_col("admin_session", "revoked", "0")},
                {admin_session_created_at},
                {admin_session_updated_at}
            FROM admin_session
            WHERE admin_id IS NOT NULL
            """
        )
    )


def _drop_legacy_tables() -> None:
    if _table_exists("admin_session"):
        _drop_index_if_exists("admin_session", "ix_admin_session_admin_id")
        _drop_index_if_exists("admin_session", "ix_admin_session_id")
        _drop_index_if_exists("admin_session", "ix_admin_session_token_hash")
        op.drop_table("admin_session")

    if _table_exists("admin"):
        _drop_index_if_exists("admin", "ix_admin_email")
        _drop_index_if_exists("admin", "ix_admin_id")
        _drop_index_if_exists("admin", "ix___tmp_admin_app_base_model_email")
        _drop_index_if_exists("admin", "ix___tmp_admin_app_base_model_id")
        op.drop_table("admin")

    if _table_exists("customer"):
        _drop_index_if_exists("customer", "ix_customer_email")
        _drop_index_if_exists("customer", "ix_customer_id")
        _drop_index_if_exists("customer", "ix___tmp_customer_app_base_model_email")
        _drop_index_if_exists("customer", "ix___tmp_customer_app_base_model_id")
        op.drop_table("customer")


def upgrade() -> None:
    _disable_sqlite_foreign_keys()
    _create_user_table()
    _copy_users()
    _remap_admin_references()
    _create_or_rebuild_session_table()
    _copy_admin_sessions()

    _create_index_if_missing("ix_user_email", "user", ["email"], unique=True)
    _create_index_if_missing("ix_user_id", "user", ["id"])
    _create_index_if_missing("ix_user_role", "user", ["role"])
    _create_index_if_missing("ix_session_id", "session", ["id"])
    _create_index_if_missing("ix_session_token_hash", "session", ["token_hash"], unique=True)
    _create_index_if_missing("ix_session_user_id", "session", ["user_id"])

    _drop_legacy_tables()
    _enable_sqlite_foreign_keys()


def downgrade() -> None:
    _disable_sqlite_foreign_keys()

    if not _table_exists("customer"):
        op.create_table(
            "customer",
            sa.Column("name", sa.String(length=100), nullable=True),
            sa.Column("last_name", sa.String(length=100), nullable=True),
            sa.Column("tax_id", sa.String(length=20), nullable=True),
            sa.Column("phone", sa.String(length=20), nullable=True),
            sa.Column("email", sa.String(length=150), nullable=False),
            sa.Column("password", sa.String(length=255), nullable=False),
            sa.Column("password_reset_code_hash", sa.String(length=255), nullable=True),
            sa.Column("password_reset_expires_at", sa.DateTime(), nullable=True),
            sa.Column("password_reset_attempts", sa.Integer(), nullable=True),
            sa.Column("password_reset_verified_until", sa.DateTime(), nullable=True),
            sa.Column("password_reset_token_hash", sa.String(length=255), nullable=True),
            sa.Column("status", sa.Integer(), nullable=True),
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("tax_id"),
        )

    if not _table_exists("admin"):
        op.create_table(
            "admin",
            sa.Column("name", sa.String(length=100), nullable=True),
            sa.Column("email", sa.String(length=150), nullable=False),
            sa.Column("password", sa.String(length=255), nullable=False),
            sa.Column("role", sa.String(length=50), nullable=True),
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    if _table_exists("user"):
        op.execute(
            sa.text(
                """
                INSERT OR IGNORE INTO customer (
                    id, name, last_name, tax_id, phone, email, password,
                    password_reset_code_hash, password_reset_expires_at,
                    password_reset_attempts, password_reset_verified_until,
                    password_reset_token_hash, status, created_at, updated_at
                )
                SELECT
                    id, name, last_name, tax_id, phone, email, password,
                    password_reset_code_hash, password_reset_expires_at,
                    password_reset_attempts, password_reset_verified_until,
                    password_reset_token_hash, status, created_at, updated_at
                FROM user
                WHERE role IN ('client', 'customer')
                """
            )
        )

        op.execute(
            sa.text(
                """
                INSERT OR IGNORE INTO admin (
                    id, name, email, password, role, created_at, updated_at
                )
                SELECT
                    id, name, email, password,
                    CASE role
                        WHEN 'owner' THEN 'super_admin'
                        WHEN 'manager' THEN 'staff_admin'
                        WHEN 'waiter' THEN 'staff_admin'
                        WHEN 'chef' THEN 'chef'
                        ELSE role
                    END,
                    created_at, updated_at
                FROM user
                WHERE role NOT IN ('client', 'customer')
                """
            )
        )

    _create_index_if_missing("ix_customer_email", "customer", ["email"], unique=True)
    _create_index_if_missing("ix_customer_id", "customer", ["id"])
    _create_index_if_missing("ix_admin_email", "admin", ["email"], unique=True)
    _create_index_if_missing("ix_admin_id", "admin", ["id"])

    if _table_exists("session") and _column_exists("session", "user_id"):
        op.execute(sa.text("ALTER TABLE session RENAME TO unified_session"))
        op.create_table(
            "session",
            sa.Column("customer_id", sa.Integer(), nullable=False),
            sa.Column("token_hash", sa.String(length=255), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False),
            sa.Column("ip_address", sa.String(length=45), nullable=True),
            sa.Column("user_agent", sa.String(length=500), nullable=True),
            sa.Column("revoked", sa.Boolean(), server_default=sa.false(), nullable=False),
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["customer_id"], ["customer.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.execute(
            sa.text(
                """
                INSERT INTO session (
                    id, customer_id, token_hash, expires_at, last_seen_at,
                    ip_address, user_agent, revoked, created_at, updated_at
                )
                SELECT
                    unified_session.id, unified_session.user_id, unified_session.token_hash,
                    unified_session.expires_at, unified_session.last_seen_at,
                    unified_session.ip_address, unified_session.user_agent, unified_session.revoked,
                    unified_session.created_at, unified_session.updated_at
                FROM unified_session
                JOIN customer ON customer.id = unified_session.user_id
                """
            )
        )
        op.drop_table("unified_session")

    _create_index_if_missing("ix_session_customer_id", "session", ["customer_id"])
    _create_index_if_missing("ix_session_id", "session", ["id"])
    _create_index_if_missing("ix_session_token_hash", "session", ["token_hash"], unique=True)

    if _table_exists("user"):
        _drop_index_if_exists("user", "ix_user_email")
        _drop_index_if_exists("user", "ix_user_id")
        _drop_index_if_exists("user", "ix_user_role")
        op.drop_table("user")

    _enable_sqlite_foreign_keys()