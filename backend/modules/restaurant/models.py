from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import List, TypeVar, cast

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from core.base import OrganizationModel
from core.database_types import StrEnumType
from modules.auth.models import User
from utils.datetime_utils import naive_utc_now
from utils.id_format import format_category_id, format_product_id


class EntityStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class CouponType(StrEnum):
    FIXED_VALUE = "fixed_value"
    PERCENTAGE = "percentage"


class IngredientType(StrEnum):
    NORMAL = "normal"
    SAUCE = "sauce"
    EXTRA = "extra"
    DRINK = "drink"
    BASE = "base"
    SIDE = "side"


class ProductCustomizationOptionType(StrEnum):
    ADD = "add"
    REMOVE = "remove"
    EXTRA = "extra"
    SUBSTITUTE_SAUCE = "substitute_sauce"
    SUBSTITUTE_SIDE = "substitute_side"


class CartCustomizationAction(StrEnum):
    REMOVE_INGREDIENT = "remove_ingredient"
    ADD_EXTRA = "add_extra"
    SUBSTITUTE_SAUCE = "substitute_sauce"
    SUBSTITUTE_SIDE = "substitute_side"


class OrderState(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    IN_PREPARATION = "in_preparation"
    READY = "ready"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class PaymentMethod(StrEnum):
    CARD = "card"
    MBWAY = "mbway"
    COUNTER = "counter"


class PaymentStatus(StrEnum):
    UNPAID = "unpaid"
    PAID = "paid"


class ReviewStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ReviewReactionType(StrEnum):
    LIKE = "like"
    HEART = "heart"


class PaymentState(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CancellationOrigin(StrEnum):
    CLIENT = "client"
    ADMIN = "admin"
    SYSTEM = "system"


class FulfillmentMethod(StrEnum):
    DINE_IN = "dine_in"
    PICKUP = "pickup"
    TAKEAWAY = "takeaway"


class CheckoutPaymentMethod(StrEnum):
    COUNTER = "counter"


class SiteSettingKey(StrEnum):
    SITE_THEME = "site_theme"
    CHEF_SPECIAL = "chef_special"
    LOYALTY_COUPON = "loyalty_coupon"
    COMPANY_DETAILS = "company_details"
    SOCIAL_MEDIA = "social_media"
    EVENTS = "events"


class MediaOwnerType(StrEnum):
    PRODUCT = "product"


class MediaVariantKind(StrEnum):
    ORIGINAL = "original"
    THUMB = "thumb"
    CARD = "card"
    DETAIL = "detail"


class ThemeId(StrEnum):
    NORMAL = "normal"
    PRESENTATION = "presentation"
    CHRISTMAS = "christmas"
    HALLOWEEN = "halloween"


class ThemeBackgroundType(StrEnum):
    SOLID = "solid"
    GRADIENT = "gradient"
    PATTERN = "pattern"


class ThemeButtonStyle(StrEnum):
    ROUNDED = "rounded"
    PILL = "pill"
    SHARP = "sharp"


class ThemeDecorationType(StrEnum):
    FLOATING = "floating"
    FIXED = "fixed"
    BACKGROUND_PATTERN = "background-pattern"


class ThemeDecorationElement(StrEnum):
    SNOWFLAKE = "snowflake"
    SANTA_HAT = "santa-hat"
    GHOST = "ghost"
    SPIDER = "spider"
    SPIDER_WEB = "spider-web"
    STAR = "star"
    LEAF = "leaf"
    PUMPKIN = "pumpkin"
    CANDY_CANE = "candy-cane"
    BAUBLE = "bauble"
    CUSTOM_SVG = "custom-svg"


class ThemeDecorationAnimation(StrEnum):
    FALL = "fall"
    FLOAT = "float"
    SWAY = "sway"
    SPIN = "spin"
    FADE_IN_OUT = "fade-in-out"
    NONE = "none"


class ThemeDecorationLayer(StrEnum):
    BEHIND_CONTENT = "behind-content"
    ABOVE_CONTENT = "above-content"


class ThemeDecorationSize(StrEnum):
    SM = "sm"
    MD = "md"
    LG = "lg"
    MIXED = "mixed"


class SocialPlatform(StrEnum):
    FACEBOOK = "facebook"
    INSTAGRAM = "instagram"
    WHATSAPP = "whatsapp"
    YOUTUBE = "youtube"


class ThemeColorKey(StrEnum):
    PRIMARY = "primary"
    ACCENT = "accent"
    SECONDARY = "secondary"
    BACKGROUND = "background"
    SURFACE = "surface"
    TEXT = "text"
    TEXT_MUTED = "textMuted"
    BORDER = "border"
    PRICE_HIGHLIGHT = "priceHighlight"


class CouponDiscountType(StrEnum):
    FIXED_VALUE = "fixed_value"
    PERCENTAGE = "percentage"


LEGACY_VALUE_MAP: dict[type[StrEnum], dict[str, StrEnum]] = {
    CouponType: {
        "VALOR_FIXO": CouponType.FIXED_VALUE,
        "PERCENTAGEM": CouponType.PERCENTAGE,
    },
    IngredientType: {
        "INGREDIENTES_NORMAIS": IngredientType.NORMAL,
        "MOLHO": IngredientType.SAUCE,
        "EXTRA": IngredientType.EXTRA,
        "BEBIDA": IngredientType.DRINK,
        "BASE": IngredientType.BASE,
        "ACOMPANHAMENTO": IngredientType.SIDE,
    },
    ProductCustomizationOptionType: {
        "ADICIONAR": ProductCustomizationOptionType.ADD,
        "REMOVER": ProductCustomizationOptionType.REMOVE,
        "EXTRA": ProductCustomizationOptionType.EXTRA,
        "SUBSTITUIR_MOLHO": ProductCustomizationOptionType.SUBSTITUTE_SAUCE,
        "SUBSTITUIR_ACOMPANHAMENTO": ProductCustomizationOptionType.SUBSTITUTE_SIDE,
    },
    CartCustomizationAction: {
        "REMOVER_INGREDIENTE": CartCustomizationAction.REMOVE_INGREDIENT,
        "ADICIONAR_EXTRA": CartCustomizationAction.ADD_EXTRA,
        "SUBSTITUIR_MOLHO": CartCustomizationAction.SUBSTITUTE_SAUCE,
        "SUBSTITUIR_ACOMPANHAMENTO": CartCustomizationAction.SUBSTITUTE_SIDE,
    },
    OrderState: {
        "pendente": OrderState.PENDING,
        "confirmada": OrderState.CONFIRMED,
        "em_preparacao": OrderState.IN_PREPARATION,
        "pronta": OrderState.READY,
        "entregue": OrderState.DELIVERED,
        "cancelada": OrderState.CANCELLED,
    },
    PaymentMethod: {
        "cartao": PaymentMethod.CARD,
        "balcao": PaymentMethod.COUNTER,
    },
    PaymentStatus: {
        "nao_pago": PaymentStatus.UNPAID,
        "pago": PaymentStatus.PAID,
    },
    ReviewStatus: {
        "pendente": ReviewStatus.PENDING,
        "aprovado": ReviewStatus.APPROVED,
        "rejeitado": ReviewStatus.REJECTED,
    },
    PaymentState: {
        "pendente": PaymentState.PENDING,
        "aprovado": PaymentState.APPROVED,
        "rejeitado": PaymentState.REJECTED,
    },
    CouponDiscountType: {
        "VALOR_FIXO": CouponDiscountType.FIXED_VALUE,
        "PERCENTAGEM": CouponDiscountType.PERCENTAGE,
    },
}


EnumT = TypeVar("EnumT", bound=StrEnum)


def enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


def normalize_enum(enum_cls: type[EnumT], value: str | StrEnum | None, default: EnumT | None = None) -> EnumT:
    if isinstance(value, enum_cls):
        return value
    if value is None:
        if default is not None:
            return default
        raise ValueError(f"{enum_cls.__name__} cannot be None")
    normalized = str(value).strip()
    try:
        return enum_cls(normalized)
    except ValueError:
        legacy_value = LEGACY_VALUE_MAP.get(enum_cls, {}).get(normalized)
        if legacy_value is not None:
            return cast(EnumT, legacy_value)
        if default is not None:
            return default
        raise




class Category(OrganizationModel):
    __tablename__ = 'category'

    category_id = synonym("id")

    category_name: Mapped[str] = mapped_column(String(100), nullable=False)
    category_description: Mapped[str] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column("admin_id", Integer, ForeignKey('user.id'), nullable=False, index=True)
    status: Mapped[EntityStatus] = mapped_column(
        StrEnumType(EntityStatus, length=50),
        default=EntityStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    created_by_user: Mapped[User] = relationship("User")

    @property
    def category_display_id(self) -> str:
        return format_category_id(self.id)


class SiteSetting(OrganizationModel):
    __tablename__ = 'site_setting'
    __table_args__ = (
        UniqueConstraint("organization_id", "key", name="uq_site_setting_organization_key"),
    )

    key: Mapped[SiteSettingKey] = mapped_column(
        StrEnumType(SiteSettingKey, length=50),
        nullable=False,
        index=True,
    )
    value: Mapped[str] = mapped_column(Text, nullable=True)


class Product(OrganizationModel):
    __tablename__ = 'product'

    product_id = synonym("id")

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    product_description: Mapped[str] = mapped_column(String(255), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey('category.id'), nullable=False)
    created_by_user_id: Mapped[int] = mapped_column("admin_id", Integer, ForeignKey('user.id'), nullable=False, index=True)
    sold: Mapped[int] = mapped_column(Integer, nullable=True)
    status: Mapped[EntityStatus] = mapped_column(
        StrEnumType(EntityStatus, length=50),
        default=EntityStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    customizable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    menu_tags: Mapped[str] = mapped_column(String(255), nullable=True)
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    discount_percentage: Mapped[Decimal] = mapped_column(
        "discount_percentual",
        Numeric(5, 2),
        nullable=False,
        default=0,
    )
    gluten_free: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    contains_alcohol: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    deleted_at: Mapped[datetime] = mapped_column(DateTime, nullable=True, index=True)  #  soft delete

    created_by_user: Mapped[User] = relationship("User")
    category: Mapped[Category] = relationship('Category', lazy='joined')
    media_items: Mapped[List["ProductMedia"]] = relationship(
        "ProductMedia",
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by=lambda: (ProductMedia.sort_order, ProductMedia.id),
    )
    # Parent-side 0..N: a product may exist without any customer reviews.
    reviews: Mapped[List[ProductReview]] = relationship("ProductReview", back_populates="product")

    total_calories: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=True)

    @property
    def product_display_id(self) -> str:
        return format_product_id(self.id)

    @property
    def category_display_id(self) -> str:
        return format_category_id(self.category_id)


class Media(OrganizationModel):
    __tablename__ = "media"

    media_id = synonym("id")

    owner_type: Mapped[MediaOwnerType] = mapped_column(
        StrEnumType(MediaOwnerType, length=50),
        nullable=False,
        index=True,
    )
    original_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    public_url: Mapped[str] = mapped_column(String(500), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=True)
    height: Mapped[int] = mapped_column(Integer, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=True)

    variants: Mapped[List["MediaVariant"]] = relationship(
        "MediaVariant",
        back_populates="media",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    product_links: Mapped[List["ProductMedia"]] = relationship(
        "ProductMedia",
        back_populates="media",
        cascade="all, delete-orphan",
    )


class MediaVariant(OrganizationModel):
    __tablename__ = "media_variant"
    __table_args__ = (
        UniqueConstraint("media_id", "kind", name="uq_media_variant_media_kind"),
    )

    variant_id = synonym("id")

    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[MediaVariantKind] = mapped_column(
        StrEnumType(MediaVariantKind, length=50),
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    public_url: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False, default="image/webp")
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=True)

    media: Mapped[Media] = relationship("Media", back_populates="variants")


class ProductMedia(OrganizationModel):
    __tablename__ = "product_media"
    __table_args__ = (
        UniqueConstraint("product_id", "media_id", name="uq_product_media_product_media"),
        Index(
            "uq_product_media_product_sort_order",
            "product_id",
            "sort_order",
            unique=True,
        ),
        Index(
            "uq_product_media_primary_per_product",
            "product_id",
            unique=True,
            sqlite_where=text("is_primary = 1"),
            postgresql_where=text("is_primary"),
        ),
    )

    product_media_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("product.id", ondelete="CASCADE"), nullable=False, index=True)
    media_id: Mapped[int] = mapped_column(Integer, ForeignKey("media.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    alt_text: Mapped[str] = mapped_column(String(255), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")

    product: Mapped[Product] = relationship("Product", back_populates="media_items")
    media: Mapped[Media] = relationship("Media", back_populates="product_links")


class CustomerBillingAddress(OrganizationModel):
    __tablename__ = 'customer_billing_address'

    address_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    address: Mapped[str] = mapped_column(String(255), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Portugal", server_default="Portugal")

    customer: Mapped["User"] = relationship("User", back_populates="billing_address")


class CustomerLoyalty(OrganizationModel):
    __tablename__ = 'customer_loyalty'

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id'), nullable=False, unique=True, index=True)
    orders_above_50: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_coupons_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    customer: Mapped["User"] = relationship("User")


class Coupon(OrganizationModel):
    __tablename__ = 'coupon'
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_coupon_organization_code"),
    )

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id'), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    type: Mapped[CouponType] = mapped_column(
        StrEnumType(CouponType, length=50),
        default=CouponType.FIXED_VALUE,
        nullable=False,
    )
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=20)
    minimum_order_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    used_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    customer: Mapped["User"] = relationship("User", back_populates="coupons")


class Cart(OrganizationModel):
    __tablename__ = 'cart'

    cart_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id', ondelete='CASCADE'), nullable=False)

    customer: Mapped["User"] = relationship("User", back_populates="cart")
    items: Mapped[List[CartProduct]] = relationship("CartProduct", back_populates="cart", cascade="all, delete-orphan")


class CartProduct(OrganizationModel):
    __tablename__ = 'cart_product'

    cart_product_id = synonym("id")

    cart_id: Mapped[int] = mapped_column(Integer, ForeignKey('cart.id', ondelete='CASCADE'), nullable=False)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    customization: Mapped[str] = mapped_column(String(1000), nullable=True)

    cart: Mapped[Cart] = relationship("Cart", back_populates="items")
    product: Mapped[Product] = relationship("Product", lazy='joined')
    customizations: Mapped[List[CartProductCustomization]] = relationship("CartProductCustomization", back_populates="item", cascade="all, delete-orphan")


class Ingredient(OrganizationModel):
    __tablename__ = 'ingredient'
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_ingredient_organization_name"),
    )

    ingredient_id = synonym("id")

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    type: Mapped[IngredientType] = mapped_column(
        StrEnumType(IngredientType, length=50),
        default=IngredientType.NORMAL,
        nullable=False,
    )
    status: Mapped[EntityStatus] = mapped_column(
        StrEnumType(EntityStatus, length=50),
        default=EntityStatus.ACTIVE,
        nullable=False,
        index=True,
    )
    available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="1")
    calories_per_gram: Mapped[Decimal] = mapped_column(Numeric(8, 4), nullable=True)


