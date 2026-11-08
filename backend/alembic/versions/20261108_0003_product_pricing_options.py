"""Add browse-only catalog pricing options; preserve legacy purchase data."""
from alembic import op
import sqlalchemy as sa

revision = "20261108_0003"
down_revision = "20261103_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "product_pricing_option",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("product.id", ondelete="CASCADE"), nullable=False),
        sa.Column("label", sa.String(150), nullable=False),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_available", sa.Boolean(), nullable=False),
        sa.CheckConstraint("kind IN ('portion', 'addon', 'replacement')", name="ck_pricing_option_kind"),
        sa.CheckConstraint("price >= 0", name="ck_pricing_option_price"),
        sa.CheckConstraint("display_order >= 0", name="ck_pricing_option_order"),
    )
    op.create_index("ix_product_pricing_option_product_id", "product_pricing_option", ["product_id"])
    op.create_table(
        "product_pricing_option_translation",
        sa.Column("option_id", sa.Integer(), sa.ForeignKey("product_pricing_option.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("locale", sa.String(5), primary_key=True),
        sa.Column("name", sa.String(150), nullable=True),
        sa.CheckConstraint("locale IN ('en-GB', 'de-DE')", name="ck_pricing_option_translation_locale"),
    )


def downgrade():
    op.drop_table("product_pricing_option_translation")
    op.drop_index("ix_product_pricing_option_product_id", table_name="product_pricing_option")
    op.drop_table("product_pricing_option")
