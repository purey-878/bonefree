"""standardize primary keys with app base model

Revision ID: 1a1dfbbf18d8
Revises: 5c7d995176a4
Create Date: 2026-08-19 16:25:22.139522

This migration intentionally avoids Alembic's destructive autogenerate output.
It normalizes entity primary-key columns to ``id`` and rebuilds SQLite tables
from the current SQLAlchemy metadata so primary keys, foreign keys, indexes and
unique constraints match the AppBaseModel based models.

The migration is defensive/idempotent: it can run against databases that are
partially migrated, already migrated, or still carrying a few legacy names from
older revisions.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1a1dfbbf18d8"
down_revision: Union[str, None] = "5c7d995176a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PRIMARY_KEY_RENAMES: dict[str, tuple[str, ...]] = {
    "admin": ("admin_id", "id_admin"),
    "category": ("category_id", "id_categoria"),
    "product": ("product_id", "id_produto"),
    "product_image": ("image_id", "id_imagem"),
    "customer": ("customer_id", "id_cliente"),
    "customer_billing_address": ("address_id", "id_endereco"),
    "cart": ("cart_id", "id_carrinho"),
    "cart_product": ("cart_product_id", "cart_log_id"),
    "ingredient": ("ingredient_id", "id_ingrediente"),
    "product_customization_option": ("option_id", "id_option"),
    "cart_product_customization": ("customization_id", "id_customizacao"),
    "customer_order": ("order_id", "id_encomenda"),
    "invoice": ("invoice_id", "id_fatura"),
    "order_product": ("order_product_id", "id_encomenda_produto"),
    "product_review": ("review_id", "id_review"),
    "review_replies": ("reply_id", "id_reply"),
    "review_reactions": ("reaction_id", "id_reaction"),
    "payment": ("payment_id", "id_pagamento"),
    "refund": ("refund_id", "id_reembolso"),
}

LEGACY_COUPON_COLUMN_RENAMES: tuple[tuple[str, str], ...] = (
    ("id_cupom", "id"),
    ("id_cliente", "customer_id"),
    ("codigo", "code"),
    ("tipo", "type"),
    ("valor", "value"),
    ("valor_minimo_pedido", "minimum_order_value"),
    ("usado", "used"),
    ("criado_em", "created_at"),
    ("expira_em", "expires_at"),
)

LEGACY_PRODUCT_COLUMN_RENAMES: tuple[tuple[str, str], ...] = (
    ("desconto_percentual", "discount_percentual"),
)

TABLE_ORDER: tuple[str, ...] = (
    "admin",
    "customer",
    "category",
    "company_config",
    "site_setting",
    "ingredient",
    "product",
    "customer_billing_address",
    "customer_loyalty",
    "coupon",
    "cart",
    "cart_product",
    "product_image",
    "product_ingredient",
    "product_customization_option",
    "cart_product_customization",
    "customer_order",
    "invoice",
    "order_product",
    "product_review",
    "review_replies",
    "review_reactions",
    "payment",
    "refund",
)


def _bind() -> sa.engine.Connection:
    return op.get_bind()


def _insp() -> sa.Inspector:
    return sa.inspect(_bind())


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _table_exists(table_name: str) -> bool:
    return table_name in _insp().get_table_names()


def _columns(table_name: str) -> set[str]:
    if not _table_exists(table_name):
        return set()
    return {column["name"] for column in _insp().get_columns(table_name)}


def _column_exists(table_name: str, column_name: str) -> bool:
    return column_name in _columns(table_name)


def _rename_table_if_needed(old_name: str, new_name: str) -> None:
    if _table_exists(old_name) and not _table_exists(new_name):
        op.rename_table(old_name, new_name)


def _rename_column_if_needed(table_name: str, old_name: str, new_name: str) -> None:
    if (
        _table_exists(table_name)
        and _column_exists(table_name, old_name)
        and not _column_exists(table_name, new_name)
    ):
        op.alter_column(table_name, old_name, new_column_name=new_name)


def _drop_table_if_exists(table_name: str) -> None:
    if _table_exists(table_name):
        op.drop_table(table_name)


def _set_sqlite_foreign_keys(enabled: bool) -> None:
    if _bind().dialect.name == "sqlite":
        op.execute(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}")


def _import_model_metadata() -> sa.MetaData:
    import sys
    from pathlib import Path

    backend_dir = Path(__file__).resolve().parents[2]
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from models import Base  # pylint: disable=import-outside-toplevel

    return Base.metadata


def _normalize_legacy_names() -> None:
    _rename_table_if_needed("cupom", "coupon")
    _rename_table_if_needed("produto_ingrediente", "product_ingredient")
    _drop_table_if_exists("('produto_ingrediente',)")

    for table_name, old_names in PRIMARY_KEY_RENAMES.items():
        for old_name in old_names:
            _rename_column_if_needed(table_name, old_name, "id")

    for old_name, new_name in LEGACY_COUPON_COLUMN_RENAMES:
        _rename_column_if_needed("coupon", old_name, new_name)

    for old_name, new_name in LEGACY_PRODUCT_COLUMN_RENAMES:
        _rename_column_if_needed("product", old_name, new_name)


def _copy_expression(table_name: str, target_column: sa.Column, existing_columns: set[str]) -> str:
    column_name = target_column.name

    if column_name in existing_columns:
        return _quote(column_name)

    if column_name in {"created_at", "updated_at"}:
        return "CURRENT_TIMESTAMP"

    if column_name == "id":
        return f"row_number() over (order by rowid)"

    if target_column.default is not None:
        default_arg = getattr(target_column.default, "arg", None)
        if isinstance(default_arg, bool):
            return "1" if default_arg else "0"
        if isinstance(default_arg, (int, float)):
            return str(default_arg)
        if isinstance(default_arg, str):
            return "'" + default_arg.replace("'", "''") + "'"

    if target_column.server_default is not None:
        server_default_arg = getattr(target_column.server_default, "arg", None)
        if server_default_arg is not None:
            rendered = str(server_default_arg)
            if rendered:
                return rendered

    if target_column.nullable:
        return "NULL"

    if isinstance(target_column.type, sa.String):
        return "''"
    if isinstance(target_column.type, sa.Boolean):
        return "0"
    if isinstance(target_column.type, (sa.Integer, sa.Numeric)):
        return "0"
    if isinstance(target_column.type, sa.DateTime):
        return "CURRENT_TIMESTAMP"

    raise RuntimeError(f"No safe default for required column {table_name}.{column_name}")


def _rebuild_table_from_metadata(table_name: str, metadata: sa.MetaData) -> None:
    if table_name not in metadata.tables:
        return

    target_table = metadata.tables[table_name]
    temp_name = f"__tmp_{table_name}_app_base_model"

    if _table_exists(temp_name):
        op.drop_table(temp_name)

    temp_metadata = sa.MetaData()
    for metadata_table in metadata.tables.values():
        if metadata_table.name != table_name:
            metadata_table.to_metadata(temp_metadata)

    temp_table = target_table.to_metadata(temp_metadata, name=temp_name)
    temp_table.create(_bind())

    if _table_exists(table_name):
        existing_columns = _columns(table_name)
        target_columns = [column for column in target_table.columns]
        insert_columns = ", ".join(_quote(column.name) for column in target_columns)
        select_columns = ", ".join(
            f"{_copy_expression(table_name, column, existing_columns)} AS {_quote(column.name)}"
            for column in target_columns
        )

        op.execute(
            sa.text(
                f"INSERT INTO {_quote(temp_name)} ({insert_columns}) "
                f"SELECT {select_columns} FROM {_quote(table_name)}"
            )
        )
        op.drop_table(table_name)

    op.rename_table(temp_name, table_name)


def upgrade() -> None:
    """Upgrade schema."""
    metadata = _import_model_metadata()

    _set_sqlite_foreign_keys(False)
    try:
        _normalize_legacy_names()

        for table_name in TABLE_ORDER:
            _rebuild_table_from_metadata(table_name, metadata)
    finally:
        _set_sqlite_foreign_keys(True)


def downgrade() -> None:
    """Downgrade intentionally keeps the normalized AppBaseModel schema.

    Reverting this migration would require another full-table rebuild and would
    reintroduce the legacy entity-specific primary-key names. Keeping this as a
    no-op is safer than an automatic destructive downgrade.
    """
    return None