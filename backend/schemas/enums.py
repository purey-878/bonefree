from __future__ import annotations

from enum import StrEnum
from typing import TypeVar, cast


class UserRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    WAITER = "waiter"
    CHEF = "chef"
    CLIENT = "client"


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"


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


ADMIN_ROLES = {
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.WAITER,
    UserRole.CHEF,
}


LEGACY_VALUE_MAP: dict[type[StrEnum], dict[str, StrEnum]] = {
    UserRole: {
        "super_admin": UserRole.OWNER,
        "staff_admin": UserRole.MANAGER,
        "admin": UserRole.MANAGER,
        "chef": UserRole.CHEF,
        "client": UserRole.CLIENT,
        "customer": UserRole.CLIENT,
    },
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


def normalize_user_role(role: str | UserRole | None) -> UserRole:
    return normalize_enum(UserRole, role, UserRole.CLIENT)


def normalize_admin_role(role: str | UserRole | None) -> UserRole:
    normalized = normalize_user_role(role)
    if normalized is UserRole.CLIENT:
        return UserRole.MANAGER
    return normalized


def is_admin_role(role: str | UserRole | None) -> bool:
    return normalize_user_role(role) in ADMIN_ROLES
