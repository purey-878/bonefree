"""Normalize enum values to English.

Revision ID: 9b2f4d1a7c8e
Revises: 60579442a0de
Create Date: 2026-08-19 21:50:00.000000

The initial attempt to create this migration with ``alembic revision
--autogenerate`` failed in the local Python 3.14 environment while SQLAlchemy
was importing typed ORM models. The migration is therefore written manually from
the enum value changes and kept idempotent.

It normalizes persisted legacy enum strings to the canonical English values
used by backend/enums.py. For PostgreSQL it also makes sure the canonical enum
labels exist before data is updated. Legacy PostgreSQL labels are intentionally
not removed because dropping enum values is not portable/safe without rebuilding
dependent columns.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9b2f4d1a7c8e"
down_revision: Union[str, None] = "60579442a0de"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ENUM_LABELS: dict[str, tuple[str, ...]] = {
    "userrole": ("owner", "manager", "waiter", "chef", "client"),
    "coupontype": ("fixed_value", "percentage"),
    "ingredienttype": ("normal", "sauce", "extra", "drink", "base", "side"),
    "productcustomizationoptiontype": ("add", "remove", "extra", "substitute_sauce", "substitute_side"),
    "cartcustomizationaction": ("remove_ingredient", "add_extra", "substitute_sauce", "substitute_side"),
    "orderstate": ("pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled", "refunded"),
    "paymentmethod": ("card", "mbway", "counter"),
    "paymentstatus": ("unpaid", "paid", "refunded"),
    "reviewstatus": ("pending", "approved", "rejected"),
    "paymentstate": ("pending", "approved", "rejected", "refunded"),
    "refundstatus": ("approved",),
    "coupondiscounttype": ("fixed_value", "percentage"),
}

ENUM_COLUMNS: tuple[tuple[str, str, str, dict[str, str]], ...] = (
    (
        "user",
        "role",
        "userrole",
        {
            "super_admin": "owner",
            "staff_admin": "manager",
            "admin": "manager",
            "customer": "client",
        },
    ),
    (
        "coupon",
        "type",
        "coupontype",
        {
            "VALOR_FIXO": "fixed_value",
            "PERCENTAGEM": "percentage",
        },
    ),
    (
        "coupon",
        "discount_type",
        "coupondiscounttype",
        {
            "VALOR_FIXO": "fixed_value",
            "PERCENTAGEM": "percentage",
        },
    ),
    (
        "ingredient",
        "type",
        "ingredienttype",
        {
            "INGREDIENTES_NORMAIS": "normal",
            "MOLHO": "sauce",
            "EXTRA": "extra",
            "BEBIDA": "drink",
            "BASE": "base",
            "ACOMPANHAMENTO": "side",
        },
    ),
    (
        "product_customization_option",
        "type",
        "productcustomizationoptiontype",
        {
            "ADICIONAR": "add",
            "REMOVER": "remove",
            "EXTRA": "extra",
            "SUBSTITUIR_MOLHO": "substitute_sauce",
            "SUBSTITUIR_ACOMPANHAMENTO": "substitute_side",
        },
    ),
    (
        "cart_product_customization",
        "action",
        "cartcustomizationaction",
        {
            "REMOVER_INGREDIENTE": "remove_ingredient",
            "ADICIONAR_EXTRA": "add_extra",
            "SUBSTITUIR_MOLHO": "substitute_sauce",
            "SUBSTITUIR_ACOMPANHAMENTO": "substitute_side",
        },
    ),
    (
        "customer_order",
        "state",
        "orderstate",
        {
            "pendente": "pending",
            "confirmada": "confirmed",
            "em_preparacao": "in_preparation",
            "pronta": "ready",
            "entregue": "delivered",
            "cancelada": "cancelled",
            "reembolsada": "refunded",
        },
    ),
    (
        "customer_order",
        "payment_method",
        "paymentmethod",
        {
            "cartao": "card",
            "balcao": "counter",
        },
    ),
    (
        "customer_order",
        "payment_status",
        "paymentstatus",
        {
            "nao_pago": "unpaid",
            "pago": "paid",
            "reembolsado": "refunded",
        },
    ),
    (
        "product_review",
        "status",
        "reviewstatus",
        {
            "pendente": "pending",
            "aprovado": "approved",
            "rejeitado": "rejected",
        },
    ),
    (
        "payment",
        "method",
        "paymentmethod",
        {
            "cartao": "card",
            "balcao": "counter",
        },
    ),
    (
        "payment",
        "state",
        "paymentstate",
        {
            "pendente": "pending",
            "aprovado": "approved",
            "rejeitado": "rejected",
            "reembolsado": "refunded",
        },
    ),
    (
        "refund",
        "status",
        "refundstatus",
        {
            "aprovado": "approved",
        },
    ),
)

DOWNGRADE_ENUM_COLUMNS: tuple[tuple[str, str, dict[str, str]], ...] = (
    (
        "user",
        "role",
        {
            "owner": "super_admin",
            "manager": "staff_admin",
            "client": "customer",
        },
    ),
    (
        "coupon",
        "type",
        {
            "fixed_value": "VALOR_FIXO",
            "percentage": "PERCENTAGEM",
        },
    ),
    (
        "coupon",
        "discount_type",
        {
            "fixed_value": "VALOR_FIXO",
            "percentage": "PERCENTAGEM",
        },
    ),
    (
        "ingredient",
        "type",
        {
            "normal": "INGREDIENTES_NORMAIS",
            "sauce": "MOLHO",
            "drink": "BEBIDA",
            "side": "ACOMPANHAMENTO",
        },
    ),
    (
        "product_customization_option",
        "type",
        {
            "add": "ADICIONAR",
            "remove": "REMOVER",
            "substitute_sauce": "SUBSTITUIR_MOLHO",
            "substitute_side": "SUBSTITUIR_ACOMPANHAMENTO",
        },
    ),
    (
        "cart_product_customization",
        "action",
        {
            "remove_ingredient": "REMOVER_INGREDIENTE",
            "add_extra": "ADICIONAR_EXTRA",
            "substitute_sauce": "SUBSTITUIR_MOLHO",
            "substitute_side": "SUBSTITUIR_ACOMPANHAMENTO",
        },
    ),
    (
        "customer_order",
        "state",
        {
            "pending": "pendente",
            "confirmed": "confirmada",
            "in_preparation": "em_preparacao",
            "ready": "pronta",
            "delivered": "entregue",
            "cancelled": "cancelada",
            "refunded": "reembolsada",
        },
    ),
    (
        "customer_order",
        "payment_method",
        {
            "card": "cartao",
            "counter": "balcao",
        },
    ),
    (
        "customer_order",
        "payment_status",
        {
            "unpaid": "nao_pago",
            "paid": "pago",
            "refunded": "reembolsado",
        },
    ),
    (
        "product_review",
        "status",
        {
            "pending": "pendente",
            "approved": "aprovado",
            "rejected": "rejeitado",
        },
    ),
    (
        "payment",
        "method",
        {
            "card": "cartao",
            "counter": "balcao",
        },
    ),
    (
        "payment",
        "state",
        {
            "pending": "pendente",
            "approved": "aprovado",
            "rejected": "rejeitado",
            "refunded": "reembolsado",
        },
    ),
    (
        "refund",
        "status",
        {
            "approved": "aprovado",
        },
    ),
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _quote_identifier(identifier: str) -> str:
    return op.get_bind().dialect.identifier_preparer.quote(identifier)


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in _inspector().get_columns(table_name))


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _ensure_postgresql_enum_labels() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        for enum_name, labels in ENUM_LABELS.items():
            quoted_enum_name = _quote_identifier(enum_name)
            enum_name_literal = _sql_literal(enum_name)
            for label in labels:
                label_literal = _sql_literal(label)
                op.execute(
                    sa.text(
                        f"""
                        DO $$
                        BEGIN
                            IF EXISTS (
                                SELECT 1
                                FROM pg_type
                                WHERE typname = {enum_name_literal}
                            ) THEN
                                ALTER TYPE {quoted_enum_name} ADD VALUE IF NOT EXISTS {label_literal};
                            END IF;
                        END
                        $$;
                        """
                    )
                )


def _update_values(table_name: str, column_name: str, mapping: dict[str, str], enum_name: str | None = None) -> None:
    if not mapping or not _column_exists(table_name, column_name):
        return

    quoted_table_name = _quote_identifier(table_name)
    quoted_column_name = _quote_identifier(column_name)
    quoted_enum_name = _quote_identifier(enum_name) if enum_name is not None else None
    bind = op.get_bind()

    for legacy_value, canonical_value in mapping.items():
        if bind.dialect.name == "postgresql" and quoted_enum_name is not None:
            # Cast through text so the statement works even when the column is a
            # PostgreSQL enum type and the target label was just added above.
            statement = sa.text(
                f"""
                UPDATE {quoted_table_name}
                SET {quoted_column_name} = CAST(:canonical_value AS text)::text::{quoted_enum_name}
                WHERE {quoted_column_name}::text = :legacy_value
                """
            )
        else:
            statement = sa.text(
                f"""
                UPDATE {quoted_table_name}
                SET {quoted_column_name} = :canonical_value
                WHERE {quoted_column_name} = :legacy_value
                """
            )

        op.execute(statement.bindparams(legacy_value=legacy_value, canonical_value=canonical_value))


def upgrade() -> None:
    _ensure_postgresql_enum_labels()

    for table_name, column_name, enum_name, mapping in ENUM_COLUMNS:
        _update_values(table_name, column_name, mapping, enum_name)


def downgrade() -> None:
    for table_name, column_name, mapping in DOWNGRADE_ENUM_COLUMNS:
        _update_values(table_name, column_name, mapping)