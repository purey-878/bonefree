"""Remove legacy product images after the folder-first Media cutover.

Revision ID: b6d8f0a2c4e7
Revises: a2f4c6d8e901
Create Date: 2026-08-22 12:00:00.000000
"""

from pathlib import Path
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6d8f0a2c4e7"
down_revision: Union[str, None] = "a2f4c6d8e901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


PRODUCT_FOLDER_PATTERN = re.compile(r"^PRD-(\d+)$")
VARIANT_SUFFIXES = ("thumb", "card", "detail")


def _table_exists(bind, table_name: str) -> bool:
    return table_name in sa.inspect(bind).get_table_names()


def _column_exists(bind, table_name: str, column_name: str) -> bool:
    return any(
        column["name"] == column_name
        for column in sa.inspect(bind).get_columns(table_name)
    )


def _index_exists(bind, table_name: str, index_name: str) -> bool:
    return any(
        index["name"] == index_name
        for index in sa.inspect(bind).get_indexes(table_name)
    )


def _one_file_for_suffix(folder: Path, suffix: str) -> Path:
    matches = sorted(
        path for path in folder.iterdir()
        if path.is_file() and path.name.endswith(f"-{suffix}.webp")
    )
    if len(matches) != 1:
        raise RuntimeError(
            f"{folder.name} must contain exactly one '*-{suffix}.webp' file; "
            f"found {len(matches)}."
        )
    return matches[0]


def _audit_folder_media(bind) -> None:
    if not _table_exists(bind, "product"):
        return
    product_count = bind.scalar(sa.text("SELECT COUNT(*) FROM product")) or 0
    if product_count == 0:
        return

    media_count = bind.scalar(sa.text("SELECT COUNT(*) FROM media")) or 0
    if media_count == 0:
        legacy_image_count = (
            bind.scalar(sa.text("SELECT COUNT(*) FROM product_image")) or 0
            if _table_exists(bind, "product_image")
            else 0
        )
        if legacy_image_count:
            raise RuntimeError(
                "Legacy product images still exist but the Media backfill has not been applied."
            )
        return

    uploads_root = Path(__file__).resolve().parents[3] / "uploads"
    products_root = uploads_root / "products"
    if not products_root.exists():
        raise RuntimeError(f"Product uploads directory does not exist: {products_root}")

    folders = sorted(
        folder for folder in products_root.iterdir()
        if folder.is_dir() and PRODUCT_FOLDER_PATTERN.fullmatch(folder.name)
    )
    for folder in folders:
        product_id = int(PRODUCT_FOLDER_PATTERN.fullmatch(folder.name).group(1))
        if bind.scalar(
            sa.text("SELECT 1 FROM product WHERE id = :product_id"),
            {"product_id": product_id},
        ) is None:
            raise RuntimeError(
                f"Upload folder {folder.name} does not correspond to an existing product."
            )

        original = _one_file_for_suffix(folder, "original")
        variant_files = {
            kind: _one_file_for_suffix(folder, kind)
            for kind in VARIANT_SUFFIXES
        }
        original_key = original.relative_to(uploads_root).as_posix()
        media_rows = bind.execute(
            sa.text(
                "SELECT id FROM media "
                "WHERE storage_key = :storage_key AND owner_type = 'product'"
            ),
            {"storage_key": original_key},
        ).all()
        if len(media_rows) != 1:
            raise RuntimeError(
                f"{folder.name} must map to exactly one product Media row; "
                f"found {len(media_rows)}."
            )
        media_id = media_rows[0].id

        variants = bind.execute(
            sa.text(
                "SELECT kind, storage_key FROM media_variant WHERE media_id = :media_id"
            ),
            {"media_id": media_id},
        ).all()
        actual_variants = {row.kind: row.storage_key for row in variants}
        expected_variants = {
            kind: path.relative_to(uploads_root).as_posix()
            for kind, path in variant_files.items()
        }
        if len(variants) != 3 or actual_variants != expected_variants:
            raise RuntimeError(
                f"{folder.name} does not have exactly the expected thumb, card, and detail variants."
            )

        links = bind.execute(
            sa.text(
                "SELECT id FROM product_media "
                "WHERE product_id = :product_id AND media_id = :media_id"
            ),
            {"product_id": product_id, "media_id": media_id},
        ).all()
        if len(links) != 1:
            raise RuntimeError(
                f"{folder.name} must map to exactly one ProductMedia row; found {len(links)}."
            )


def upgrade() -> None:
    bind = op.get_bind()
    _audit_folder_media(bind)

    if not _index_exists(
        bind,
        "product_media",
        "uq_product_media_product_sort_order",
    ):
        op.create_index(
            "uq_product_media_product_sort_order",
            "product_media",
            ["product_id", "sort_order"],
            unique=True,
        )

    if not _index_exists(
        bind,
        "product_media",
        "uq_product_media_primary_per_product",
    ):
        op.create_index(
            "uq_product_media_primary_per_product",
            "product_media",
            ["product_id"],
            unique=True,
            sqlite_where=sa.text("is_primary = 1"),
            postgresql_where=sa.text("is_primary"),
        )

    if _table_exists(bind, "product_image"):
        op.drop_table("product_image")
    if _table_exists(bind, "product") and _column_exists(bind, "product", "image"):
        with op.batch_alter_table("product") as batch_op:
            batch_op.drop_column("image")


def downgrade() -> None:
    bind = op.get_bind()

    if _table_exists(bind, "product") and not _column_exists(bind, "product", "image"):
        with op.batch_alter_table("product") as batch_op:
            batch_op.add_column(sa.Column("image", sa.String(length=255), nullable=True))

    if not _table_exists(bind, "product_image"):
        op.create_table(
            "product_image",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("product_id", sa.Integer(), nullable=False),
            sa.Column("image_path", sa.String(length=255), nullable=False),
            sa.ForeignKeyConstraint(["product_id"], ["product.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_product_image_id", "product_image", ["id"], unique=False)

    bind.execute(sa.text(
        """
        INSERT INTO product_image (created_at, updated_at, product_id, image_path)
        SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, pm.product_id,
               COALESCE(card.public_url, m.public_url)
        FROM product_media AS pm
        JOIN media AS m ON m.id = pm.media_id
        LEFT JOIN media_variant AS card
          ON card.media_id = m.id AND card.kind = 'card'
        ORDER BY pm.product_id, pm.sort_order, pm.id
        """
    ))
    if _table_exists(bind, "product"):
        bind.execute(sa.text(
            """
            UPDATE product
            SET image = (
                SELECT COALESCE(card.public_url, m.public_url)
                FROM product_media AS pm
                JOIN media AS m ON m.id = pm.media_id
                LEFT JOIN media_variant AS card
                  ON card.media_id = m.id AND card.kind = 'card'
                WHERE pm.product_id = product.id
                ORDER BY pm.is_primary DESC, pm.sort_order, pm.id
                LIMIT 1
            )
            """
        ))

    if _index_exists(bind, "product_media", "uq_product_media_primary_per_product"):
        op.drop_index("uq_product_media_primary_per_product", table_name="product_media")
    if _index_exists(
        bind,
        "product_media",
        "uq_product_media_product_sort_order",
    ):
        op.drop_index("uq_product_media_product_sort_order", table_name="product_media")