class ProductIngredient(OrganizationModel):
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


class ProductCustomizationOption(OrganizationModel):
    __tablename__ = 'product_customization_option'

    option_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey('ingredient.id'), nullable=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[ProductCustomizationOptionType] = mapped_column(
        StrEnumType(ProductCustomizationOptionType, length=50),
        nullable=False,
    )
    extra_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    max_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[EntityStatus] = mapped_column(
        StrEnumType(EntityStatus, length=50),
        default=EntityStatus.ACTIVE,
        nullable=False,
        index=True,
    )

    product: Mapped[Product] = relationship("Product")
    ingredient: Mapped[Ingredient] = relationship("Ingredient", lazy='joined')
    # Parent-side 0..N: an option may exist without being selected in a cart.
    cart_customizations: Mapped[List[CartProductCustomization]] = relationship("CartProductCustomization", back_populates="option")


class CartProductCustomization(OrganizationModel):
    __tablename__ = 'cart_product_customization'

    customization_id = synonym("id")

    cart_product_id: Mapped[int] = mapped_column(Integer, ForeignKey('cart_product.id', ondelete='CASCADE'), nullable=False)
    ingredient_id: Mapped[int] = mapped_column(Integer, ForeignKey('ingredient.id', ondelete='SET NULL'), nullable=True)
    option_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_customization_option.id', ondelete='SET NULL'), nullable=True)
    action: Mapped[CartCustomizationAction] = mapped_column(
        StrEnumType(CartCustomizationAction, length=50),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    extra_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes: Mapped[str] = mapped_column(String(255), nullable=True)

    item: Mapped[CartProduct] = relationship("CartProduct", back_populates="customizations")
    ingredient: Mapped[Ingredient] = relationship("Ingredient")
    option: Mapped[ProductCustomizationOption] = relationship("ProductCustomizationOption", back_populates="cart_customizations")


class Order(OrganizationModel):
    __tablename__ = 'customer_order'

    order_id = synonym("id")

    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id'), nullable=True)
    handled_by_user_id: Mapped[int] = mapped_column("admin_id", Integer, ForeignKey('user.id'), nullable=True)
    customer_first_name: Mapped[str] = mapped_column(String(100), nullable=True)
    customer_last_name: Mapped[str] = mapped_column(String(100), nullable=True)
    customer_email: Mapped[str] = mapped_column(String(150), nullable=True)
    customer_phone: Mapped[str] = mapped_column(String(20), nullable=True)
    customer_tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    order_access_token_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
        index=True,
    )
    order_access_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ordered_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False)
    state: Mapped[OrderState] = mapped_column(
        StrEnumType(OrderState, length=50),
        default=OrderState.PENDING,
        nullable=False,
    )
    payment_method: Mapped[PaymentMethod] = mapped_column(
        StrEnumType(PaymentMethod, length=50),
        nullable=False,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        StrEnumType(PaymentStatus, length=50),
        default=PaymentStatus.UNPAID,
        nullable=False,
    )
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    vat_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=13)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total_discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    notes: Mapped[str] = mapped_column(String(500), nullable=True)
    canceled_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    cancellation_origin: Mapped[CancellationOrigin] = mapped_column(
        StrEnumType(CancellationOrigin, length=50),
        nullable=True,
    )

    customer: Mapped["User"] = relationship("User", foreign_keys=[customer_id], lazy='joined')
    handled_by_user: Mapped[User] = relationship("User", foreign_keys=[handled_by_user_id])
    items: Mapped[List["OrderProduct"]] = relationship("OrderProduct", back_populates="order", cascade="all, delete-orphan", lazy='selectin')
    payment: Mapped["Payment"] = relationship("Payment", back_populates="order", uselist=False, cascade="all, delete-orphan", lazy='joined')
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="order", uselist=False, cascade="all, delete-orphan")


