"""Add media tables

Revision ID: a2f4c6d8e901
Revises: e8b4c2d6f901
Create Date: 2026-08-21 20:12:00.000000

This migration only adds new media tables. It preserves legacy product_image
rows so existing image URLs keep working during rollout and migration.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2f4c6d8e901"
down_revision: Union[str, None] = "e8b4c2d6f901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _index_exists(bind, table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(bind)
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "media"):
        op.create_table(
            "media",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("owner_type", sa.Enum("product", name="mediaownertype"), nullable=False),
            sa.Column("original_filename", sa.String(length=255), nullable=True),
            sa.Column("content_type", sa.String(length=100), nullable=False),
            sa.Column("storage_key", sa.String(length=500), nullable=False),
            sa.Column("public_url", sa.String(length=500), nullable=False),
            sa.Column("width", sa.Integer(), nullable=True),
            sa.Column("height", sa.Integer(), nullable=True),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("storage_key"),
        )
    if not _index_exists(bind, "media", "ix_media_id"):
        op.create_index("ix_media_id", "media", ["id"], unique=False)
    if not _index_exists(bind, "media", "ix_media_owner_type"):
        op.create_index("ix_media_owner_type", "media", ["owner_type"], unique=False)

    if not _table_exists(bind, "media_variant"):
        op.create_table(
            "media_variant",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("media_id", sa.Integer(), nullable=False),
            sa.Column("kind", sa.Enum("original", "thumb", "card", "detail", name="mediavariantkind"), nullable=False),
            sa.Column("storage_key", sa.String(length=500), nullable=False),
            sa.Column("public_url", sa.String(length=500), nullable=False),
            sa.Column("content_type", sa.String(length=100), nullable=False),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("size_bytes", sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("media_id", "kind", name="uq_media_variant_media_kind"),
            sa.UniqueConstraint("storage_key"),
        )
    if not _index_exists(bind, "media_variant", "ix_media_variant_id"):
        op.create_index("ix_media_variant_id", "media_variant", ["id"], unique=False)
    if not _index_exists(bind, "media_variant", "ix_media_variant_media_id"):
        op.create_index("ix_media_variant_media_id", "media_variant", ["media_id"], unique=False)

    if not _table_exists(bind, "product_media"):
        op.create_table(
            "product_media",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("product_id", sa.Integer(), nullable=False),
            sa.Column("media_id", sa.Integer(), nullable=False),
            sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
            sa.Column("alt_text", sa.String(length=255), nullable=True),
            sa.Column("is_primary", sa.Boolean(), server_default="0", nullable=False),
            sa.ForeignKeyConstraint(["media_id"], ["media.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["product_id"], ["product.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("product_id", "media_id", name="uq_product_media_product_media"),
        )
    if not _index_exists(bind, "product_media", "ix_product_media_id"):
        op.create_index("ix_product_media_id", "product_media", ["id"], unique=False)
    if not _index_exists(bind, "product_media", "ix_product_media_media_id"):
        op.create_index("ix_product_media_media_id", "product_media", ["media_id"], unique=False)
    if not _index_exists(bind, "product_media", "ix_product_media_product_id"):
        op.create_index("ix_product_media_product_id", "product_media", ["product_id"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "product_media"):
        op.drop_table("product_media")
    if _table_exists(bind, "media_variant"):
        op.drop_table("media_variant")
    if _table_exists(bind, "media"):
        op.drop_table("media")