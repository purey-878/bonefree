"""Add global platform administrators and sessions.

Revision ID: 20260826_0004
Revises: 20260825_0003
Create Date: 2026-08-26
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260826_0004"
down_revision: str | None = "20260825_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


admin_status = sa.Enum("active", "suspended", name="adminstatus")


def upgrade() -> None:
    op.create_table(
        "admin",
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("status", admin_status, server_default="active", nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_admin_email"),
    )
    op.create_index("ix_admin_id", "admin", ["id"], unique=False)
    op.create_index("ix_admin_email", "admin", ["email"], unique=False)
    op.create_index("ix_admin_status", "admin", ["status"], unique=False)

    op.create_table(
        "admin_session",
        sa.Column("admin_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("revoked", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["admin_id"],
            ["admin.id"],
            name="fk_admin_session_admin_id_admin",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_admin_session_token_hash"),
    )
    op.create_index("ix_admin_session_id", "admin_session", ["id"], unique=False)
    op.create_index("ix_admin_session_admin_id", "admin_session", ["admin_id"], unique=False)
    op.create_index("ix_admin_session_token_hash", "admin_session", ["token_hash"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_admin_session_token_hash", table_name="admin_session")
    op.drop_index("ix_admin_session_admin_id", table_name="admin_session")
    op.drop_index("ix_admin_session_id", table_name="admin_session")
    op.drop_table("admin_session")

    op.drop_index("ix_admin_status", table_name="admin")
    op.drop_index("ix_admin_email", table_name="admin")
    op.drop_index("ix_admin_id", table_name="admin")
    op.drop_table("admin")

    if op.get_bind().dialect.name == "postgresql":
        admin_status.drop(op.get_bind(), checkfirst=True)
