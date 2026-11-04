"""Add optional catalog translations without modifying Portuguese originals."""
from alembic import op
import sqlalchemy as sa

revision = "20261103_0002"
down_revision = "20260822_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for entity, name_length in (("product", 150), ("category", 100), ("ingredient", 120)):
        columns = [
            sa.Column(f"{entity}_id", sa.Integer(), sa.ForeignKey(f"{entity}.id", ondelete="CASCADE"), primary_key=True),
            sa.Column("locale", sa.String(5), primary_key=True),
            sa.Column("name", sa.String(name_length), nullable=True),
        ]
        if entity != "ingredient":
            columns.append(sa.Column("description", sa.String(255), nullable=True))
        if entity == "product":
            columns.append(sa.Column("menu_tags", sa.String(255), nullable=True))
        op.create_table(
            f"{entity}_translation", *columns,
            sa.CheckConstraint("locale IN ('en-GB', 'de-DE')", name=f"ck_{entity}_translation_locale"),
        )


def downgrade() -> None:
    for entity in ("ingredient", "category", "product"):
        op.drop_table(f"{entity}_translation")
