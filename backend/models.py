from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from database import Base
from utils.datetime_utils import naive_utc_now
from utils.id_format import format_category_id, format_product_id


class AppBaseModel(Base):
    __abstract__ = True

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False)


class Admin(AppBaseModel):
    __tablename__ = 'admin'

    admin_id = synonym("id")

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[int] = mapped_column(Integer, default=1, nullable=True)
    role: Mapped[str] = mapped_column(String(30), default='staff_admin', nullable=False)

    sessions: Mapped[List["AdminSession"]] = relationship(
        "AdminSession",
        back_populates="admin",
        cascade="all, delete-orphan",
    )


class Category(AppBaseModel):
    __tablename__ = 'category'

    category_id = synonym("id")

    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    category_description: Mapped[str] = mapped_column(String(255), nullable=True)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=False, index=True)
    status: Mapped[int] = mapped_column(Integer, nullable=True)

    admin: Mapped[Admin] = relationship('Admin')

    @property
    def category_display_id(self) -> str:
        return format_category_id(self.id)


class SiteSetting(AppBaseModel):
    __tablename__ = 'site_setting'

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    value: Mapped[str] = mapped_column(Text, nullable=True)


class CompanyConfig(AppBaseModel):
    __tablename__ = 'company_config'

    company_name: Mapped[str] = mapped_column(String(150), nullable=False)
    company_tax_id: Mapped[str] = mapped_column(String(20), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Portugal", server_default="Portugal")
    email: Mapped[str] = mapped_column(String(150), nullable=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=True)


class Product(AppBaseModel):
    __tablename__ = 'product'

    product_id = synonym("id")

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    product_description: Mapped[str] = mapped_column(String(255), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey('category.id'), nullable=False)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=False, index=True)
    sold: Mapped[int] = mapped_column(Integer, nullable=True)
    image: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[int] = mapped_column(Integer, nullable=True)
    customizable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    menu_tags: Mapped[str] = mapped_column(String(255), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    discount_percentual: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    gluten_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    contains_alcohol: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)  #  soft delete

    admin: Mapped[Admin] = relationship('Admin')
    category: Mapped[Category] = relationship('Category', lazy='joined')
    # Parent-side 0..N: a product may exist without any uploaded images.
    images: Mapped[List[ProductImage]] = relationship('ProductImage', back_populates='product', lazy='joined')
    # Parent-side 0..N: a product may exist without any customer reviews.
    reviews: Mapped[List[ProductReview]] = relationship("ProductReview", back_populates="product")

    total_calories: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=True)

    @property
    def product_display_id(self) -> str:
        return format_product_id(self.id)

    @property
    def category_display_id(self) -> str:
        return format_category_id(self.category_id)


class ProductImage(AppBaseModel):
    __tablename__ = 'product_image'

    image_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    image_path: Mapped[str] = mapped_column(String(255), nullable=False)

    product: Mapped[Product] = relationship("Product", back_populates="images")