class Invoice(OrganizationModel):
    __tablename__ = 'invoice'
    __table_args__ = (
        UniqueConstraint("organization_id", "invoice_number", name="uq_invoice_organization_number"),
    )

    invoice_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id', ondelete='CASCADE'), nullable=False, unique=True, index=True)
    invoice_number: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    customer_tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    customer_name: Mapped[str] = mapped_column(String(200), nullable=True)
    customer_address: Mapped[str] = mapped_column(String(500), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    vat_percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=13)
    vat_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    issuer_display_name: Mapped[str] = mapped_column(String(150), nullable=False)
    issuer_legal_name: Mapped[str] = mapped_column(String(150), nullable=True)
    issuer_tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    issuer_address: Mapped[str] = mapped_column(String(700), nullable=True)
    issuer_email: Mapped[str] = mapped_column(String(150), nullable=True)
    issuer_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    issuer_logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    issuer_website: Mapped[str] = mapped_column(String(500), nullable=True)
    issuer_currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR", server_default="EUR")
    issuer_vat_exemption_reason: Mapped[str] = mapped_column(String(500), nullable=True)
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=naive_utc_now, nullable=False, index=True)

    order: Mapped[Order] = relationship("Order", back_populates="invoice")


class OrderProduct(OrganizationModel):
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


