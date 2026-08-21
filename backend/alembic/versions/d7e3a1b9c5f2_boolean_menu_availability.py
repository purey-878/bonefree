"""Replace numeric product stock with boolean menu availability.

Revision ID: d7e3a1b9c5f2
Revises: c4a8f2e1d9b7
Create Date: 2026-08-21 10:00:00.000000

The legacy stock count is converted before the column is removed. Product
sales counters and all cart/order quantities remain unchanged.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d7e3a1b9c5f2"
down_revision: Union[str, None] = "c4a8f2e1d9b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return column_name in {
        column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)
    }


def upgrade() -> None:
    if _table_exists("product"):
        if not _column_exists("product", "available"):
            op.add_column("product", sa.Column("available", sa.Boolean(), nullable=True))
        if _column_exists("product", "stock"):
            op.execute(sa.text(
                "UPDATE product SET available = "
                "CASE WHEN COALESCE(stock, 0) > 0 THEN TRUE ELSE FALSE END"
            ))
        else:
            op.execute(sa.text("UPDATE product SET available = TRUE WHERE available IS NULL"))

        with op.batch_alter_table("product") as batch_op:
            batch_op.alter_column(
                "available",
                existing_type=sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )
            if _column_exists("product", "stock"):
                batch_op.drop_column("stock")

    if _table_exists("ingredient"):
        if not _column_exists("ingredient", "available"):
            op.add_column("ingredient", sa.Column("available", sa.Boolean(), nullable=True))
            op.execute(sa.text(
                "UPDATE ingredient SET available = "
                "CASE WHEN CAST(status AS VARCHAR) = 'active' THEN TRUE ELSE FALSE END"
            ))
        else:
            op.execute(sa.text(
                "UPDATE ingredient SET available = "
                "CASE WHEN CAST(status AS VARCHAR) = 'active' THEN TRUE ELSE FALSE END "
                "WHERE available IS NULL"
            ))
        with op.batch_alter_table("ingredient") as batch_op:
            batch_op.alter_column(
                "available",
                existing_type=sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            )


def downgrade() -> None:
    if _table_exists("ingredient") and _column_exists("ingredient", "available"):
        with op.batch_alter_table("ingredient") as batch_op:
            batch_op.drop_column("available")

    if _table_exists("product") and _column_exists("product", "available"):
        if not _column_exists("product", "stock"):
            op.add_column("product", sa.Column("stock", sa.Integer(), nullable=True))
            op.execute(sa.text(
                "UPDATE product SET stock = CASE WHEN available THEN 1 ELSE 0 END"
            ))
            with op.batch_alter_table("product") as batch_op:
                batch_op.alter_column(
                    "stock",
                    existing_type=sa.Integer(),
                    nullable=False,
                )

        with op.batch_alter_table("product") as batch_op:
            batch_op.drop_column("available")