class Customer(AppBaseModel):
    __tablename__ = 'customer'

    customer_id = synonym("id")

    name: Mapped[str] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=True)
    tax_id: Mapped[str] = mapped_column(String(20), nullable=True, unique=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    password_reset_code_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    password_reset_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    password_reset_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    password_reset_verified_until: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    password_reset_token_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[int] = mapped_column(Integer, default=1, nullable=True)

    billing_address: Mapped[CustomerBillingAddress] = relationship("CustomerBillingAddress", back_populates="customer", uselist=False, cascade="all, delete-orphan")
    cart: Mapped[Cart] = relationship("Cart", back_populates="customer", uselist=False)
    reviews: Mapped[List[ProductReview]] = relationship("ProductReview", back_populates="customer")
    # Parent-side 0..N: a client may exist without any coupons.
    coupons: Mapped[List[Coupon]] = relationship("Coupon", back_populates="customer")
    sessions: Mapped[List["Session"]] = relationship(
        "Session",
        back_populates="customer",
        cascade="all, delete-orphan",
    )


class Session(AppBaseModel):
    __tablename__ = "session"

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")

    customer: Mapped[Customer] = relationship("Customer", back_populates="sessions")


class AdminSession(AppBaseModel):
    __tablename__ = "admin_session"

    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id', ondelete='CASCADE'), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")

    admin: Mapped[Admin] = relationship("Admin", back_populates="sessions")


class CustomerBillingAddress(AppBaseModel):
    __tablename__ = 'customer_billing_address'

    address_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    address: Mapped[str] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Portugal", server_default="Portugal")

    customer: Mapped[Customer] = relationship("Customer", back_populates="billing_address")


class CustomerLoyalty(AppBaseModel):
    __tablename__ = 'customer_loyalty'

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id'), nullable=False, unique=True, index=True)
    orders_above_50: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_coupons_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    customer: Mapped[Customer] = relationship("Customer")


class Coupon(AppBaseModel):
    __tablename__ = 'coupon'

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id'), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    type: Mapped[str] = mapped_column(Enum('VALOR_FIXO', 'PERCENTAGEM'), default='VALOR_FIXO', nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=20)
    minimum_order_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    customer: Mapped[Customer] = relationship("Customer", back_populates="coupons")


class Cart(AppBaseModel):
    __tablename__ = 'cart'

    cart_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id', ondelete='CASCADE'), nullable=False)

    customer: Mapped[Customer] = relationship("Customer", back_populates="cart")
    items: Mapped[List[CartProduct]] = relationship("CartProduct", back_populates="cart", cascade="all, delete-orphan")


class CartProduct(AppBaseModel):
    __tablename__ = 'cart_product'

    cart_product_id = synonym("id")

    cart_id: Mapped[int] = mapped_column(Integer, ForeignKey('cart.id', ondelete='CASCADE'), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    customization: Mapped[str] = mapped_column(String(1000), nullable=True)

    cart: Mapped[Cart] = relationship("Cart", back_populates="items")
    product: Mapped[Product] = relationship("Product", lazy='joined')
    customizations: Mapped[List[CartProductCustomization]] = relationship("CartProductCustomization", back_populates="item", cascade="all, delete-orphan")


class Ingredient(AppBaseModel):
    __tablename__ = 'ingredient'

    ingredient_id = synonym("id")

    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(Enum('INGREDIENTES_NORMAIS', 'MOLHO', 'EXTRA', 'BEBIDA', 'BASE', 'ACOMPANHAMENTO'), default='INGREDIENTES_NORMAIS', nullable=False)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    calories_per_gram: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=True)


class ProductIngredient(AppBaseModel):
    __tablename__ = 'product_ingredient'
    __table_args__ = (
        UniqueConstraint('product_id', 'ingredient_id', name='uq_product_ingredient_product_ingredient'),
    )

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False, index=True)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey('ingredient.id'), nullable=False, index=True)
    included_by_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    removable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    substitutable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    quantity: Mapped[str] = mapped_column(String(50), nullable=True)

    product: Mapped[Product] = relationship("Product")
    ingredient: Mapped[Ingredient] = relationship("Ingredient", lazy='joined')


class ProductCustomizationOption(AppBaseModel):
    __tablename__ = 'product_customization_option'

    option_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey('ingredient.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(Enum('ADICIONAR', 'REMOVER', 'EXTRA', 'SUBSTITUIR_MOLHO'), nullable=False)
    extra_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    max_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    product: Mapped[Product] = relationship("Product")
    ingredient: Mapped[Ingredient] = relationship("Ingredient", lazy='joined')
    # Parent-side 0..N: an option may exist without being selected in a cart.
    cart_customizations: Mapped[List[CartProductCustomization]] = relationship("CartProductCustomization", back_populates="option")


class CartProductCustomization(AppBaseModel):
    __tablename__ = 'cart_product_customization'

    customization_id = synonym("id")

    cart_product_id: Mapped[int] = mapped_column(Integer, ForeignKey('cart_product.id', ondelete='CASCADE'), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey('ingredient.id', ondelete='SET NULL'), nullable=True)
    option_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_customization_option.id', ondelete='SET NULL'), nullable=True)
    action: Mapped[str] = mapped_column(Enum('REMOVER_INGREDIENTE', 'ADICIONAR_EXTRA', 'SUBSTITUIR_MOLHO', 'SUBSTITUIR_ACOMPANHAMENTO'), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    extra_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes: Mapped[str] = mapped_column(String(255), nullable=True)

    item: Mapped[CartProduct] = relationship("CartProduct", back_populates="customizations")
    ingredient: Mapped[Ingredient] = relationship("Ingredient")
    option: Mapped[ProductCustomizationOption] = relationship("ProductCustomizationOption", back_populates="cart_customizations")


class Order(AppBaseModel):
    __tablename__ = 'customer_order'

    order_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id'), nullable=False)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=True)
    ordered_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False)
    state: Mapped[str] = mapped_column(Enum('pendente', 'confirmada', 'em_preparacao', 'pronta', 'entregue', 'cancelada', 'reembolsada'), default='pendente', nullable=False)
    payment_method: Mapped[str] = mapped_column(Enum('cartao', 'mbway', 'balcao'), nullable=False)
    payment_status: Mapped[str] = mapped_column(Enum('nao_pago', 'pago', 'reembolsado'), default='nao_pago', nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    vat_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=13)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total_discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes: Mapped[str] = mapped_column(String(500), nullable=True)
    canceled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    cancellation_origin: Mapped[str] = mapped_column(String(30), nullable=True)

    customer: Mapped[Customer] = relationship("Customer", lazy='joined')
    items: Mapped[List[OrderProduct]] = relationship("OrderProduct", back_populates="order", cascade="all, delete-orphan", lazy='joined')
    payment: Mapped[Payment] = relationship("Payment", back_populates="order", uselist=False, cascade="all, delete-orphan", lazy='joined')
    # Parent-side 0..N: an order may exist without any refunds.
    refunds: Mapped[List[Refund]] = relationship("Refund", back_populates="order", cascade="all, delete-orphan", lazy='joined')
    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="order", uselist=False, cascade="all, delete-orphan")


