"""Add isolated Meal Finder configuration; preserve all catalog and booking data."""
from alembic import op
import sqlalchemy as sa
revision = '20261110_0005'
down_revision = '20261108_0004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('meal_finder_settings', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('version', sa.Integer(), nullable=False), sa.Column('config', sa.JSON(), nullable=False), sa.CheckConstraint('id = 1', name='ck_meal_finder_singleton'))
    op.create_table('product_meal_finder', sa.Column('product_id', sa.Integer(), sa.ForeignKey('product.id', ondelete='CASCADE'), primary_key=True), sa.Column('attributes', sa.JSON(), nullable=False))


def downgrade():
    op.drop_table('product_meal_finder')
    op.drop_table('meal_finder_settings')
