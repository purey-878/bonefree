"""Add disabled-by-default reservations and independent promotion configuration."""
from alembic import op
import sqlalchemy as sa
revision = '20261108_0004'
down_revision = '20261108_0003'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('reservation_settings', sa.Column('id', sa.Integer(), primary_key=True), sa.Column('config', sa.JSON(), nullable=False), sa.CheckConstraint('id = 1', name='ck_reservation_settings_singleton'))
    op.execute(sa.text("INSERT INTO reservation_settings (id, config) VALUES (1, '{\"enabled\": false}')"))
    op.create_table('reservation_exception', sa.Column('day', sa.Date(), primary_key=True), sa.Column('closed', sa.Boolean(), nullable=False), sa.Column('windows', sa.JSON(), nullable=False))
    op.create_table('reservation_promotion',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False), sa.Column('automatic', sa.Boolean(), nullable=False), sa.Column('start_date', sa.Date(), nullable=False), sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('percentage', sa.Numeric(5, 2), nullable=False), sa.Column('content', sa.JSON(), nullable=False),
        sa.CheckConstraint('percentage > 0 AND percentage <= 100', name='ck_reservation_promotion_percentage'), sa.CheckConstraint('end_date >= start_date', name='ck_reservation_promotion_dates'))
    op.create_table('reservation',
        sa.Column('id', sa.Integer(), primary_key=True), sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('reference', sa.String(24), nullable=False, unique=True), sa.Column('token_hash', sa.String(64), nullable=False, unique=True), sa.Column('token_salt', sa.String(64), nullable=False),
        sa.Column('idempotency_hash', sa.String(64), nullable=False, unique=True), sa.Column('payload_hash', sa.String(64), nullable=False),
        sa.Column('name', sa.String(120), nullable=False), sa.Column('email', sa.String(254)), sa.Column('phone', sa.String(32)), sa.Column('special_requests', sa.Text()),
        sa.Column('day', sa.Date(), nullable=False), sa.Column('slot', sa.Time(), nullable=False), sa.Column('guests', sa.Integer(), nullable=False), sa.Column('status', sa.String(16), nullable=False),
        sa.Column('promotion_id', sa.Integer(), sa.ForeignKey('reservation_promotion.id', ondelete='SET NULL')), sa.Column('promotion_snapshot', sa.JSON()), sa.Column('venue', sa.JSON(), nullable=False),
        sa.CheckConstraint('guests > 0 AND guests <= 100', name='ck_reservation_guests'), sa.CheckConstraint("status IN ('confirmed','cancelled','completed','no_show')", name='ck_reservation_status'))
    op.create_index('ix_reservation_capacity', 'reservation', ['day', 'slot', 'status'])


def downgrade():
    op.drop_index('ix_reservation_capacity', table_name='reservation')
    op.drop_table('reservation')
    op.drop_table('reservation_promotion')
    op.drop_table('reservation_exception')
    op.drop_table('reservation_settings')
