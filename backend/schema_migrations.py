"""Lightweight schema migrations for projects without Alembic."""

from __future__ import annotations

import logging
import json
import re

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from database import Base

logger = logging.getLogger(__name__)


SQLITE_COLUMN_MIGRATIONS: dict[str, dict[str, str]] = {
    "encomenda": {
        "data_cancelamento": "data_cancelamento DATETIME",
        "origem_cancelamento": "origem_cancelamento VARCHAR(30)",
        "subtotal": "subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0",
        "iva_percentual": "iva_percentual NUMERIC(5, 2) NOT NULL DEFAULT 13",
        "iva_valor": "iva_valor NUMERIC(10, 2) NOT NULL DEFAULT 0",
        "desconto_total": "desconto_total NUMERIC(10, 2) NOT NULL DEFAULT 0",
    },
    "encomenda_produto": {
        "nome_produto_snapshot": "nome_produto_snapshot VARCHAR(150) NOT NULL DEFAULT ''",
        "desconto_percentual_snapshot": "desconto_percentual_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 0",
        "iva_percentual_snapshot": "iva_percentual_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 13",
    },
    "pagamento": {
        "confirmado_por_admin_id": "confirmado_por_admin_id INTEGER",
    },
}

PRODUCT_FK_TABLES = (
    "imagem_produto",
    "carrinho_produto",
    "produto_ingrediente",
    "produto_opcao_customizacao",
    "encomenda_produto",
    "produto_review",
)


def apply_schema_migrations(engine: Engine) -> None:
    """Create known tables and add missing SQLite columns idempotently."""
    Base.metadata.create_all(bind=engine)

    if engine.dialect.name != "sqlite":
        logger.info("Automatic lightweight migrations skipped for %s.", engine.dialect.name)
        return

    with engine.connect() as conn:
        try:
            inspector = inspect(conn)
            existing_tables = set(inspector.get_table_names())

            if _needs_integer_product_category_migration(inspector, existing_tables):
                _migrate_product_category_ids_to_integers(conn)
                inspector = inspect(conn)
                existing_tables = set(inspector.get_table_names())

            if _needs_product_review_unique_migration(conn, existing_tables):
                _migrate_product_review_unique_constraint(conn)
                inspector = inspect(conn)
                existing_tables = set(inspector.get_table_names())

            if "cliente" in existing_tables:
                _migrate_cliente_invoice_address(conn)
                inspector = inspect(conn)
                existing_tables = set(inspector.get_table_names())

            for table_name, columns in SQLITE_COLUMN_MIGRATIONS.items():
                if table_name not in existing_tables:
                    continue

                existing_columns = {column["name"] for column in inspector.get_columns(table_name)}
                for column_name, column_ddl in columns.items():
                    if column_name in existing_columns:
                        continue
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_ddl}"))
                    logger.info("Added missing column %s.%s.", table_name, column_name)

            _ensure_cliente_created_at_datetime(conn, existing_tables)
            _normalize_payment_methods(conn, existing_tables)
            _backfill_order_snapshots(conn, existing_tables)
            _create_accounting_indexes(conn, existing_tables)
            _ensure_optional_parent_cardinalities(conn, existing_tables)

            conn.commit()
        except Exception:
            conn.rollback()
            raise


def _needs_integer_product_category_migration(inspector, existing_tables: set[str]) -> bool:
    if "produto" not in existing_tables or "categoria" not in existing_tables:
        return False

    product_columns = {column["name"]: str(column["type"]).upper() for column in inspector.get_columns("produto")}
    category_columns = {column["name"]: str(column["type"]).upper() for column in inspector.get_columns("categoria")}
    return not product_columns.get("id_produto", "").startswith("INTEGER") or not category_columns.get("id_categoria", "").startswith("INTEGER")


def _legacy_numeric_id(raw_value: object, used: set[int], next_id: int) -> tuple[int, int]:
    raw = "" if raw_value is None else str(raw_value).strip()
    match = re.search(r"(\d+)$", raw)
    candidate = int(match.group(1)) if match else 0
    if candidate > 0 and candidate not in used:
        used.add(candidate)
        return candidate, max(next_id, candidate + 1)

    while next_id in used:
        next_id += 1
    assigned = next_id
    used.add(assigned)
    return assigned, assigned + 1


