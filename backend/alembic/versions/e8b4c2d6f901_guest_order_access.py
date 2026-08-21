"""Add guest order snapshots and access tokens.

Revision ID: e8b4c2d6f901
Revises: d7e3a1b9c5f2
Create Date: 2026-08-21 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8b4c2d6f901"
down_revision: Union[str, None] = "d7e3a1b9c5f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ORDER_TABLE = "customer_order"


def _table_exists(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _columns(table_name: str) -> dict[str, dict]:
    if not _table_exists(table_name):
        return {}
    return {
        column["name"]: column
        for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return index_name in {
        index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)
    }


def upgrade() -> None:
    if not _table_exists(ORDER_TABLE):
        return

    additions = {
        "customer_first_name": sa.Column("customer_first_name", sa.String(100), nullable=True),
        "customer_last_name": sa.Column("customer_last_name", sa.String(100), nullable=True),
        "customer_email": sa.Column("customer_email", sa.String(150), nullable=True),
        "customer_phone": sa.Column("customer_phone", sa.String(20), nullable=True),
        "customer_tax_id": sa.Column("customer_tax_id", sa.String(20), nullable=True),
        "order_access_token_hash": sa.Column("order_access_token_hash", sa.String(64), nullable=True),
        "order_access_expires_at": sa.Column("order_access_expires_at", sa.DateTime(), nullable=True),
    }
    existing_columns = _columns(ORDER_TABLE)
    for name, column in additions.items():
        if name not in existing_columns:
            op.add_column(ORDER_TABLE, column)

    if _table_exists("user"):
        op.execute(sa.text(
            """
            UPDATE customer_order
            SET customer_first_name = COALESCE(
                    customer_first_name,
                    (SELECT name FROM "user" WHERE "user".id = customer_order.customer_id)
                ),
                customer_last_name = COALESCE(
                    customer_last_name,
                    (SELECT last_name FROM "user" WHERE "user".id = customer_order.customer_id)
                ),
                customer_email = COALESCE(
                    customer_email,
                    (SELECT email FROM "user" WHERE "user".id = customer_order.customer_id)
                ),
                customer_phone = COALESCE(
                    customer_phone,
                    (SELECT phone FROM "user" WHERE "user".id = customer_order.customer_id)
                ),
                customer_tax_id = COALESCE(
                    customer_tax_id,
                    (SELECT tax_id FROM "user" WHERE "user".id = customer_order.customer_id)
                )
            WHERE customer_id IS NOT NULL
            """
        ))

    customer_column = _columns(ORDER_TABLE).get("customer_id")
    if customer_column and not customer_column.get("nullable", False):
        with op.batch_alter_table(ORDER_TABLE) as batch_op:
            batch_op.alter_column(
                "customer_id",
                existing_type=sa.Integer(),
                nullable=True,
            )

    index_name = "ix_customer_order_order_access_token_hash"
    if not _index_exists(ORDER_TABLE, index_name):
        op.create_index(
            index_name,
            ORDER_TABLE,
            ["order_access_token_hash"],
            unique=True,
        )


def downgrade() -> None:
    if not _table_exists(ORDER_TABLE):
        return

    guest_count = op.get_bind().scalar(
        sa.text("SELECT COUNT(*) FROM customer_order WHERE customer_id IS NULL")
    )
    if guest_count:
        raise RuntimeError(
            "Cannot downgrade guest order access while guest orders exist."
        )

    index_name = "ix_customer_order_order_access_token_hash"
    if _index_exists(ORDER_TABLE, index_name):
        op.drop_index(index_name, table_name=ORDER_TABLE)

    columns = _columns(ORDER_TABLE)
    if columns.get("customer_id", {}).get("nullable", False):
        with op.batch_alter_table(ORDER_TABLE) as batch_op:
            batch_op.alter_column(
                "customer_id",
                existing_type=sa.Integer(),
                nullable=False,
            )

    for column_name in (
        "order_access_expires_at",
        "order_access_token_hash",
        "customer_tax_id",
        "customer_phone",
        "customer_email",
        "customer_last_name",
        "customer_first_name",
    ):
        if column_name in _columns(ORDER_TABLE):
            op.drop_column(ORDER_TABLE, column_name)