class ProductReview(OrganizationModel):
    __tablename__ = 'product_review'
    __table_args__ = (
        UniqueConstraint('order_product_id', name='uq_review_encomenda_produto'),
        UniqueConstraint('customer_id', 'product_id', name='uq_review_cliente_produto'),
    )

    review_id = synonym("id")

    product_id: Mapped[int] = mapped_column(Integer, ForeignKey('product.id'), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey('user.id'), nullable=False, index=True)
    order_product_id: Mapped[int] = mapped_column(Integer, ForeignKey('order_product.id'), nullable=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=True)
    comment: Mapped[str] = mapped_column(String(1000), nullable=True)
    status: Mapped[ReviewStatus] = mapped_column(
        StrEnumType(ReviewStatus, length=50),
        default=ReviewStatus.APPROVED,
        nullable=False,
        index=True,
    )

    product: Mapped[Product] = relationship("Product", back_populates="reviews")
    customer: Mapped["User"] = relationship("User", back_populates="reviews")
    order_product: Mapped[OrderProduct] = relationship("OrderProduct", back_populates="review")
    # Parent-side 0..N: a review may exist without any admin replies.
    replies: Mapped[List[ReviewReply]] = relationship("ReviewReply", back_populates="review", cascade="all, delete-orphan", order_by="ReviewReply.created_at")
    # Parent-side 0..N: a review may exist without any reactions.
    reactions: Mapped[List[ReviewReaction]] = relationship("ReviewReaction", back_populates="review", cascade="all, delete-orphan")

    @property
    def reply(self):
        """Compatibility alias for screens that still display a single latest reply."""
        return self.replies[-1] if self.replies else None


