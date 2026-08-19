"""Add session tables

Revision ID: 16a66bc997c1
Revises: 1a1dfbbf18d8
Create Date: 2026-08-19 17:13:03.120940
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "16a66bc997c1"
down_revision: Union[str, None] = "1a1dfbbf18d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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


def _drop_index_if_exists(table_name: str, index_name: str) -> None:
    if _index_exists(table_name, index_name):
        op.drop_index(index_name, table_name=table_name)


def _create_index_if_missing(
    index_name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
) -> None:
    if not _table_exists(table_name):
        return

    if any(not _column_exists(table_name, column) for column in columns):
        return

    if not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _create_admin_session_table() -> None:
    if _table_exists("admin_session"):
        return

    op.create_table(
        "admin_session",
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("revoked", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["admin.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_session_table() -> None:
    if _table_exists("session"):
        if not _column_exists("session", "customer_id"):
            if _column_exists("session", "id_cliente"):
                op.alter_column("session", "id_cliente", new_column_name="customer_id")
            else:
                op.add_column("session", sa.Column("customer_id", sa.Integer(), nullable=True))
        return

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


def upgrade() -> None:
    """Upgrade schema."""
    _create_admin_session_table()
    _create_index_if_missing(
        "ix_admin_session_admin_id",
        "admin_session",
        ["admin_id"],
    )
    _create_index_if_missing(
        "ix_admin_session_id",
        "admin_session",
        ["id"],
    )
    _create_index_if_missing(
        "ix_admin_session_token_hash",
        "admin_session",
        ["token_hash"],
        unique=True,
    )

    _create_session_table()
    _create_index_if_missing(
        "ix_session_customer_id",
        "session",
        ["customer_id"],
    )
    _create_index_if_missing(
        "ix_session_id",
        "session",
        ["id"],
    )
    _create_index_if_missing(
        "ix_session_token_hash",
        "session",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    if _table_exists("session"):
        _drop_index_if_exists("session", "ix_session_token_hash")
        _drop_index_if_exists("session", "ix_session_id")
        _drop_index_if_exists("session", "ix_session_customer_id")
        op.drop_table("session")

    if _table_exists("admin_session"):
        _drop_index_if_exists("admin_session", "ix_admin_session_token_hash")
        _drop_index_if_exists("admin_session", "ix_admin_session_id")
        _drop_index_if_exists("admin_session", "ix_admin_session_admin_id")
        op.drop_table("admin_session")