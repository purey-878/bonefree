"""Translate all internal names to english

Revision ID: 5c7d995176a4
Revises: 20260819_0001
Create Date: 2026-08-19 15:39:41.793203

This migration intentionally renames existing tables/columns instead of
creating new tables and dropping the old ones.  It is written to be safe to
run against databases that are already fully or partially renamed.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c7d995176a4"
down_revision: Union[str, None] = "20260819_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE_RENAMES: list[tuple[str, str]] = [
    ("cliente", "customer"),
    ("cliente_endereco_fatura", "customer_billing_address"),
    ("cliente_loyalty", "customer_loyalty"),
    ("empresa_config", "company_config"),
    ("categoria", "category"),
    ("produto", "product"),
    ("imagem_produto", "product_image"),
    ("ingrediente", "ingredient"),
    ("produto_ingrediente", "product_ingredient"),
    ("produto_option_customizacao", "product_customization_option"),
    ("carrinho", "cart"),
    ("carrinho_produto", "cart_product"),
    ("carrinho_produto_customizacao", "cart_product_customization"),
    ("encomenda", "customer_order"),
    ("encomenda_produto", "order_product"),
    ("fatura", "invoice"),
    ("pagamento", "payment"),
    ("reembolso", "refund"),
    ("produto_review", "product_review"),
]

COLUMN_RENAMES: dict[str, list[tuple[str, str]]] = {
    "admin": [
        ("id_admin", "admin_id"),
        ("nome", "name"),
        ("palavra_passe", "password"),
        ("data_criacao", "created_at"),
    ],
    "site_setting": [
        ("chave", "key"),
        ("valor", "value"),
        ("data_atualizacao", "updated_at"),
    ],
    "company_config": [
        ("nome_empresa", "company_name"),
        ("nif_empresa", "company_tax_id"),
        ("morada", "address"),
        ("codigo_postal", "postal_code"),
        ("cidade", "city"),
        ("pais", "country"),
        ("telefone", "phone"),
        ("data_atualizacao", "updated_at"),
    ],
    "customer": [
        ("id_cliente", "customer_id"),
        ("nome", "name"),
        ("apelido", "last_name"),
        ("nif", "tax_id"),
        ("telefone", "phone"),
        ("palavra_passe", "password"),
        ("data_criacao", "created_at"),
    ],
    "customer_billing_address": [
        ("id_endereco", "address_id"),
        ("cliente_id", "customer_id"),
        ("morada", "address"),
        ("codigo_postal", "postal_code"),
        ("cidade", "city"),
        ("pais", "country"),
    ],
    "customer_loyalty": [
        ("id_cliente", "customer_id"),
        ("pedidos_acima_50", "orders_above_50"),
        ("total_cupons_ganhos", "total_coupons_earned"),
        ("atualizado_em", "updated_at"),
    ],
    "category": [
        ("id_categoria", "category_id"),
        ("nome_categoria", "category_name"),
        ("descricao_categoria", "category_description"),
        ("id_admin", "admin_id"),
    ],
    "product": [
        ("id_produto", "product_id"),
        ("nome", "name"),
        ("descricao_produto", "product_description"),
        ("preco", "price"),
        ("id_categoria", "category_id"),
        ("id_admin", "admin_id"),
        ("vendido", "sold"),
        ("imagem", "image"),
        ("customizavel", "customizable"),
        ("destaque", "featured"),
        ("total_calorias", "total_calories"),
    ],
    "product_image": [
        ("id_produto", "product_id"),
        ("caminho_imagem", "image_path"),
    ],
    "ingredient": [
        ("id_ingrediente", "ingredient_id"),
        ("nome", "name"),
        ("tipo", "type"),
        ("calorias_por_grama", "calories_per_gram"),
    ],
    "product_ingredient": [
        ("id_produto", "product_id"),
        ("id_ingrediente", "ingredient_id"),
        ("incluido_por_defeito", "included_by_default"),
        ("removivel", "removable"),
        ("substituivel", "substitutable"),
        ("quantidade", "quantity"),
    ],
    "product_customization_option": [
        ("id_option", "option_id"),
        ("id_produto", "product_id"),
        ("id_ingrediente", "ingredient_id"),
        ("nome", "name"),
        ("tipo", "type"),
        ("preco_extra", "extra_price"),
        ("max_quantidade", "max_quantity"),
    ],
    "cart": [
        ("id_carrinho", "cart_id"),
        ("id_cliente", "customer_id"),
        ("data_criacao", "created_at"),
    ],
    "cart_product": [
        ("cart_log_id", "cart_product_id"),
        ("id_carrinho", "cart_id"),
        ("id_produto", "product_id"),
        ("quantidade", "quantity"),
        ("customizacao", "customization"),
    ],
    "cart_product_customization": [
        ("id_customizacao", "customization_id"),
        ("cart_log_id", "cart_product_id"),
        ("id_ingrediente", "ingredient_id"),
        ("id_option", "option_id"),
        ("acao", "action"),
        ("quantidade", "quantity"),
        ("preco_extra", "extra_price"),
        ("notas", "notes"),
    ],
    "customer_order": [
        ("id_encomenda", "order_id"),
        ("id_cliente", "customer_id"),
        ("id_admin", "admin_id"),
        ("data_encomenda", "ordered_at"),
        ("estado", "state"),
        ("metodo_pagamento", "payment_method"),
        ("estado_pagamento", "payment_status"),
        ("iva_percentual", "vat_percentage"),
        ("iva_valor", "vat_amount"),
        ("discount_total", "total_discount"),
        ("notas", "notes"),
        ("data_cancelamento", "canceled_at"),
        ("origem_cancelamento", "cancellation_origin"),
        ("data_atualizacao", "updated_at"),
    ],
    "invoice": [
        ("id_fatura", "invoice_id"),
        ("id_encomenda", "order_id"),
        ("numero_fatura", "invoice_number"),
        ("nif_cliente", "customer_tax_id"),
        ("nome_cliente", "customer_name"),
        ("morada_cliente", "customer_address"),
        ("iva_percentual", "vat_percentage"),
        ("iva_valor", "vat_amount"),
        ("data_emissao", "issued_at"),
    ],
    "payment": [
        ("id_pagamento", "payment_id"),
        ("id_encomenda", "order_id"),
        ("metodo", "method"),
        ("estado", "state"),
        ("valor", "value"),
        ("referencia_transacao", "transaction_reference"),
        ("data_pagamento", "paid_at"),
        ("confirmado_por_admin_id", "confirmed_by_admin_id"),
    ],
    "refund": [
        ("id_reembolso", "refund_id"),
        ("id_encomenda", "order_id"),
        ("id_pagamento", "payment_id"),
        ("id_admin", "admin_id"),
        ("valor", "value"),
        ("motivo", "reason"),
        ("notas", "notes"),
        ("metodo", "method"),
        ("recibo_numero", "receipt_number"),
        ("data_reembolso", "refunded_at"),
    ],
    "order_product": [
        ("id_encomenda_produto", "order_product_id"),
        ("id_encomenda", "order_id"),
        ("id_produto", "product_id"),
        ("quantidade", "quantity"),
        ("preco_unitario", "unit_price"),
        ("product_name_snapshot", "product_name_snapshot"),
        ("discount_percentual_snapshot", "discount_percentage_snapshot"),
        ("iva_percentual_snapshot", "vat_percentage_snapshot"),
        ("customizacao", "customization"),
    ],
    "product_review": [
        ("id_review", "review_id"),
        ("id_produto", "product_id"),
        ("id_cliente", "customer_id"),
        ("id_encomenda_produto", "order_product_id"),
        ("titulo", "title"),
        ("comentario", "comment"),
        ("data_criacao", "created_at"),
        ("data_atualizacao", "updated_at"),
    ],
    "review_replies": [
        ("id_reply", "reply_id"),
        ("id_review", "review_id"),
        ("id_admin", "admin_id"),
        ("texto", "text"),
    ],
    "review_reactions": [
        ("id_reaction", "reaction_id"),
        ("id_review", "review_id"),
        ("id_admin", "admin_id"),
        ("tipo", "type"),
    ],
}

OLD_INDEXES = [
    "ix_admin_id_admin",
    "ix_site_setting_chave",
    "ix_empresa_config_id",
    "ix_cliente_id_cliente",
    "ix_customer_email",
    "ix_cliente_endereco_fatura_id_endereco",
    "ix_cliente_endereco_fatura_cliente_id",
    "ix_categoria_id_categoria",
    "ix_categoria_id_admin",
    "ix_product_id_produto",
    "ix_product_id_admin",
    "ix_produto_deleted_at",
    "ix_imagem_produto_image_id",
    "ix_ingrediente_id_ingrediente",
    "ix_produto_option_customizacao_id_option",
    "ix_carrinho_id_carrinho",
    "ix_carrinho_produto_cart_log_id",
    "ix_carrinho_produto_customizacao_id_customizacao",
    "ix_encomenda_id_encomenda",
    "ix_encomenda_product_id_encomenda_produto",
    "ix_fatura_id_fatura",
    "ix_fatura_id_encomenda",
    "ix_fatura_numero_fatura",
    "ix_fatura_data_emissao",
    "ix_pagamento_id_pagamento",
    "ix_reembolso_id_reembolso",
    "ix_reembolso_id_encomenda",
    "ix_reembolso_id_admin",
    "ix_reembolso_recibo_numero",
    "ix_reembolso_data_reembolso",
    "ix_produto_review_id_review",
    "ix_produto_review_id_produto",
    "ix_produto_review_data_criacao",
    "ix_produto_review_rating",
    "ix_produto_review_status",
    "ix_review_replies_id_reply",
    "ix_review_replies_id_review",
    "ix_review_replies_id_admin",
    "ix_review_reactions_id_reaction",
    "ix_review_reactions_id_review",
    "ix_review_reactions_id_admin",
]

NEW_INDEXES: list[tuple[str, str, list[str], bool]] = [
    ("ix_admin_admin_id", "admin", ["admin_id"], False),
    ("ix_site_setting_key", "site_setting", ["key"], False),
    ("ix_company_config_id", "company_config", ["id"], False),
    ("ix_customer_customer_id", "customer", ["customer_id"], False),
    ("ix_customer_email", "customer", ["email"], True),
    ("ix_customer_billing_address_address_id", "customer_billing_address", ["address_id"], False),
    ("ix_customer_billing_address_customer_id", "customer_billing_address", ["customer_id"], True),
    ("ix_category_category_id", "category", ["category_id"], False),
    ("ix_category_admin_id", "category", ["admin_id"], False),
    ("ix_product_product_id", "product", ["product_id"], False),
    ("ix_product_admin_id", "product", ["admin_id"], False),
    ("ix_product_deleted_at", "product", ["deleted_at"], False),
    ("ix_product_image_image_id", "product_image", ["image_id"], False),
    ("ix_ingredient_ingredient_id", "ingredient", ["ingredient_id"], False),
    ("ix_product_customization_option_option_id", "product_customization_option", ["option_id"], False),
    ("ix_cart_cart_id", "cart", ["cart_id"], False),
    ("ix_cart_product_cart_product_id", "cart_product", ["cart_product_id"], False),
    ("ix_cart_product_customization_customization_id", "cart_product_customization", ["customization_id"], False),
    ("ix_customer_order_order_id", "customer_order", ["order_id"], False),
    ("ix_order_product_order_product_id", "order_product", ["order_product_id"], False),
    ("ix_invoice_invoice_id", "invoice", ["invoice_id"], False),
    ("ix_invoice_order_id", "invoice", ["order_id"], True),
    ("ix_invoice_invoice_number", "invoice", ["invoice_number"], True),
    ("ix_invoice_issued_at", "invoice", ["issued_at"], False),
    ("ix_payment_payment_id", "payment", ["payment_id"], False),
    ("ix_refund_refund_id", "refund", ["refund_id"], False),
    ("ix_refund_order_id", "refund", ["order_id"], False),
    ("ix_refund_admin_id", "refund", ["admin_id"], False),
    ("ix_refund_receipt_number", "refund", ["receipt_number"], True),
    ("ix_refund_refunded_at", "refund", ["refunded_at"], False),
    ("ix_product_review_review_id", "product_review", ["review_id"], False),
    ("ix_product_review_product_id", "product_review", ["product_id"], False),
    ("ix_product_review_customer_id", "product_review", ["customer_id"], False),
    ("ix_product_review_created_at", "product_review", ["created_at"], False),
    ("ix_product_review_rating", "product_review", ["rating"], False),
    ("ix_product_review_status", "product_review", ["status"], False),
    ("ix_review_replies_reply_id", "review_replies", ["reply_id"], False),
    ("ix_review_replies_review_id", "review_replies", ["review_id"], False),
    ("ix_review_replies_admin_id", "review_replies", ["admin_id"], False),
    ("ix_review_reactions_reaction_id", "review_reactions", ["reaction_id"], False),
    ("ix_review_reactions_review_id", "review_reactions", ["review_id"], False),
    ("ix_review_reactions_admin_id", "review_reactions", ["admin_id"], False),
]


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _table_exists(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return column_name in {column["name"] for column in _inspector().get_columns(table_name)}


def _index_exists(index_name: str, table_name: str | None = None) -> bool:
    inspector = _inspector()
    table_names = [table_name] if table_name else inspector.get_table_names()
    return any(
        index["name"] == index_name
        for current_table in table_names
        if current_table in inspector.get_table_names()
        for index in inspector.get_indexes(current_table)
    )


def _rename_table_if_needed(old_name: str, new_name: str) -> None:
    if _table_exists(old_name) and not _table_exists(new_name):
        op.rename_table(old_name, new_name)


def _rename_column_if_needed(table_name: str, old_name: str, new_name: str) -> None:
    if _column_exists(table_name, old_name) and not _column_exists(table_name, new_name):
        op.execute(
            sa.text(
                "ALTER TABLE "
                f"{_quote_identifier(table_name)} "
                "RENAME COLUMN "
                f"{_quote_identifier(old_name)} "
                "TO "
                f"{_quote_identifier(new_name)}"
            )
        )


def _drop_index_if_exists(index_name: str) -> None:
    if _index_exists(index_name):
        op.drop_index(index_name)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str], unique: bool = False) -> None:
    if not _table_exists(table_name):
        return
    if not all(_column_exists(table_name, column) for column in columns):
        return
    if not _index_exists(index_name, table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _set_sqlite_foreign_keys(enabled: bool) -> None:
    if op.get_bind().dialect.name == "sqlite":
        op.execute(sa.text(f"PRAGMA foreign_keys={'ON' if enabled else 'OFF'}"))


def _rename_tables(table_renames: list[tuple[str, str]]) -> None:
    for old_name, new_name in table_renames:
        _rename_table_if_needed(old_name, new_name)


def _rename_columns(column_renames: dict[str, list[tuple[str, str]]]) -> None:
    for table_name, renames in column_renames.items():
        for old_name, new_name in renames:
            _rename_column_if_needed(table_name, old_name, new_name)


def _replace_indexes(indexes_to_drop: list[str], indexes_to_create: list[tuple[str, str, list[str], bool]]) -> None:
    for index_name in indexes_to_drop:
        _drop_index_if_exists(index_name)

    for index_name, table_name, columns, unique in indexes_to_create:
        _create_index_if_missing(index_name, table_name, columns, unique)


def upgrade() -> None:
    """Rename Portuguese table/column names to English while preserving data."""
    _set_sqlite_foreign_keys(False)
    try:
        _rename_tables(TABLE_RENAMES)
        _rename_columns(COLUMN_RENAMES)
        _replace_indexes(OLD_INDEXES, NEW_INDEXES)
    finally:
        _set_sqlite_foreign_keys(True)


def downgrade() -> None:
    """Rename English table/column names back to Portuguese while preserving data."""
    reverse_column_renames = {
        table_name: [(new_name, old_name) for old_name, new_name in renames]
        for table_name, renames in COLUMN_RENAMES.items()
    }
    reverse_table_renames = [(new_name, old_name) for old_name, new_name in reversed(TABLE_RENAMES)]

    old_indexes: list[tuple[str, str, list[str], bool]] = [
        ("ix_admin_id_admin", "admin", ["id_admin"], False),
        ("ix_site_setting_chave", "site_setting", ["chave"], False),
        ("ix_empresa_config_id", "empresa_config", ["id"], False),
        ("ix_cliente_id_cliente", "cliente", ["id_cliente"], False),
        ("ix_customer_email", "cliente", ["email"], True),
        ("ix_cliente_endereco_fatura_id_endereco", "cliente_endereco_fatura", ["id_endereco"], False),
        ("ix_cliente_endereco_fatura_cliente_id", "cliente_endereco_fatura", ["cliente_id"], True),
        ("ix_categoria_id_categoria", "categoria", ["id_categoria"], False),
        ("ix_categoria_id_admin", "categoria", ["id_admin"], False),
        ("ix_product_id_produto", "produto", ["id_produto"], False),
        ("ix_product_id_admin", "produto", ["id_admin"], False),
        ("ix_produto_deleted_at", "produto", ["deleted_at"], False),
        ("ix_imagem_produto_image_id", "imagem_produto", ["image_id"], False),
        ("ix_ingrediente_id_ingrediente", "ingrediente", ["id_ingrediente"], False),
        ("ix_produto_option_customizacao_id_option", "produto_option_customizacao", ["id_option"], False),
        ("ix_carrinho_id_carrinho", "carrinho", ["id_carrinho"], False),
        ("ix_carrinho_produto_cart_log_id", "carrinho_produto", ["cart_log_id"], False),
        ("ix_carrinho_produto_customizacao_id_customizacao", "carrinho_produto_customizacao", ["id_customizacao"], False),
        ("ix_encomenda_id_encomenda", "encomenda", ["id_encomenda"], False),
        ("ix_encomenda_product_id_encomenda_produto", "encomenda_produto", ["id_encomenda_produto"], False),
        ("ix_fatura_id_fatura", "fatura", ["id_fatura"], False),
        ("ix_fatura_id_encomenda", "fatura", ["id_encomenda"], True),
        ("ix_fatura_numero_fatura", "fatura", ["numero_fatura"], True),
        ("ix_fatura_data_emissao", "fatura", ["data_emissao"], False),
        ("ix_pagamento_id_pagamento", "pagamento", ["id_pagamento"], False),
        ("ix_reembolso_id_reembolso", "reembolso", ["id_reembolso"], False),
        ("ix_reembolso_id_encomenda", "reembolso", ["id_encomenda"], False),
        ("ix_reembolso_id_admin", "reembolso", ["id_admin"], False),
        ("ix_reembolso_recibo_numero", "reembolso", ["recibo_numero"], True),
        ("ix_reembolso_data_reembolso", "reembolso", ["data_reembolso"], False),
        ("ix_produto_review_id_review", "produto_review", ["id_review"], False),
        ("ix_produto_review_id_produto", "produto_review", ["id_produto"], False),
        ("ix_produto_review_data_criacao", "produto_review", ["data_criacao"], False),
        ("ix_produto_review_rating", "produto_review", ["rating"], False),
        ("ix_produto_review_status", "produto_review", ["status"], False),
        ("ix_review_replies_id_reply", "review_replies", ["id_reply"], False),
        ("ix_review_replies_id_review", "review_replies", ["id_review"], False),
        ("ix_review_replies_id_admin", "review_replies", ["id_admin"], False),
        ("ix_review_reactions_id_reaction", "review_reactions", ["id_reaction"], False),
        ("ix_review_reactions_id_review", "review_reactions", ["id_review"], False),
        ("ix_review_reactions_id_admin", "review_reactions", ["id_admin"], False),
    ]

    _set_sqlite_foreign_keys(False)
    try:
        _replace_indexes([index_name for index_name, *_ in NEW_INDEXES], old_indexes)
        _rename_columns(reverse_column_renames)
        _rename_tables(reverse_table_renames)
    finally:
        _set_sqlite_foreign_keys(True)