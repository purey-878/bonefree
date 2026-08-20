"""Reset simulated transactions and remove refunds.

Revision ID: c4a8f2e1d9b7
Revises: 9b2f4d1a7c8e
Create Date: 2026-08-20 18:00:00.000000

This revision is intentionally destructive: every existing order, payment,
invoice, review, coupon, and loyalty row belongs to pre-production simulation.
Catalog, customer, cart, and physical stock data are preserved.
"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4a8f2e1d9b7"
down_revision: Union[str, None] = "9b2f4d1a7c8e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CLEARED_TABLES = (
    "review_reactions",
    "review_replies",
    "product_review",
    "refund",
    "invoice",
    "payment",
    "order_product",
    "customer_order",
    "coupon",
    "customer_loyalty",
)

ACTIVE_ENUMS = {
    "orderstate": ("pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled"),
    "paymentstatus": ("unpaid", "paid"),
    "paymentstate": ("pending", "approved", "rejected"),
}

ENUM_COLUMNS = {
    "orderstate": (("customer_order", "state"),),
    "paymentstatus": (("customer_order", "payment_status"),),
    "paymentstate": (("payment", "state"),),
}

REMOVED_ENUMS = ("refundstatus", "refundreason", "refundmethod")


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _quote(identifier: str) -> str:
    return op.get_bind().dialect.identifier_preparer.quote(identifier)


def _delete_all(table_name: str) -> None:
    if _table_exists(table_name):
        op.execute(sa.text(f"DELETE FROM {_quote(table_name)}"))


def _migrate_branding() -> None:
    bind = op.get_bind()
    if _table_exists("site_setting"):
        row = bind.execute(
            sa.text(
                "SELECT value FROM site_setting "
                "WHERE CAST(key AS VARCHAR) = 'company_details'"
            )
        ).scalar_one_or_none()
        if row:
            try:
                payload = json.loads(row)
            except (TypeError, ValueError):
                payload = None
            if isinstance(payload, dict):
                for field in ("brand_name", "description", "address"):
                    value = payload.get(field)
                    if isinstance(value, str):
                        payload[field] = value.replace("PREY", "BONEFREE").replace("Prey", "Bonefree")
                bind.execute(
                    sa.text(
                        "UPDATE site_setting SET value = :value "
                        "WHERE CAST(key AS VARCHAR) = 'company_details'"
                    ),
                    {"value": json.dumps(payload, ensure_ascii=False, separators=(",", ":"))},
                )

    if not _table_exists("user"):
        return

    users = bind.execute(sa.text('SELECT id, email, CAST(role AS VARCHAR) FROM "user"')).all()
    existing = {str(email).casefold() for _, email, _ in users if email}
    changes: list[tuple[int, str, str]] = []
    for user_id, email, role in users:
        if not email or str(role) == "client" or not str(email).casefold().endswith("@prey.pt"):
            continue
        target = str(email)[:-8] + "@bonefree.pt"
        if target.casefold() in existing and target.casefold() != str(email).casefold():
            raise RuntimeError(
                f"Cannot migrate administrator email {email!r}: {target!r} already exists"
            )
        changes.append((int(user_id), str(email), target))
        existing.add(target.casefold())

    for user_id, _source, target in changes:
        bind.execute(
            sa.text('UPDATE "user" SET email = :email WHERE id = :user_id'),
            {"email": target, "user_id": user_id},
        )


def _reset_identities() -> None:
    bind = op.get_bind()
    existing_tables = [table for table in CLEARED_TABLES if _table_exists(table)]
    if bind.dialect.name == "sqlite":
        if "sqlite_sequence" not in _inspector().get_table_names():
            return
        for table_name in existing_tables:
            bind.execute(
                sa.text("DELETE FROM sqlite_sequence WHERE name = :table_name"),
                {"table_name": table_name},
            )
        return

    if bind.dialect.name == "postgresql":
        for table_name in existing_tables:
            sequence_name = bind.execute(
                sa.text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
                {"table_name": table_name},
            ).scalar_one_or_none()
            if sequence_name:
                bind.execute(sa.text("SELECT setval(CAST(:sequence_name AS regclass), 1, false)"), {"sequence_name": sequence_name})


def _postgres_enum_labels(enum_name: str) -> tuple[str, ...]:
    rows = op.get_bind().execute(
        sa.text(
            "SELECT enumlabel FROM pg_enum "
            "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
            "WHERE pg_type.typname = :enum_name ORDER BY enumsortorder"
        ),
        {"enum_name": enum_name},
    ).scalars().all()
    return tuple(rows)


def _rebuild_postgresql_enums() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    for enum_name, labels in ACTIVE_ENUMS.items():
        current_labels = _postgres_enum_labels(enum_name)
        if not current_labels or current_labels == labels:
            continue

        old_name = f"{enum_name}_pre_production_reset"
        quoted_name = _quote(enum_name)
        quoted_old_name = _quote(old_name)
        label_sql = ", ".join("'" + label.replace("'", "''") + "'" for label in labels)
        op.execute(sa.text(f"ALTER TYPE {quoted_name} RENAME TO {quoted_old_name}"))
        op.execute(sa.text(f"CREATE TYPE {quoted_name} AS ENUM ({label_sql})"))
        for table_name, column_name in ENUM_COLUMNS[enum_name]:
            if _table_exists(table_name):
                op.execute(
                    sa.text(
                        f"ALTER TABLE {_quote(table_name)} ALTER COLUMN {_quote(column_name)} "
                        f"TYPE {quoted_name} USING {_quote(column_name)}::text::{quoted_name}"
                    )
                )
        op.execute(sa.text(f"DROP TYPE {quoted_old_name}"))

    for enum_name in REMOVED_ENUMS:
        if _postgres_enum_labels(enum_name):
            op.execute(sa.text(f"DROP TYPE {_quote(enum_name)}"))


def upgrade() -> None:
    _migrate_branding()

    for table_name in CLEARED_TABLES:
        _delete_all(table_name)

    if _table_exists("product"):
        op.execute(sa.text("UPDATE product SET sold = 0"))

    _reset_identities()

    if _table_exists("refund"):
        op.drop_table("refund")

    _rebuild_postgresql_enums()


def downgrade() -> None:
    raise RuntimeError(
        "The pre-production transaction reset is irreversible; restore the mandatory backup instead."
    )
