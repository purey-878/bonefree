"""Store application string enums as VARCHAR columns.

Revision ID: 20260826_0005
Revises: 20260826_0004
Create Date: 2026-08-26
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260826_0005"
down_revision: str | None = "20260826_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


VARCHAR_LENGTH = 50

ENUM_DEFINITIONS: dict[str, tuple[str, ...]] = {
    "adminstatus": ("active", "suspended"),
    "organizationtype": ("restaurant",),
    "cancellationorigin": ("client", "admin", "system"),
    "cartcustomizationaction": (
        "remove_ingredient",
        "add_extra",
        "substitute_sauce",
        "substitute_side",
    ),
    "coupontype": ("fixed_value", "percentage"),
    "entitystatus": ("active", "inactive"),
    "ingredienttype": ("normal", "sauce", "extra", "drink", "base", "side"),
    "mediaownertype": ("product",),
    "mediavariantkind": ("original", "thumb", "card", "detail"),
    "orderstate": (
        "pending",
        "confirmed",
        "in_preparation",
        "ready",
        "delivered",
        "cancelled",
    ),
    "paymentmethod": ("card", "mbway", "counter"),
    "paymentstate": ("pending", "approved", "rejected"),
    "paymentstatus": ("unpaid", "paid"),
    "productcustomizationoptiontype": (
        "add",
        "remove",
        "extra",
        "substitute_sauce",
        "substitute_side",
    ),
    "reviewreactiontype": ("like", "heart"),
    "reviewstatus": ("pending", "approved", "rejected"),
    "sitesettingkey": (
        "site_theme",
        "chef_special",
        "loyalty_coupon",
        "company_details",
        "social_media",
        "events",
    ),
    "userrole": ("owner", "manager", "waiter", "chef", "client"),
    "userstatus": ("active", "suspended", "pending"),
}

# table -> (column, PostgreSQL enum type, nullable)
TABLE_COLUMNS: dict[str, tuple[tuple[str, str, bool], ...]] = {
    "organization": (("organization_type", "organizationtype", False),),
    "user": (
        ("status", "userstatus", False),
        ("role", "userrole", False),
    ),
    "admin": (("status", "adminstatus", False),),
    "category": (("status", "entitystatus", False),),
    "site_setting": (("key", "sitesettingkey", False),),
    "product": (("status", "entitystatus", False),),
    "media": (("owner_type", "mediaownertype", False),),
    "media_variant": (("kind", "mediavariantkind", False),),
    "coupon": (("type", "coupontype", False),),
    "ingredient": (
        ("type", "ingredienttype", False),
        ("status", "entitystatus", False),
    ),
    "product_customization_option": (
        ("type", "productcustomizationoptiontype", False),
        ("status", "entitystatus", False),
    ),
    "cart_product_customization": (
        ("action", "cartcustomizationaction", False),
    ),
    "customer_order": (
        ("state", "orderstate", False),
        ("payment_method", "paymentmethod", False),
        ("payment_status", "paymentstatus", False),
        ("cancellation_origin", "cancellationorigin", True),
    ),
    "product_review": (("status", "reviewstatus", False),),
    "review_reactions": (("type", "reviewreactiontype", False),),
    "payment": (
        ("method", "paymentmethod", False),
        ("state", "paymentstate", False),
    ),
}

SERVER_DEFAULTS: dict[tuple[str, str], str] = {
    ("organization", "organization_type"): "restaurant",
    ("admin", "status"): "active",
}


def _validate_stored_values() -> None:
    bind = op.get_bind()
    for table_name, columns in TABLE_COLUMNS.items():
        for column_name, enum_name, _nullable in columns:
            table = sa.table(table_name, sa.column(column_name))
            column = table.c[column_name]
            stored_values = set(
                bind.scalars(
                    sa.select(column)
                    .select_from(table)
                    .where(column.is_not(None))
                    .distinct()
                )
            )
            invalid_values = stored_values - set(ENUM_DEFINITIONS[enum_name])
            if invalid_values:
                rendered_values = ", ".join(repr(value) for value in sorted(invalid_values))
                raise RuntimeError(
                    f"Cannot migrate {table_name}.{column_name}: "
                    f"invalid {enum_name} values: {rendered_values}"
                )


def _enum_type(enum_name: str) -> sa.Enum:
    values = ENUM_DEFINITIONS[enum_name]
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=enum_name, create_type=False)
    return sa.Enum(*values, name=enum_name)


def _drop_server_defaults() -> None:
    for table_name, column_name in SERVER_DEFAULTS:
        op.alter_column(table_name, column_name, server_default=None)


def _restore_server_defaults() -> None:
    for (table_name, column_name), value in SERVER_DEFAULTS.items():
        op.alter_column(table_name, column_name, server_default=sa.text(f"'{value}'"))


def _upgrade_postgresql() -> None:
    bind = op.get_bind()
    _drop_server_defaults()
    for table_name, columns in TABLE_COLUMNS.items():
        for column_name, enum_name, nullable in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=_enum_type(enum_name),
                type_=sa.String(length=VARCHAR_LENGTH),
                existing_nullable=nullable,
                postgresql_using=f'"{column_name}"::text',
            )
    _restore_server_defaults()

    for enum_name in reversed(ENUM_DEFINITIONS):
        postgresql.ENUM(
            *ENUM_DEFINITIONS[enum_name],
            name=enum_name,
        ).drop(bind, checkfirst=True)


def _upgrade_sqlite() -> None:
    for table_name, columns in TABLE_COLUMNS.items():
        with op.batch_alter_table(table_name) as batch_op:
            for column_name, enum_name, nullable in columns:
                batch_op.alter_column(
                    column_name,
                    existing_type=_enum_type(enum_name),
                    type_=sa.String(length=VARCHAR_LENGTH),
                    existing_nullable=nullable,
                )


def _upgrade_generic() -> None:
    for table_name, columns in TABLE_COLUMNS.items():
        for column_name, enum_name, nullable in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=_enum_type(enum_name),
                type_=sa.String(length=VARCHAR_LENGTH),
                existing_nullable=nullable,
            )


def upgrade() -> None:
    _validate_stored_values()
    dialect_name = op.get_bind().dialect.name
    if dialect_name == "postgresql":
        _upgrade_postgresql()
    elif dialect_name == "sqlite":
        _upgrade_sqlite()
    else:
        _upgrade_generic()


def _downgrade_postgresql() -> None:
    bind = op.get_bind()
    for enum_name, values in ENUM_DEFINITIONS.items():
        postgresql.ENUM(*values, name=enum_name).create(bind, checkfirst=True)

    _drop_server_defaults()
    for table_name, columns in TABLE_COLUMNS.items():
        for column_name, enum_name, nullable in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.String(length=VARCHAR_LENGTH),
                type_=_enum_type(enum_name),
                existing_nullable=nullable,
                postgresql_using=f'"{column_name}"::text::{enum_name}',
            )
    _restore_server_defaults()


def _downgrade_sqlite() -> None:
    for table_name, columns in TABLE_COLUMNS.items():
        with op.batch_alter_table(table_name) as batch_op:
            for column_name, enum_name, nullable in columns:
                batch_op.alter_column(
                    column_name,
                    existing_type=sa.String(length=VARCHAR_LENGTH),
                    type_=_enum_type(enum_name),
                    existing_nullable=nullable,
                )


def _downgrade_generic() -> None:
    for table_name, columns in TABLE_COLUMNS.items():
        for column_name, enum_name, nullable in columns:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.String(length=VARCHAR_LENGTH),
                type_=_enum_type(enum_name),
                existing_nullable=nullable,
            )


def downgrade() -> None:
    _validate_stored_values()
    dialect_name = op.get_bind().dialect.name
    if dialect_name == "postgresql":
        _downgrade_postgresql()
    elif dialect_name == "sqlite":
        _downgrade_sqlite()
    else:
        _downgrade_generic()
