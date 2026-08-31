"""Add organization data access, privacy contacts, and durable export jobs.

Revision ID: 20260831_0006
Revises: 20260826_0005
Create Date: 2026-08-31
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260831_0006"
down_revision: str | None = "20260826_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _timestamps() -> tuple[sa.Column, sa.Column, sa.Column]:
    return (
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )


def _tenant_columns() -> tuple[sa.Column, sa.Column, sa.Column, sa.Column]:
    return (
        sa.Column("organization_id", sa.Integer(), nullable=False),
        *_timestamps(),
    )


def _tenant_constraints(table_name: str) -> tuple[sa.ForeignKeyConstraint, sa.PrimaryKeyConstraint]:
    return (
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name=f"fk_{table_name}_organization_id_organization",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def _create_common_indexes(table_name: str) -> None:
    op.create_index(f"ix_{table_name}_id", table_name, ["id"], unique=False)
    op.create_index(
        f"ix_{table_name}_organization_id", table_name, ["organization_id"], unique=False
    )


def upgrade() -> None:
    with op.batch_alter_table("organization") as batch_op:
        for column_name in (
            "access_expires_at",
            "purged_at",
            "access_notice_notified_at",
            "data_access_started_notified_at",
            "data_access_reminder_7d_notified_at",
            "data_access_reminder_1d_notified_at",
            "data_access_closed_notified_at",
        ):
            batch_op.add_column(sa.Column(column_name, sa.DateTime(), nullable=True))

    with op.batch_alter_table("organization_domain") as batch_op:
        batch_op.add_column(sa.Column("deactivated_at", sa.DateTime(), nullable=True))

    with op.batch_alter_table("organization_profile") as batch_op:
        batch_op.add_column(sa.Column("privacy_contact_email", sa.String(length=150), nullable=True))
    op.execute(
        sa.text(
            "UPDATE organization_profile SET privacy_contact_email = "
            "COALESCE(NULLIF(email, ''), "
            "(SELECT organization.email FROM organization "
            "WHERE organization.id = organization_profile.organization_id))"
        )
    )

    with op.batch_alter_table("session") as batch_op:
        batch_op.add_column(
            sa.Column(
                "mode",
                sa.String(length=50),
                server_default="operational",
                nullable=False,
            )
        )
        batch_op.create_index("ix_session_mode", ["mode"], unique=False)

    op.create_table(
        "data_export",
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="pending", nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=True),
        sa.Column("requested_by_user_id", sa.Integer(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("storage_path", sa.String(length=500), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("downloaded_at", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        *_tenant_columns(),
        sa.ForeignKeyConstraint(
            ["customer_id"], ["user.id"], name="fk_data_export_customer_id_user", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_user_id"],
            ["user.id"],
            name="fk_data_export_requested_by_user_id_user",
            ondelete="SET NULL",
        ),
        *_tenant_constraints("data_export"),
    )
    _create_common_indexes("data_export")
    op.create_index("ix_data_export_public_id", "data_export", ["public_id"], unique=True)
    op.create_index("ix_data_export_kind", "data_export", ["kind"], unique=False)
    op.create_index("ix_data_export_status", "data_export", ["status"], unique=False)
    op.create_index("ix_data_export_customer_id", "data_export", ["customer_id"], unique=False)
    op.create_index("ix_data_export_expires_at", "data_export", ["expires_at"], unique=False)

    op.create_table(
        "data_access_login_challenge",
        sa.Column("public_id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        *_tenant_columns(),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
            name="fk_data_access_login_challenge_user_id_user",
            ondelete="CASCADE",
        ),
        *_tenant_constraints("data_access_login_challenge"),
    )
    _create_common_indexes("data_access_login_challenge")
    op.create_index(
        "ix_data_access_login_challenge_public_id",
        "data_access_login_challenge",
        ["public_id"],
        unique=True,
    )
    op.create_index(
        "ix_data_access_login_challenge_user_id",
        "data_access_login_challenge",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_data_access_login_challenge_expires_at",
        "data_access_login_challenge",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    for table_name in (
        "data_access_login_challenge",
        "data_export",
    ):
        op.drop_table(table_name)

    with op.batch_alter_table("session") as batch_op:
        batch_op.drop_index("ix_session_mode")
        batch_op.drop_column("mode")
    with op.batch_alter_table("organization_profile") as batch_op:
        batch_op.drop_column("privacy_contact_email")
    with op.batch_alter_table("organization_domain") as batch_op:
        batch_op.drop_column("deactivated_at")
    with op.batch_alter_table("organization") as batch_op:
        for column_name in (
            "data_access_closed_notified_at",
            "data_access_reminder_1d_notified_at",
            "data_access_reminder_7d_notified_at",
            "data_access_started_notified_at",
            "access_notice_notified_at",
            "purged_at",
            "access_expires_at",
        ):
            batch_op.drop_column(column_name)