def _build_id_mapping(rows: list[tuple[object]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    used: set[int] = set()
    next_id = 1
    for (old_id,) in rows:
        new_id, next_id = _legacy_numeric_id(old_id, used, next_id)
        mapping[str(old_id)] = new_id
    return mapping


def _column_names(conn, table_name: str) -> set[str]:
    return {row[1] for row in conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()}


def _unique_index_exists(conn, table_name: str, expected_columns: tuple[str, ...]) -> bool:
    for row in conn.execute(text(f"PRAGMA index_list({table_name})")).fetchall():
        index_name = row[1]
        is_unique = bool(row[2])
        if not is_unique:
            continue
        columns = tuple(info[2] for info in conn.execute(text(f"PRAGMA index_info({index_name})")).fetchall())
        if columns == expected_columns:
            return True
    return False


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _ensure_optional_parent_cardinalities(conn, existing_tables: set[str]) -> None:
    optional_child_fk_columns = {
        "produto_review": (("id_produto",),),
        "review_replies": (("id_review",),),
        "review_reactions": (("id_review",),),
        "imagem_produto": (("id_produto",),),
        "carrinho_produto_customizacao": (("id_opcao",),),
        "reembolso": (("id_encomenda",), ("id_pagamento",)),
        "cupom": (("id_cliente",),),
    }

    for table_name, allowed_many_columns in optional_child_fk_columns.items():
        if table_name not in existing_tables:
            continue
        for row in conn.execute(text(f"PRAGMA index_list({_quote_identifier(table_name)})")).fetchall():
            index_name = row[1]
            is_unique = bool(row[2])
            origin = row[3] if len(row) > 3 else "c"
            if not is_unique:
                continue
            columns = tuple(
                info[2]
                for info in conn.execute(text(f"PRAGMA index_info({_quote_identifier(index_name)})")).fetchall()
            )
            if columns not in allowed_many_columns:
                continue
            if origin != "c":
                logger.warning(
                    "Unique constraint %s on %s%s conflicts with optional parent-side 0..N cardinality and requires a table rebuild to remove.",
                    index_name,
                    table_name,
                    columns,
                )
                continue
            conn.execute(text(f"DROP INDEX IF EXISTS {_quote_identifier(index_name)}"))
            logger.info("Dropped unique index %s to preserve %s%s as parent-side 0..N.", index_name, table_name, columns)


def _needs_product_review_unique_migration(conn, existing_tables: set[str]) -> bool:
    if "produto_review" not in existing_tables:
        return False
    columns = _column_names(conn, "produto_review")
    required_columns = {"id_cliente", "id_produto"}
    return required_columns.issubset(columns) and not _unique_index_exists(conn, "produto_review", ("id_cliente", "id_produto"))


def _migrate_product_review_unique_constraint(conn) -> None:
    logger.info("Rebuilding produto_review with one review per customer/product.")
    columns = _column_names(conn, "produto_review")

    def value(column_name: str, default_sql: str = "NULL") -> str:
        return f"current_review.{column_name}" if column_name in columns else default_sql

    conn.execute(text("PRAGMA foreign_keys=OFF"))
    conn.execute(text("""
        CREATE TABLE produto_review_new (
            id_review INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            id_cliente INTEGER NOT NULL REFERENCES cliente (id_cliente),
            id_encomenda_produto INTEGER UNIQUE REFERENCES encomenda_produto (id_encomenda_produto),
            rating INTEGER NOT NULL,
            titulo VARCHAR(120),
            comentario VARCHAR(1000),
            status VARCHAR(8) NOT NULL,
            data_criacao DATETIME NOT NULL,
            data_atualizacao DATETIME NOT NULL,
            CONSTRAINT uq_review_encomenda_produto UNIQUE (id_encomenda_produto),
            CONSTRAINT uq_review_cliente_produto UNIQUE (id_cliente, id_produto)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO produto_review_new (
            id_review, id_produto, id_cliente, id_encomenda_produto, rating,
            titulo, comentario, status, data_criacao, data_atualizacao
        )
        SELECT {value('id_review')},
               {value('id_produto')},
               {value('id_cliente')},
               {value('id_encomenda_produto')},
               {value('rating', '5')},
               {value('titulo')},
               {value('comentario')},
               {value('status', "'aprovado'")},
               {value('data_criacao', 'CURRENT_TIMESTAMP')},
               {value('data_atualizacao', 'CURRENT_TIMESTAMP')}
        FROM produto_review current_review
        WHERE NOT EXISTS (
            SELECT 1
            FROM produto_review newer_review
            WHERE newer_review.id_cliente = current_review.id_cliente
              AND newer_review.id_produto = current_review.id_produto
              AND (
                datetime(COALESCE(newer_review.data_atualizacao, newer_review.data_criacao, '1970-01-01')) >
                  datetime(COALESCE(current_review.data_atualizacao, current_review.data_criacao, '1970-01-01'))
                OR (
                  datetime(COALESCE(newer_review.data_atualizacao, newer_review.data_criacao, '1970-01-01')) =
                    datetime(COALESCE(current_review.data_atualizacao, current_review.data_criacao, '1970-01-01'))
                  AND newer_review.id_review > current_review.id_review
                )
              )
        )
    """))
    conn.execute(text("DROP TABLE produto_review"))
    conn.execute(text("ALTER TABLE produto_review_new RENAME TO produto_review"))
    conn.execute(text("DELETE FROM review_replies WHERE id_review NOT IN (SELECT id_review FROM produto_review)"))
    conn.execute(text("DELETE FROM review_reactions WHERE id_review NOT IN (SELECT id_review FROM produto_review)"))
    _create_product_category_indexes(conn)
    conn.execute(text("PRAGMA foreign_keys=ON"))


def _migrate_cliente_invoice_address(conn) -> None:
    legacy_address_columns = {
        "morada": "VARCHAR(255)",
        "codigo_postal": "VARCHAR(20)",
        "cidade": "VARCHAR(100)",
        "pais": "VARCHAR(100)",
    }
    cliente_columns = _column_names(conn, "cliente")
    present_address_columns = tuple(column for column in legacy_address_columns if column in cliente_columns)

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS cliente_endereco_fatura (
            id_endereco INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL UNIQUE REFERENCES cliente (id_cliente) ON DELETE CASCADE,
            morada VARCHAR(255),
            codigo_postal VARCHAR(20),
            cidade VARCHAR(100),
            pais VARCHAR(100) NOT NULL DEFAULT 'Portugal'
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_endereco_fatura_id_endereco ON cliente_endereco_fatura (id_endereco)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_endereco_fatura_cliente_id ON cliente_endereco_fatura (cliente_id)"))
    _ensure_cliente_invoice_address_country_default(conn)
    conn.execute(text("""
        UPDATE cliente_endereco_fatura
        SET pais = 'Portugal'
        WHERE TRIM(COALESCE(CAST(pais AS TEXT), '')) = ''
    """))

    if present_address_columns:
        address_presence_columns = tuple(column for column in present_address_columns if column != "pais")
        select_values = {
            column: column if column in cliente_columns else "NULL"
            for column in legacy_address_columns
        }
        has_address = " OR ".join(
            f"TRIM(COALESCE(CAST({column} AS TEXT), '')) <> ''"
            for column in address_presence_columns
        )
        if not has_address:
            _rebuild_cliente_without_address_columns(conn, cliente_columns)
            return
        conn.execute(text(f"""
            INSERT INTO cliente_endereco_fatura (cliente_id, morada, codigo_postal, cidade, pais)
            SELECT id_cliente,
                   {select_values['morada']},
                   {select_values['codigo_postal']},
                   {select_values['cidade']},
                   COALESCE(NULLIF(TRIM(CAST({select_values['pais']} AS TEXT)), ''), 'Portugal')
            FROM cliente
            WHERE ({has_address})
              AND NOT EXISTS (
                  SELECT 1
                  FROM cliente_endereco_fatura existing
                  WHERE existing.cliente_id = cliente.id_cliente
              )
        """))

        _rebuild_cliente_without_address_columns(conn, cliente_columns)


def _cliente_column_sql_value(columns: set[str], column_name: str, default_sql: str = "NULL") -> str:
    return f"cliente.{column_name}" if column_name in columns else default_sql


def _invoice_address_country_needs_rebuild(conn) -> bool:
    for row in conn.execute(text("PRAGMA table_info(cliente_endereco_fatura)")).fetchall():
        if row[1] != "pais":
            continue
        default_value = str(row[4] or "").strip().strip("'\"").casefold()
        return not bool(row[3]) or default_value != "portugal"
    return True


def _ensure_cliente_invoice_address_country_default(conn) -> None:
    if not _invoice_address_country_needs_rebuild(conn):
        return

    logger.info("Rebuilding cliente_endereco_fatura to enforce Portugal as country default.")
    columns = _column_names(conn, "cliente_endereco_fatura")

    def value(column_name: str, default_sql: str = "NULL") -> str:
        return f"cliente_endereco_fatura.{column_name}" if column_name in columns else default_sql

    conn.execute(text("""
        CREATE TABLE cliente_endereco_fatura_new (
            id_endereco INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL UNIQUE REFERENCES cliente (id_cliente) ON DELETE CASCADE,
            morada VARCHAR(255),
            codigo_postal VARCHAR(20),
            cidade VARCHAR(100),
            pais VARCHAR(100) NOT NULL DEFAULT 'Portugal'
        )
    """))
    conn.execute(text(f"""
        INSERT INTO cliente_endereco_fatura_new (id_endereco, cliente_id, morada, codigo_postal, cidade, pais)
        SELECT {value('id_endereco')},
               {value('cliente_id')},
               {value('morada')},
               {value('codigo_postal')},
               {value('cidade')},
               COALESCE(NULLIF(TRIM(CAST({value('pais', "'Portugal'")} AS TEXT)), ''), 'Portugal')
        FROM cliente_endereco_fatura
    """))
    conn.execute(text("DROP TABLE cliente_endereco_fatura"))
    conn.execute(text("ALTER TABLE cliente_endereco_fatura_new RENAME TO cliente_endereco_fatura"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_endereco_fatura_id_endereco ON cliente_endereco_fatura (id_endereco)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_endereco_fatura_cliente_id ON cliente_endereco_fatura (cliente_id)"))


def _rebuild_cliente_without_address_columns(conn, columns: set[str]) -> None:
    logger.info("Rebuilding cliente without legacy invoice address columns.")
    value = lambda column_name, default_sql="NULL": _cliente_column_sql_value(columns, column_name, default_sql)

    if conn.in_transaction():
        conn.commit()

    conn.execute(text("PRAGMA foreign_keys=OFF"))
    try:
        conn.execute(text("""
            CREATE TABLE cliente_new (
                id_cliente INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                nome VARCHAR(100),
                apelido VARCHAR(100),
                nif VARCHAR(20) UNIQUE,
                telefone VARCHAR(20),
                email VARCHAR(100) NOT NULL UNIQUE,
                palavra_passe VARCHAR(255) NOT NULL,
                password_reset_code_hash VARCHAR(255),
                password_reset_expires_at DATETIME,
                password_reset_attempts INTEGER,
                password_reset_verified_until DATETIME,
                password_reset_token_hash VARCHAR(255),
                status INTEGER,
                data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.execute(text(f"""
            INSERT INTO cliente_new (
                id_cliente, nome, apelido, nif, telefone, email, palavra_passe,
                password_reset_code_hash, password_reset_expires_at, password_reset_attempts,
                password_reset_verified_until, password_reset_token_hash, status, data_criacao
            )
            SELECT {value('id_cliente')},
                   {value('nome')},
                   {value('apelido')},
                   {value('nif')},
                   {value('telefone')},
                   {value('email', "''")},
                   {value('palavra_passe', "''")},
                   {value('password_reset_code_hash')},
                   {value('password_reset_expires_at')},
                   {value('password_reset_attempts', '0')},
                   {value('password_reset_verified_until')},
                   {value('password_reset_token_hash')},
                   {value('status', '1')},
                   COALESCE(NULLIF(TRIM(CAST({value('data_criacao', 'CURRENT_TIMESTAMP')} AS TEXT)), ''), CURRENT_TIMESTAMP)
            FROM cliente
        """))
        conn.execute(text("DROP TABLE cliente"))
        conn.execute(text("ALTER TABLE cliente_new RENAME TO cliente"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_id_cliente ON cliente (id_cliente)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cliente_email ON cliente (email)"))
        conn.commit()
    finally:
        if conn.in_transaction():
            conn.rollback()
        conn.execute(text("PRAGMA foreign_keys=ON"))

    violations = conn.execute(text("PRAGMA foreign_key_check")).fetchall()
    if violations:
        raise RuntimeError(f"SQLite foreign key violations after rebuilding cliente: {violations}")


def _cliente_created_at_needs_rebuild(conn) -> bool:
    for row in conn.execute(text("PRAGMA table_info(cliente)")).fetchall():
        if row[1] != "data_criacao":
            continue
        column_type = str(row[2] or "").upper()
        return "DATETIME" not in column_type
    return True


def _ensure_cliente_created_at_datetime(conn, existing_tables: set[str]) -> None:
    if "cliente" not in existing_tables or not _cliente_created_at_needs_rebuild(conn):
        return
    _rebuild_cliente_without_address_columns(conn, _column_names(conn, "cliente"))


def _normalize_payment_methods(conn, existing_tables: set[str]) -> None:
    if "encomenda" in existing_tables and "metodo_pagamento" in _column_names(conn, "encomenda"):
        conn.execute(text("""
            UPDATE encomenda
            SET metodo_pagamento = 'cartao'
            WHERE metodo_pagamento = 'digital'
        """))
    if "pagamento" in existing_tables and "metodo" in _column_names(conn, "pagamento"):
        conn.execute(text("""
            UPDATE pagamento
            SET metodo = 'cartao'
            WHERE metodo = 'digital'
        """))


def _backfill_order_snapshots(conn, existing_tables: set[str]) -> None:
    if "encomenda_produto" in existing_tables and "produto" in existing_tables:
        item_columns = _column_names(conn, "encomenda_produto")
        if "nome_produto_snapshot" in item_columns:
            conn.execute(text("""
                UPDATE encomenda_produto
                SET nome_produto_snapshot = COALESCE(
                    NULLIF(TRIM(CAST(nome_produto_snapshot AS TEXT)), ''),
                    (SELECT produto.nome FROM produto WHERE produto.id_produto = encomenda_produto.id_produto),
                    CAST(id_produto AS TEXT)
                )
                WHERE TRIM(COALESCE(CAST(nome_produto_snapshot AS TEXT), '')) = ''
            """))
        if "desconto_percentual_snapshot" in item_columns:
            conn.execute(text("""
                UPDATE encomenda_produto
                SET desconto_percentual_snapshot = COALESCE(
                    (SELECT produto.desconto_percentual FROM produto WHERE produto.id_produto = encomenda_produto.id_produto),
                    0
                )
                WHERE desconto_percentual_snapshot IS NULL
            """))
        if "iva_percentual_snapshot" in item_columns:
            conn.execute(text("""
                UPDATE encomenda_produto
                SET iva_percentual_snapshot = 13
                WHERE iva_percentual_snapshot IS NULL OR iva_percentual_snapshot = 0
            """))

    if "encomenda" not in existing_tables or "encomenda_produto" not in existing_tables:
        return

    order_columns = _column_names(conn, "encomenda")
    if "subtotal" in order_columns:
        conn.execute(text("""
            UPDATE encomenda
            SET subtotal = COALESCE((
                SELECT ROUND(SUM(COALESCE(preco_unitario, 0) * COALESCE(quantidade, 0)), 2)
                FROM encomenda_produto
                WHERE encomenda_produto.id_encomenda = encomenda.id_encomenda
            ), 0)
            WHERE subtotal IS NULL OR subtotal = 0
        """))
    if "desconto_total" in order_columns:
        conn.execute(text("""
            UPDATE encomenda
            SET desconto_total = COALESCE(
                CAST(NULLIF(
                    substr(notas, instr(notas, 'coupon_discount=') + length('coupon_discount=')),
                    ''
                ) AS NUMERIC),
                0
            )
            WHERE (desconto_total IS NULL OR desconto_total = 0)
              AND notas LIKE '%coupon_discount=%'
        """))
        conn.execute(text("""
            UPDATE encomenda
            SET desconto_total = 0
            WHERE desconto_total IS NULL
        """))
    if "iva_percentual" in order_columns:
        conn.execute(text("""
            UPDATE encomenda
            SET iva_percentual = 13
            WHERE iva_percentual IS NULL OR iva_percentual = 0
        """))
    if "iva_valor" in order_columns:
        conn.execute(text("""
            UPDATE encomenda
            SET iva_valor = ROUND(COALESCE(total, 0) - (COALESCE(total, 0) / 1.13), 2)
            WHERE (iva_valor IS NULL OR iva_valor = 0) AND COALESCE(total, 0) > 0
        """))


def _create_accounting_indexes(conn, existing_tables: set[str]) -> None:
    statements = []
    if "categoria" in existing_tables:
        statements.append("CREATE INDEX IF NOT EXISTS ix_categoria_id_admin ON categoria (id_admin)")
    if "produto" in existing_tables:
        statements.append("CREATE INDEX IF NOT EXISTS ix_produto_id_admin ON produto (id_admin)")
    if "fatura" in existing_tables:
        statements.extend([
            "CREATE INDEX IF NOT EXISTS ix_fatura_id_fatura ON fatura (id_fatura)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_fatura_id_encomenda ON fatura (id_encomenda)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_fatura_numero_fatura ON fatura (numero_fatura)",
            "CREATE INDEX IF NOT EXISTS ix_fatura_data_emissao ON fatura (data_emissao)",
        ])
    if "empresa_config" in existing_tables:
        statements.append("CREATE INDEX IF NOT EXISTS ix_empresa_config_id ON empresa_config (id)")
    for statement in statements:
        conn.execute(text(statement))


def _sql_value(table_name: str, column_name: str, default_sql: str = "NULL") -> str:
    return column_name if column_name in _CURRENT_COLUMNS[table_name] else default_sql


_CURRENT_COLUMNS: dict[str, set[str]] = {}


def _insert_id_map(conn, table_name: str, mapping: dict[str, int]) -> None:
    conn.execute(text(f"CREATE TEMP TABLE {table_name} (old_id TEXT PRIMARY KEY, new_id INTEGER NOT NULL UNIQUE)"))
    for old_id, new_id in mapping.items():
        conn.execute(
            text(f"INSERT INTO {table_name} (old_id, new_id) VALUES (:old_id, :new_id)"),
            {"old_id": old_id, "new_id": new_id},
        )


def _update_chef_special_setting(conn, product_map: dict[str, int]) -> None:
    row = conn.execute(text("SELECT valor FROM site_setting WHERE chave = 'chef_special'")).fetchone()
    if not row or not row[0]:
        return

    try:
        payload = json.loads(row[0])
    except Exception:
        payload = row[0]

    if isinstance(payload, str):
        product_id = payload
        payload = {"product_id": product_map.get(product_id)}
    elif isinstance(payload, dict):
        product_id = payload.get("product_id")
        if product_id is not None:
            payload["product_id"] = product_map.get(str(product_id), product_id)
    else:
        return

    conn.execute(
        text("UPDATE site_setting SET valor = :valor WHERE chave = 'chef_special'"),
        {"valor": json.dumps(payload)},
    )


def _migrate_product_category_ids_to_integers(conn) -> None:
    logger.info("Migrating product/category IDs from strings to integer primary keys.")
    global _CURRENT_COLUMNS
    affected_tables = ("categoria", "produto", *PRODUCT_FK_TABLES)
    _CURRENT_COLUMNS = {table: _column_names(conn, table) for table in affected_tables}

    category_rows = conn.execute(text("SELECT id_categoria FROM categoria ORDER BY id_categoria")).fetchall()
    product_rows = conn.execute(text("SELECT id_produto FROM produto ORDER BY id_produto")).fetchall()
    category_map = _build_id_mapping(category_rows)
    product_map = _build_id_mapping(product_rows)

    conn.execute(text("PRAGMA foreign_keys=OFF"))
    _insert_id_map(conn, "_category_id_map", category_map)
    _insert_id_map(conn, "_product_id_map", product_map)

    conn.execute(text("""
        CREATE TABLE categoria_new (
            id_categoria INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            nome_categoria VARCHAR(100) NOT NULL,
            descricao_categoria VARCHAR(255),
            id_admin INTEGER NOT NULL REFERENCES admin (id_admin),
            status INTEGER
        )
    """))
    conn.execute(text(f"""
        INSERT INTO categoria_new (id_categoria, nome_categoria, descricao_categoria, id_admin, status)
        SELECT m.new_id,
               {_sql_value('categoria', 'nome_categoria', "''")},
               {_sql_value('categoria', 'descricao_categoria')},
               {_sql_value('categoria', 'id_admin', '1')},
               {_sql_value('categoria', 'status', '1')}
        FROM categoria
        JOIN _category_id_map m ON m.old_id = CAST(categoria.id_categoria AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE produto_new (
            id_produto INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            nome VARCHAR(150) NOT NULL,
            descricao_produto VARCHAR(255),
            preco NUMERIC(10, 2) NOT NULL,
            stock INTEGER NOT NULL,
            id_categoria INTEGER NOT NULL REFERENCES categoria (id_categoria),
            id_admin INTEGER NOT NULL REFERENCES admin (id_admin),
            vendido INTEGER,
            imagem VARCHAR(255),
            status INTEGER,
            customizavel INTEGER NOT NULL DEFAULT 1,
            menu_tags VARCHAR(255),
            destaque INTEGER NOT NULL DEFAULT 0,
            desconto_percentual NUMERIC(5, 2) NOT NULL DEFAULT 0,
            gluten_free INTEGER NOT NULL DEFAULT 0,
            contains_alcohol INTEGER NOT NULL DEFAULT 0,
            deleted_at DATETIME,
            total_calorias NUMERIC(10, 2)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO produto_new (
            id_produto, nome, descricao_produto, preco, stock, id_categoria, id_admin, vendido,
            imagem, status, customizavel, menu_tags, destaque, desconto_percentual,
            gluten_free, contains_alcohol, deleted_at, total_calorias
        )
        SELECT pm.new_id,
               {_sql_value('produto', 'nome', "''")},
               {_sql_value('produto', 'descricao_produto')},
               {_sql_value('produto', 'preco', '0')},
               {_sql_value('produto', 'stock', '0')},
               cm.new_id,
               {_sql_value('produto', 'id_admin', '1')},
               {_sql_value('produto', 'vendido')},
               {_sql_value('produto', 'imagem')},
               {_sql_value('produto', 'status', '1')},
               {_sql_value('produto', 'customizavel', '1')},
               {_sql_value('produto', 'menu_tags')},
               {_sql_value('produto', 'destaque', '0')},
               {_sql_value('produto', 'desconto_percentual', '0')},
               {_sql_value('produto', 'gluten_free', '0')},
               {_sql_value('produto', 'contains_alcohol', '0')},
               {_sql_value('produto', 'deleted_at')},
               {_sql_value('produto', 'total_calorias')}
        FROM produto
        JOIN _product_id_map pm ON pm.old_id = CAST(produto.id_produto AS TEXT)
        JOIN _category_id_map cm ON cm.old_id = CAST(produto.id_categoria AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE imagem_produto_new (
            id_imagem INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            caminho_imagem VARCHAR(255) NOT NULL
        )
    """))
    conn.execute(text(f"""
        INSERT INTO imagem_produto_new (id_imagem, id_produto, caminho_imagem)
        SELECT {_sql_value('imagem_produto', 'id_imagem')}, pm.new_id, {_sql_value('imagem_produto', 'caminho_imagem', "''")}
        FROM imagem_produto
        JOIN _product_id_map pm ON pm.old_id = CAST(imagem_produto.id_produto AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE carrinho_produto_new (
            cart_log_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_carrinho INTEGER NOT NULL REFERENCES carrinho (id_carrinho) ON DELETE CASCADE,
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            quantidade INTEGER NOT NULL DEFAULT 1,
            customizacao VARCHAR(1000)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO carrinho_produto_new (cart_log_id, id_carrinho, id_produto, quantidade, customizacao)
        SELECT {_sql_value('carrinho_produto', 'cart_log_id')},
               {_sql_value('carrinho_produto', 'id_carrinho')},
               pm.new_id,
               {_sql_value('carrinho_produto', 'quantidade', '1')},
               {_sql_value('carrinho_produto', 'customizacao')}
        FROM carrinho_produto
        JOIN _product_id_map pm ON pm.old_id = CAST(carrinho_produto.id_produto AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE produto_ingrediente_new (
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            id_ingrediente INTEGER NOT NULL REFERENCES ingrediente (id_ingrediente),
            incluido_por_defeito INTEGER NOT NULL DEFAULT 1,
            removivel INTEGER NOT NULL DEFAULT 1,
            substituivel INTEGER NOT NULL DEFAULT 0,
            quantidade VARCHAR(50),
            PRIMARY KEY (id_produto, id_ingrediente)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO produto_ingrediente_new (
            id_produto, id_ingrediente, incluido_por_defeito, removivel, substituivel, quantidade
        )
        SELECT pm.new_id,
               {_sql_value('produto_ingrediente', 'id_ingrediente')},
               {_sql_value('produto_ingrediente', 'incluido_por_defeito', '1')},
               {_sql_value('produto_ingrediente', 'removivel', '1')},
               {_sql_value('produto_ingrediente', 'substituivel', '0')},
               {_sql_value('produto_ingrediente', 'quantidade')}
        FROM produto_ingrediente
        JOIN _product_id_map pm ON pm.old_id = CAST(produto_ingrediente.id_produto AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE produto_opcao_customizacao_new (
            id_opcao INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            id_ingrediente INTEGER REFERENCES ingrediente (id_ingrediente),
            nome VARCHAR(150) NOT NULL,
            tipo VARCHAR(20) NOT NULL,
            preco_extra NUMERIC(10, 2) NOT NULL DEFAULT 0,
            max_quantidade INTEGER NOT NULL DEFAULT 1,
            status INTEGER NOT NULL DEFAULT 1
        )
    """))
    conn.execute(text(f"""
        INSERT INTO produto_opcao_customizacao_new (
            id_opcao, id_produto, id_ingrediente, nome, tipo, preco_extra, max_quantidade, status
        )
        SELECT {_sql_value('produto_opcao_customizacao', 'id_opcao')},
               pm.new_id,
               {_sql_value('produto_opcao_customizacao', 'id_ingrediente')},
               {_sql_value('produto_opcao_customizacao', 'nome', "''")},
               {_sql_value('produto_opcao_customizacao', 'tipo', "'EXTRA'")},
               {_sql_value('produto_opcao_customizacao', 'preco_extra', '0')},
               {_sql_value('produto_opcao_customizacao', 'max_quantidade', '1')},
               {_sql_value('produto_opcao_customizacao', 'status', '1')}
        FROM produto_opcao_customizacao
        JOIN _product_id_map pm ON pm.old_id = CAST(produto_opcao_customizacao.id_produto AS TEXT)
    """))

    conn.execute(text("""
        CREATE TABLE encomenda_produto_new (
            id_encomenda_produto INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_encomenda INTEGER NOT NULL REFERENCES encomenda (id_encomenda),
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            quantidade INTEGER NOT NULL,
            preco_unitario NUMERIC(10, 2) NOT NULL,
            nome_produto_snapshot VARCHAR(150) NOT NULL DEFAULT '',
            desconto_percentual_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 0,
            iva_percentual_snapshot NUMERIC(5, 2) NOT NULL DEFAULT 13,
            customizacao VARCHAR(1000)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO encomenda_produto_new (
            id_encomenda_produto, id_encomenda, id_produto, quantidade, preco_unitario,
            nome_produto_snapshot, desconto_percentual_snapshot, iva_percentual_snapshot, customizacao
        )
        SELECT {_sql_value('encomenda_produto', 'id_encomenda_produto')},
               {_sql_value('encomenda_produto', 'id_encomenda')},
               pm.new_id,
               {_sql_value('encomenda_produto', 'quantidade', '1')},
               {_sql_value('encomenda_produto', 'preco_unitario', '0')},
               COALESCE(NULLIF(TRIM(CAST({_sql_value('encomenda_produto', 'nome_produto_snapshot', 'produto.nome')} AS TEXT)), ''), produto.nome, ''),
               {_sql_value('encomenda_produto', 'desconto_percentual_snapshot', 'COALESCE(produto.desconto_percentual, 0)')},
               {_sql_value('encomenda_produto', 'iva_percentual_snapshot', '13')},
               {_sql_value('encomenda_produto', 'customizacao')}
        FROM encomenda_produto
        JOIN _product_id_map pm ON pm.old_id = CAST(encomenda_produto.id_produto AS TEXT)
        LEFT JOIN produto ON produto.id_produto = encomenda_produto.id_produto
    """))

    conn.execute(text("""
        CREATE TABLE produto_review_new (
            id_review INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            id_produto INTEGER NOT NULL REFERENCES produto (id_produto),
            id_cliente INTEGER NOT NULL REFERENCES cliente (id_cliente),
            id_encomenda_produto INTEGER UNIQUE REFERENCES encomenda_produto (id_encomenda_produto),
            rating INTEGER NOT NULL,
            titulo VARCHAR(120),
            comentario VARCHAR(1000),
            status VARCHAR(8) NOT NULL,
            data_criacao DATETIME NOT NULL,
            data_atualizacao DATETIME NOT NULL,
            CONSTRAINT uq_review_encomenda_produto UNIQUE (id_encomenda_produto),
            CONSTRAINT uq_review_cliente_produto UNIQUE (id_cliente, id_produto)
        )
    """))
    conn.execute(text(f"""
        INSERT INTO produto_review_new (
            id_review, id_produto, id_cliente, id_encomenda_produto, rating,
            titulo, comentario, status, data_criacao, data_atualizacao
        )
        SELECT {_sql_value('produto_review', 'id_review')},
               pm.new_id,
               {_sql_value('produto_review', 'id_cliente')},
               {_sql_value('produto_review', 'id_encomenda_produto')},
               {_sql_value('produto_review', 'rating', '5')},
               {_sql_value('produto_review', 'titulo')},
               {_sql_value('produto_review', 'comentario')},
               {_sql_value('produto_review', 'status', "'aprovado'")},
               {_sql_value('produto_review', 'data_criacao', 'CURRENT_TIMESTAMP')},
               {_sql_value('produto_review', 'data_atualizacao', 'CURRENT_TIMESTAMP')}
        FROM produto_review
        JOIN _product_id_map pm ON pm.old_id = CAST(produto_review.id_produto AS TEXT)
        WHERE NOT EXISTS (
            SELECT 1
            FROM produto_review newer_review
            JOIN _product_id_map newer_pm ON newer_pm.old_id = CAST(newer_review.id_produto AS TEXT)
            WHERE newer_review.id_cliente = produto_review.id_cliente
              AND newer_pm.new_id = pm.new_id
              AND (
                datetime(COALESCE(newer_review.data_atualizacao, newer_review.data_criacao, '1970-01-01')) >
                  datetime(COALESCE(produto_review.data_atualizacao, produto_review.data_criacao, '1970-01-01'))
                OR (
                  datetime(COALESCE(newer_review.data_atualizacao, newer_review.data_criacao, '1970-01-01')) =
                    datetime(COALESCE(produto_review.data_atualizacao, produto_review.data_criacao, '1970-01-01'))
                  AND newer_review.id_review > produto_review.id_review
                )
              )
        )
    """))

    _update_chef_special_setting(conn, product_map)

    for table_name in reversed(affected_tables):
        conn.execute(text(f"DROP TABLE {table_name}"))
    for table_name in affected_tables:
        conn.execute(text(f"ALTER TABLE {table_name}_new RENAME TO {table_name}"))

    _create_product_category_indexes(conn)
    conn.execute(text("DROP TABLE _category_id_map"))
    conn.execute(text("DROP TABLE _product_id_map"))
    conn.execute(text("PRAGMA foreign_keys=ON"))
    logger.info("Migrated %d categories and %d products to integer IDs.", len(category_map), len(product_map))


def _create_product_category_indexes(conn) -> None:
    index_statements = [
        "CREATE INDEX IF NOT EXISTS ix_categoria_id_categoria ON categoria (id_categoria)",
        "CREATE INDEX IF NOT EXISTS ix_produto_id_produto ON produto (id_produto)",
        "CREATE INDEX IF NOT EXISTS ix_produto_deleted_at ON produto (deleted_at)",
        "CREATE INDEX IF NOT EXISTS ix_imagem_produto_id_imagem ON imagem_produto (id_imagem)",
        "CREATE INDEX IF NOT EXISTS ix_carrinho_produto_cart_log_id ON carrinho_produto (cart_log_id)",
        "CREATE INDEX IF NOT EXISTS ix_produto_opcao_customizacao_id_opcao ON produto_opcao_customizacao (id_opcao)",
        "CREATE INDEX IF NOT EXISTS ix_encomenda_produto_id_encomenda_produto ON encomenda_produto (id_encomenda_produto)",
        "CREATE INDEX IF NOT EXISTS ix_produto_review_id_review ON produto_review (id_review)",
        "CREATE INDEX IF NOT EXISTS ix_produto_review_id_produto ON produto_review (id_produto)",
        "CREATE INDEX IF NOT EXISTS ix_produto_review_rating ON produto_review (rating)",
        "CREATE INDEX IF NOT EXISTS ix_produto_review_status ON produto_review (status)",
        "CREATE INDEX IF NOT EXISTS ix_produto_review_data_criacao ON produto_review (data_criacao)",
    ]
    for statement in index_statements:
        conn.execute(text(statement))
