"""Create the canonical Bonefree schema from an empty database.

Revision ID: 20260822_0001
Revises:
Create Date: 2026-08-22 16:20:38.389812

This is a static schema snapshot. Do not import application metadata here:
future model changes must be represented by new Alembic revisions.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260822_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUM_DEFINITIONS: dict[str, tuple[str, ...]] = {
    "cancellationorigin": ("client", "admin", "system"),
    "cartcustomizationaction": (
        "remove_ingredient",
        "add_extra",
        "substitute_sauce",
        "substitute_side",
    ),
    "coupontype": ("fixed_value", "percentage"),
    "entitystatus": ("active", "inactive"),
    "ingredienttype": ("normal", "sauce", "extra", "drink", "base", "side"),
    "mediaownertype": ("product",),
    "mediavariantkind": ("original", "thumb", "card", "detail"),
    "orderstate": (
        "pending",
        "confirmed",
        "in_preparation",
        "ready",
        "delivered",
        "cancelled",
    ),
    "paymentmethod": ("card", "mbway", "counter"),
    "paymentstate": ("pending", "approved", "rejected"),
    "paymentstatus": ("unpaid", "paid"),
    "productcustomizationoptiontype": (
        "add",
        "remove",
        "extra",
        "substitute_sauce",
        "substitute_side",
    ),
    "reviewreactiontype": ("like", "heart"),
    "reviewstatus": ("pending", "approved", "rejected"),
    "sitesettingkey": (
        "site_theme",
        "chef_special",
        "loyalty_coupon",
        "company_details",
        "social_media",
        "events",
    ),
    "userrole": ("owner", "manager", "waiter", "chef", "client"),
    "userstatus": ("active", "suspended", "pending"),
}


def _enum(name: str) -> sa.Enum:
    values = ENUM_DEFINITIONS[name]
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM(*values, name=name, create_type=False)
    return sa.Enum(*values, name=name)


def _create_postgresql_enums() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for name, values in ENUM_DEFINITIONS.items():
            postgresql.ENUM(*values, name=name).create(bind, checkfirst=False)


def _drop_postgresql_enums() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for name, values in reversed(ENUM_DEFINITIONS.items()):
            postgresql.ENUM(*values, name=name).drop(bind, checkfirst=False)


def upgrade() -> None:
    """Upgrade schema."""
    _create_postgresql_enums()
    op.create_table('company_config',
    sa.Column('company_name', sa.String(length=150), nullable=False),
    sa.Column('company_tax_id', sa.String(length=20), nullable=False),
    sa.Column('address', sa.String(length=255), nullable=True),
    sa.Column('postal_code', sa.String(length=20), nullable=True),
    sa.Column('city', sa.String(length=100), nullable=True),
    sa.Column('country', sa.String(length=100), server_default='Portugal', nullable=False),
    sa.Column('email', sa.String(length=150), nullable=True),
    sa.Column('phone', sa.String(length=30), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_company_config_id'), 'company_config', ['id'], unique=False)
    op.create_table('ingredient',
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('type', _enum('ingredienttype'), nullable=False),
    sa.Column('status', _enum('entitystatus'), nullable=False),
    sa.Column('available', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('calories_per_gram', sa.Numeric(precision=8, scale=4), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_ingredient_id'), 'ingredient', ['id'], unique=False)
    op.create_index(op.f('ix_ingredient_status'), 'ingredient', ['status'], unique=False)
    op.create_table('media',
    sa.Column('owner_type', _enum('mediaownertype'), nullable=False),
    sa.Column('original_filename', sa.String(length=255), nullable=True),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('storage_key', sa.String(length=500), nullable=False),
    sa.Column('public_url', sa.String(length=500), nullable=False),
    sa.Column('width', sa.Integer(), nullable=True),
    sa.Column('height', sa.Integer(), nullable=True),
    sa.Column('size_bytes', sa.Integer(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index(op.f('ix_media_id'), 'media', ['id'], unique=False)
    op.create_index(op.f('ix_media_owner_type'), 'media', ['owner_type'], unique=False)
    op.create_table('site_setting',
    sa.Column('key', _enum('sitesettingkey'), nullable=False),
    sa.Column('value', sa.Text(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_site_setting_id'), 'site_setting', ['id'], unique=False)
    op.create_index(op.f('ix_site_setting_key'), 'site_setting', ['key'], unique=True)
    op.create_table('user',
    sa.Column('name', sa.String(length=100), nullable=True),
    sa.Column('last_name', sa.String(length=100), nullable=True),
    sa.Column('tax_id', sa.String(length=20), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('email', sa.String(length=150), nullable=False),
    sa.Column('password', sa.String(length=255), nullable=False),
    sa.Column('password_reset_code_hash', sa.String(length=255), nullable=True),
    sa.Column('password_reset_expires_at', sa.DateTime(), nullable=True),
    sa.Column('password_reset_attempts', sa.Integer(), nullable=True),
    sa.Column('password_reset_verified_until', sa.DateTime(), nullable=True),
    sa.Column('password_reset_token_hash', sa.String(length=255), nullable=True),
    sa.Column('status', _enum('userstatus'), nullable=False),
    sa.Column('role', _enum('userrole'), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('tax_id')
    )
    op.create_index(op.f('ix_user_email'), 'user', ['email'], unique=True)
    op.create_index(op.f('ix_user_id'), 'user', ['id'], unique=False)
    op.create_index(op.f('ix_user_role'), 'user', ['role'], unique=False)
    op.create_index(op.f('ix_user_status'), 'user', ['status'], unique=False)
    op.create_table('cart',
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cart_id'), 'cart', ['id'], unique=False)
    op.create_table('category',
    sa.Column('category_name', sa.String(length=100), nullable=False),
    sa.Column('category_description', sa.String(length=255), nullable=True),
    sa.Column('admin_id', sa.Integer(), nullable=False),
    sa.Column('status', _enum('entitystatus'), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_category_admin_id'), 'category', ['admin_id'], unique=False)
    op.create_index(op.f('ix_category_id'), 'category', ['id'], unique=False)
    op.create_index(op.f('ix_category_status'), 'category', ['status'], unique=False)
    op.create_table('coupon',
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('type', _enum('coupontype'), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('minimum_order_value', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('used', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('used_at', sa.DateTime(), nullable=True),
    sa.Column('expires_at', sa.DateTime(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_coupon_code'), 'coupon', ['code'], unique=True)
    op.create_index(op.f('ix_coupon_id'), 'coupon', ['id'], unique=False)
    op.create_table('customer_billing_address',
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('address', sa.String(length=255), nullable=True),
    sa.Column('postal_code', sa.String(length=20), nullable=True),
    sa.Column('city', sa.String(length=100), nullable=True),
    sa.Column('country', sa.String(length=100), server_default='Portugal', nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_billing_address_customer_id'), 'customer_billing_address', ['customer_id'], unique=True)
    op.create_index(op.f('ix_customer_billing_address_id'), 'customer_billing_address', ['id'], unique=False)
    op.create_table('customer_loyalty',
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('orders_above_50', sa.Integer(), nullable=False),
    sa.Column('total_coupons_earned', sa.Integer(), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_loyalty_customer_id'), 'customer_loyalty', ['customer_id'], unique=True)
    op.create_index(op.f('ix_customer_loyalty_id'), 'customer_loyalty', ['id'], unique=False)
    op.create_table('customer_order',
    sa.Column('customer_id', sa.Integer(), nullable=True),
    sa.Column('admin_id', sa.Integer(), nullable=True),
    sa.Column('customer_first_name', sa.String(length=100), nullable=True),
    sa.Column('customer_last_name', sa.String(length=100), nullable=True),
    sa.Column('customer_email', sa.String(length=150), nullable=True),
    sa.Column('customer_phone', sa.String(length=20), nullable=True),
    sa.Column('customer_tax_id', sa.String(length=20), nullable=True),
    sa.Column('order_access_token_hash', sa.String(length=64), nullable=True),
    sa.Column('order_access_expires_at', sa.DateTime(), nullable=True),
    sa.Column('ordered_at', sa.DateTime(), nullable=False),
    sa.Column('state', _enum('orderstate'), nullable=False),
    sa.Column('payment_method', _enum('paymentmethod'), nullable=False),
    sa.Column('payment_status', _enum('paymentstatus'), nullable=False),
    sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('vat_percentage', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('vat_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('total_discount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('total', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('notes', sa.String(length=500), nullable=True),
    sa.Column('canceled_at', sa.DateTime(), nullable=True),
    sa.Column('cancellation_origin', _enum('cancellationorigin'), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_customer_order_id'), 'customer_order', ['id'], unique=False)
    op.create_index(op.f('ix_customer_order_order_access_token_hash'), 'customer_order', ['order_access_token_hash'], unique=True)
    op.create_table('media_variant',
    sa.Column('media_id', sa.Integer(), nullable=False),
    sa.Column('kind', _enum('mediavariantkind'), nullable=False),
    sa.Column('storage_key', sa.String(length=500), nullable=False),
    sa.Column('public_url', sa.String(length=500), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('width', sa.Integer(), nullable=False),
    sa.Column('height', sa.Integer(), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['media_id'], ['media.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('media_id', 'kind', name='uq_media_variant_media_kind'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index(op.f('ix_media_variant_id'), 'media_variant', ['id'], unique=False)
    op.create_index(op.f('ix_media_variant_media_id'), 'media_variant', ['media_id'], unique=False)
    op.create_table('session',
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('token_hash', sa.String(length=255), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('revoked', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_session_id'), 'session', ['id'], unique=False)
    op.create_index(op.f('ix_session_token_hash'), 'session', ['token_hash'], unique=True)
    op.create_index(op.f('ix_session_user_id'), 'session', ['user_id'], unique=False)
    op.create_table('invoice',
    sa.Column('order_id', sa.Integer(), nullable=False),
    sa.Column('invoice_number', sa.String(length=40), nullable=False),
    sa.Column('customer_tax_id', sa.String(length=20), nullable=True),
    sa.Column('customer_name', sa.String(length=200), nullable=True),
    sa.Column('customer_address', sa.String(length=500), nullable=True),
    sa.Column('subtotal', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('vat_percentage', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('vat_amount', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('total', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('issued_at', sa.DateTime(), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['customer_order.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_invoice_id'), 'invoice', ['id'], unique=False)
    op.create_index(op.f('ix_invoice_invoice_number'), 'invoice', ['invoice_number'], unique=True)
    op.create_index(op.f('ix_invoice_issued_at'), 'invoice', ['issued_at'], unique=False)
    op.create_index(op.f('ix_invoice_order_id'), 'invoice', ['order_id'], unique=True)
    op.create_table('payment',
    sa.Column('order_id', sa.Integer(), nullable=False),
    sa.Column('method', _enum('paymentmethod'), nullable=False),
    sa.Column('state', _enum('paymentstate'), nullable=False),
    sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('transaction_reference', sa.String(length=100), nullable=True),
    sa.Column('paid_at', sa.DateTime(), nullable=True),
    sa.Column('confirmed_by_admin_id', sa.Integer(), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['confirmed_by_admin_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['order_id'], ['customer_order.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('order_id')
    )
    op.create_index(op.f('ix_payment_id'), 'payment', ['id'], unique=False)
    op.create_table('product',
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('product_description', sa.String(length=255), nullable=True),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('available', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('category_id', sa.Integer(), nullable=False),
    sa.Column('admin_id', sa.Integer(), nullable=False),
    sa.Column('sold', sa.Integer(), nullable=True),
    sa.Column('status', _enum('entitystatus'), nullable=False),
    sa.Column('customizable', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('menu_tags', sa.String(length=255), nullable=True),
    sa.Column('featured', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('discount_percentual', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('gluten_free', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('contains_alcohol', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('deleted_at', sa.DateTime(), nullable=True),
    sa.Column('total_calories', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['category_id'], ['category.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_admin_id'), 'product', ['admin_id'], unique=False)
    op.create_index(op.f('ix_product_deleted_at'), 'product', ['deleted_at'], unique=False)
    op.create_index(op.f('ix_product_id'), 'product', ['id'], unique=False)
    op.create_index(op.f('ix_product_status'), 'product', ['status'], unique=False)
    op.create_table('cart_product',
    sa.Column('cart_id', sa.Integer(), nullable=False),
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('customization', sa.String(length=1000), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['cart_id'], ['cart.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cart_product_id'), 'cart_product', ['id'], unique=False)
    op.create_table('order_product',
    sa.Column('order_id', sa.Integer(), nullable=False),
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('unit_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('product_name_snapshot', sa.String(length=150), nullable=False),
    sa.Column('discount_percentage_snapshot', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('vat_percentage_snapshot', sa.Numeric(precision=5, scale=2), nullable=False),
    sa.Column('customization', sa.String(length=1000), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['customer_order.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_product_id'), 'order_product', ['id'], unique=False)
    op.create_table('product_customization_option',
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('ingredient_id', sa.Integer(), nullable=True),
    sa.Column('name', sa.String(length=150), nullable=False),
    sa.Column('type', _enum('productcustomizationoptiontype'), nullable=False),
    sa.Column('extra_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('max_quantity', sa.Integer(), nullable=False),
    sa.Column('status', _enum('entitystatus'), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['ingredient_id'], ['ingredient.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_product_customization_option_id'), 'product_customization_option', ['id'], unique=False)
    op.create_index(op.f('ix_product_customization_option_status'), 'product_customization_option', ['status'], unique=False)
    op.create_table('product_ingredient',
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('ingredient_id', sa.Integer(), nullable=False),
    sa.Column('included_by_default', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('removable', sa.Boolean(), server_default='1', nullable=False),
    sa.Column('substitutable', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('quantity', sa.String(length=50), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['ingredient_id'], ['ingredient.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('product_id', 'ingredient_id', name='uq_product_ingredient_product_ingredient')
    )
    op.create_index(op.f('ix_product_ingredient_id'), 'product_ingredient', ['id'], unique=False)
    op.create_index(op.f('ix_product_ingredient_ingredient_id'), 'product_ingredient', ['ingredient_id'], unique=False)
    op.create_index(op.f('ix_product_ingredient_product_id'), 'product_ingredient', ['product_id'], unique=False)
    op.create_table('product_media',
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('media_id', sa.Integer(), nullable=False),
    sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
    sa.Column('alt_text', sa.String(length=255), nullable=True),
    sa.Column('is_primary', sa.Boolean(), server_default='0', nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['media_id'], ['media.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('product_id', 'media_id', name='uq_product_media_product_media')
    )
    op.create_index(op.f('ix_product_media_id'), 'product_media', ['id'], unique=False)
    op.create_index(op.f('ix_product_media_media_id'), 'product_media', ['media_id'], unique=False)
    op.create_index(op.f('ix_product_media_product_id'), 'product_media', ['product_id'], unique=False)
    op.create_index('uq_product_media_primary_per_product', 'product_media', ['product_id'], unique=True, sqlite_where=sa.text('is_primary = 1'), postgresql_where=sa.text('is_primary'))
    op.create_index('uq_product_media_product_sort_order', 'product_media', ['product_id', 'sort_order'], unique=True)
    op.create_table('cart_product_customization',
    sa.Column('cart_product_id', sa.Integer(), nullable=False),
    sa.Column('ingredient_id', sa.Integer(), nullable=True),
    sa.Column('option_id', sa.Integer(), nullable=True),
    sa.Column('action', _enum('cartcustomizationaction'), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('extra_price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('notes', sa.String(length=255), nullable=True),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['cart_product_id'], ['cart_product.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['ingredient_id'], ['ingredient.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['option_id'], ['product_customization_option.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cart_product_customization_id'), 'cart_product_customization', ['id'], unique=False)
    op.create_table('product_review',
    sa.Column('product_id', sa.Integer(), nullable=False),
    sa.Column('customer_id', sa.Integer(), nullable=False),
    sa.Column('order_product_id', sa.Integer(), nullable=True),
    sa.Column('rating', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=120), nullable=True),
    sa.Column('comment', sa.String(length=1000), nullable=True),
    sa.Column('status', _enum('reviewstatus'), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['customer_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['order_product_id'], ['order_product.id'], ),
    sa.ForeignKeyConstraint(['product_id'], ['product.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('customer_id', 'product_id', name='uq_review_cliente_produto'),
    sa.UniqueConstraint('order_product_id', name='uq_review_encomenda_produto')
    )
    op.create_index(op.f('ix_product_review_customer_id'), 'product_review', ['customer_id'], unique=False)
    op.create_index(op.f('ix_product_review_id'), 'product_review', ['id'], unique=False)
    op.create_index(op.f('ix_product_review_product_id'), 'product_review', ['product_id'], unique=False)
    op.create_index(op.f('ix_product_review_rating'), 'product_review', ['rating'], unique=False)
    op.create_index(op.f('ix_product_review_status'), 'product_review', ['status'], unique=False)
    op.create_table('review_reactions',
    sa.Column('review_id', sa.Integer(), nullable=False),
    sa.Column('admin_id', sa.Integer(), nullable=False),
    sa.Column('type', _enum('reviewreactiontype'), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['review_id'], ['product_review.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('review_id', 'admin_id', name='uq_review_reaction_admin')
    )
    op.create_index(op.f('ix_review_reactions_admin_id'), 'review_reactions', ['admin_id'], unique=False)
    op.create_index(op.f('ix_review_reactions_id'), 'review_reactions', ['id'], unique=False)
    op.create_index(op.f('ix_review_reactions_review_id'), 'review_reactions', ['review_id'], unique=False)
    op.create_table('review_replies',
    sa.Column('review_id', sa.Integer(), nullable=False),
    sa.Column('admin_id', sa.Integer(), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['admin_id'], ['user.id'], ),
    sa.ForeignKeyConstraint(['review_id'], ['product_review.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_review_replies_admin_id'), 'review_replies', ['admin_id'], unique=False)
    op.create_index(op.f('ix_review_replies_id'), 'review_replies', ['id'], unique=False)
    op.create_index(op.f('ix_review_replies_review_id'), 'review_replies', ['review_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_review_replies_review_id'), table_name='review_replies')
    op.drop_index(op.f('ix_review_replies_id'), table_name='review_replies')
    op.drop_index(op.f('ix_review_replies_admin_id'), table_name='review_replies')
    op.drop_table('review_replies')
    op.drop_index(op.f('ix_review_reactions_review_id'), table_name='review_reactions')
    op.drop_index(op.f('ix_review_reactions_id'), table_name='review_reactions')
    op.drop_index(op.f('ix_review_reactions_admin_id'), table_name='review_reactions')
    op.drop_table('review_reactions')
    op.drop_index(op.f('ix_product_review_status'), table_name='product_review')
    op.drop_index(op.f('ix_product_review_rating'), table_name='product_review')
    op.drop_index(op.f('ix_product_review_product_id'), table_name='product_review')
    op.drop_index(op.f('ix_product_review_id'), table_name='product_review')
    op.drop_index(op.f('ix_product_review_customer_id'), table_name='product_review')
    op.drop_table('product_review')
    op.drop_index(op.f('ix_cart_product_customization_id'), table_name='cart_product_customization')
    op.drop_table('cart_product_customization')
    op.drop_index('uq_product_media_product_sort_order', table_name='product_media')
    op.drop_index('uq_product_media_primary_per_product', table_name='product_media', sqlite_where=sa.text('is_primary = 1'), postgresql_where=sa.text('is_primary'))
    op.drop_index(op.f('ix_product_media_product_id'), table_name='product_media')
    op.drop_index(op.f('ix_product_media_media_id'), table_name='product_media')
    op.drop_index(op.f('ix_product_media_id'), table_name='product_media')
    op.drop_table('product_media')
    op.drop_index(op.f('ix_product_ingredient_product_id'), table_name='product_ingredient')
    op.drop_index(op.f('ix_product_ingredient_ingredient_id'), table_name='product_ingredient')
    op.drop_index(op.f('ix_product_ingredient_id'), table_name='product_ingredient')
    op.drop_table('product_ingredient')
    op.drop_index(op.f('ix_product_customization_option_status'), table_name='product_customization_option')
    op.drop_index(op.f('ix_product_customization_option_id'), table_name='product_customization_option')
    op.drop_table('product_customization_option')
    op.drop_index(op.f('ix_order_product_id'), table_name='order_product')
    op.drop_table('order_product')
    op.drop_index(op.f('ix_cart_product_id'), table_name='cart_product')
    op.drop_table('cart_product')
    op.drop_index(op.f('ix_product_status'), table_name='product')
    op.drop_index(op.f('ix_product_id'), table_name='product')
    op.drop_index(op.f('ix_product_deleted_at'), table_name='product')
    op.drop_index(op.f('ix_product_admin_id'), table_name='product')
    op.drop_table('product')
    op.drop_index(op.f('ix_payment_id'), table_name='payment')
    op.drop_table('payment')
    op.drop_index(op.f('ix_invoice_order_id'), table_name='invoice')
    op.drop_index(op.f('ix_invoice_issued_at'), table_name='invoice')
    op.drop_index(op.f('ix_invoice_invoice_number'), table_name='invoice')
    op.drop_index(op.f('ix_invoice_id'), table_name='invoice')
    op.drop_table('invoice')
    op.drop_index(op.f('ix_session_user_id'), table_name='session')
    op.drop_index(op.f('ix_session_token_hash'), table_name='session')
    op.drop_index(op.f('ix_session_id'), table_name='session')
    op.drop_table('session')
    op.drop_index(op.f('ix_media_variant_media_id'), table_name='media_variant')
    op.drop_index(op.f('ix_media_variant_id'), table_name='media_variant')
    op.drop_table('media_variant')
    op.drop_index(op.f('ix_customer_order_order_access_token_hash'), table_name='customer_order')
    op.drop_index(op.f('ix_customer_order_id'), table_name='customer_order')
    op.drop_table('customer_order')
    op.drop_index(op.f('ix_customer_loyalty_id'), table_name='customer_loyalty')
    op.drop_index(op.f('ix_customer_loyalty_customer_id'), table_name='customer_loyalty')
    op.drop_table('customer_loyalty')
    op.drop_index(op.f('ix_customer_billing_address_id'), table_name='customer_billing_address')
    op.drop_index(op.f('ix_customer_billing_address_customer_id'), table_name='customer_billing_address')
    op.drop_table('customer_billing_address')
    op.drop_index(op.f('ix_coupon_id'), table_name='coupon')
    op.drop_index(op.f('ix_coupon_code'), table_name='coupon')
    op.drop_table('coupon')
    op.drop_index(op.f('ix_category_status'), table_name='category')
    op.drop_index(op.f('ix_category_id'), table_name='category')
    op.drop_index(op.f('ix_category_admin_id'), table_name='category')
    op.drop_table('category')
    op.drop_index(op.f('ix_cart_id'), table_name='cart')
    op.drop_table('cart')
    op.drop_index(op.f('ix_user_status'), table_name='user')
    op.drop_index(op.f('ix_user_role'), table_name='user')
    op.drop_index(op.f('ix_user_id'), table_name='user')
    op.drop_index(op.f('ix_user_email'), table_name='user')
    op.drop_table('user')
    op.drop_index(op.f('ix_site_setting_key'), table_name='site_setting')
    op.drop_index(op.f('ix_site_setting_id'), table_name='site_setting')
    op.drop_table('site_setting')
    op.drop_index(op.f('ix_media_owner_type'), table_name='media')
    op.drop_index(op.f('ix_media_id'), table_name='media')
    op.drop_table('media')
    op.drop_index(op.f('ix_ingredient_status'), table_name='ingredient')
    op.drop_index(op.f('ix_ingredient_id'), table_name='ingredient')
    op.drop_table('ingredient')
    op.drop_index(op.f('ix_company_config_id'), table_name='company_config')
    op.drop_table('company_config')
    _drop_postgresql_enums()