class ReviewReply(OrganizationModel):
    __tablename__ = 'review_replies'

    reply_id = synonym("id")

    review_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_review.id', ondelete='CASCADE'), nullable=False, index=True)
    author_user_id: Mapped[int] = mapped_column("admin_id", Integer, ForeignKey('user.id'), nullable=False, index=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    review: Mapped[ProductReview] = relationship("ProductReview", back_populates="replies")
    author_user: Mapped[User] = relationship("User")


class ReviewReaction(OrganizationModel):
    __tablename__ = 'review_reactions'
    __table_args__ = (
        UniqueConstraint('review_id', 'admin_id', name='uq_review_reaction_admin'),
    )

    reaction_id = synonym("id")

    review_id: Mapped[int] = mapped_column(Integer, ForeignKey('product_review.id', ondelete='CASCADE'), nullable=False, index=True)
    reacted_by_user_id: Mapped[int] = mapped_column("admin_id", Integer, ForeignKey('user.id'), nullable=False, index=True)
    type: Mapped[ReviewReactionType] = mapped_column(
        StrEnumType(ReviewReactionType, length=50),
        nullable=False,
    )

    review: Mapped[ProductReview] = relationship("ProductReview", back_populates="reactions")
    reacted_by_user: Mapped[User] = relationship("User")


class Payment(OrganizationModel):
    __tablename__ = 'payment'

    payment_id = synonym("id")

    order_id: Mapped[int] = mapped_column(Integer, ForeignKey('customer_order.id'), nullable=False, unique=True)
    method: Mapped[PaymentMethod] = mapped_column(
        StrEnumType(PaymentMethod, length=50),
        nullable=False,
    )
    state: Mapped[PaymentState] = mapped_column(
        StrEnumType(PaymentState, length=50),
        default=PaymentState.PENDING,
        nullable=False,
    )
    value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    transaction_reference: Mapped[str] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    confirmed_by_user_id: Mapped[int] = mapped_column("confirmed_by_admin_id", Integer, ForeignKey('user.id'), nullable=True)

    order: Mapped[Order] = relationship("Order", back_populates="payment")
    confirmed_by_user: Mapped[User] = relationship("User")