class Invoice(AppBaseModel):
    __tablename__ = 'invoice'

    invoice_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    customer_tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=True)
    customer_address: Mapped[str] = mapped_column(String(500), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    vat_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=13)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False, index=True)

    order: Mapped[Order] = relationship("Order", back_populates="invoice")


class OrderProduct(AppBaseModel):
    __tablename__ = 'order_product'

    order_product_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id'), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(150), nullable=False)
    discount_percentage_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    vat_percentage_snapshot: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=13)
    customization: Mapped[str] = mapped_column(String(1000), nullable=True)

    order: Mapped[Order] = relationship("Order", back_populates="items")
    product: Mapped[Product] = relationship("Product", lazy='joined')
    review: Mapped[ProductReview] = relationship("ProductReview", back_populates="order_product", uselist=False)


class ProductReview(AppBaseModel):
    __tablename__ = 'product_review'
    __table_args__ = (
        UniqueConstraint('order_product_id', name='uq_review_encomenda_produto'),
        UniqueConstraint('customer_id', 'product_id', name='uq_review_cliente_produto'),
    )

    review_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer.id'), nullable=False, index=True)
    order_product_id: Mapped[int] = mapped_column(Integer, ForeignKey('order_product.id'), nullable=True, unique=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=True)
    comment: Mapped[str] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(Enum('pendente', 'aprovado', 'rejeitado'), default='aprovado', nullable=False, index=True)

    product: Mapped[Product] = relationship("Product", back_populates="reviews")
    customer: Mapped[Customer] = relationship("Customer", back_populates="reviews")
    order_product: Mapped[OrderProduct] = relationship("OrderProduct", back_populates="review")
    # Parent-side 0..N: a review may exist without any admin replies.
    replies: Mapped[List[ReviewReply]] = relationship("ReviewReply", back_populates="review", cascade="all, delete-orphan", order_by="ReviewReply.created_at")
    # Parent-side 0..N: a review may exist without any reactions.
    reactions: Mapped[List[ReviewReaction]] = relationship("ReviewReaction", back_populates="review", cascade="all, delete-orphan")

    @property
    def reply(self):
        """Compatibility alias for screens that still display a single latest reply."""
        return self.replies[-1] if self.replies else None


class ReviewReply(AppBaseModel):
    __tablename__ = 'review_replies'

    reply_id = synonym("id")

    review_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_review.id', ondelete='CASCADE'), nullable=False, index=True)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    review: Mapped[ProductReview] = relationship("ProductReview", back_populates="replies")
    admin: Mapped[Admin] = relationship("Admin")


class ReviewReaction(AppBaseModel):
    __tablename__ = 'review_reactions'
    __table_args__ = (
        UniqueConstraint('review_id', 'admin_id', name='uq_review_reaction_admin'),
    )

    reaction_id = synonym("id")

    review_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_review.id', ondelete='CASCADE'), nullable=False, index=True)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=False, index=True)
    type: Mapped[str] = mapped_column(Enum('like', 'heart'), nullable=False)

    review: Mapped[ProductReview] = relationship("ProductReview", back_populates="reactions")
    admin: Mapped[Admin] = relationship("Admin")


class Payment(AppBaseModel):
    __tablename__ = 'payment'

    payment_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id'), nullable=False, unique=True)
    method: Mapped[str] = mapped_column(Enum('cartao', 'mbway', 'balcao'), nullable=False)
    state: Mapped[str] = mapped_column(Enum('pendente', 'aprovado', 'rejeitado', 'reembolsado'), default='pendente', nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    transaction_reference: Mapped[str] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    confirmed_by_admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=True)

    order: Mapped[Order] = relationship("Order", back_populates="payment")
    confirmed_by: Mapped[Admin] = relationship("Admin")
    # Parent-side 0..N: a payment may exist without any refunds.
    refunds: Mapped[List[Refund]] = relationship("Refund", back_populates="payment")


class Refund(AppBaseModel):
    __tablename__ = 'refund'

    refund_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id'), nullable=False, index=True)
    payment_id: Mapped[int] = mapped_column(Integer, ForeignKey('payment.id'), nullable=True)
    admin_id: Mapped[int] = mapped_column(Integer, ForeignKey('admin.id'), nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Enum('aprovado'), default='aprovado', nullable=False)
    method: Mapped[str] = mapped_column(String(120), nullable=False, default='Original payment method')
    receipt_number: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    refunded_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False, index=True)

    order: Mapped[Order] = relationship("Order", back_populates="refunds")
    payment: Mapped[Payment] = relationship("Payment", back_populates="refunds")
    admin: Mapped[Admin] = relationship("Admin")