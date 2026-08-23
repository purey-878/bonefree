from decimal import Decimal
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
from schemas.enums import (
    CouponDiscountType,
    SocialPlatform,
    ThemeBackgroundType,
    ThemeButtonStyle,
    ThemeColorKey,
    ThemeDecorationAnimation,
    ThemeDecorationElement,
    ThemeDecorationLayer,
    ThemeDecorationSize,
    ThemeDecorationType,
    ThemeId,
)
from .id_types import ProductId


THEME_IDS = {theme_id.value for theme_id in ThemeId}
COLOR_KEYS = {
    "primary",
    "accent",
    "secondary",
    "background",
    "surface",
    "text",
    "textMuted",
    "border",
    "priceHighlight",
}
LEGACY_COLOR_KEYS = {
    "brandMain": "primary",
    "brandAccent": "accent",
    "brandSecondary": "secondary",
    "brandDeep": "background",
    "brandInk": "text",
    "brandMuted": "textMuted",
}


class ThemeColors(BaseModel):
    primary: str
    accent: str
    secondary: str
    background: str
    surface: str
    text: str
    textMuted: str
    border: str
    priceHighlight: str


class ThemeBackground(BaseModel):
    type: ThemeBackgroundType
    value: str
    overlay: Optional[str] = None


class ThemeUi(BaseModel):
    borderRadius: str
    buttonStyle: ThemeButtonStyle
    cardShadow: str


class ThemeFonts(BaseModel):
    heading: Optional[str] = None
    body: Optional[str] = None


class ThemeDecoration(BaseModel):
    type: ThemeDecorationType
    element: ThemeDecorationElement
    customSvg: Optional[str] = None
    count: Optional[int] = None
    animation: ThemeDecorationAnimation
    opacity: float = Field(ge=0, le=1)
    zIndex: ThemeDecorationLayer
    size: ThemeDecorationSize
    color: Optional[str] = None


class ThemeConfig(BaseModel):
    id: str
    name: str
    colors: ThemeColors
    background: ThemeBackground
    decorations: List[ThemeDecoration] = Field(default_factory=list)
    fonts: Optional[ThemeFonts] = None
    ui: ThemeUi


class SiteThemeSettings(BaseModel):
    theme_id: ThemeId = ThemeId.NORMAL
    colors: Dict[str, str] = Field(default_factory=dict)
    decoration_enabled: bool = True
    decoration_intensity: int = Field(2, ge=1, le=3)
    custom_decorations: List[dict] = Field(default_factory=list)
    custom_name: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_payload(cls, value):
        if not isinstance(value, dict):
            return value
        migrated = dict(value)
        if migrated.get("theme_id") not in THEME_IDS:
            migrated["theme_id"] = "normal"
        if "seasonal_effect" in migrated and "decoration_enabled" not in migrated:
            migrated["decoration_enabled"] = migrated["seasonal_effect"]
        colors = migrated.get("colors")
        if isinstance(colors, dict):
            migrated["colors"] = {
                LEGACY_COLOR_KEYS.get(key, key): color
                for key, color in colors.items()
            }
        return migrated

    @field_validator("theme_id")
    @classmethod
    def validate_theme_id(cls, value: str | ThemeId) -> ThemeId:
        normalized = value.value if isinstance(value, ThemeId) else value.strip().lower()
        if normalized not in THEME_IDS:
            raise ValueError("Invalid theme.")
        return ThemeId(normalized)

    @field_validator("colors")
    @classmethod
    def validate_colors(cls, value: Dict[str, str]) -> Dict[str, str]:
        cleaned: Dict[str, str] = {}
        for key, color in value.items():
            normalized_key = LEGACY_COLOR_KEYS.get(key, key)
            if normalized_key not in COLOR_KEYS:
                continue
            if isinstance(color, str) and color.startswith("#") and len(color) in {4, 7}:
                cleaned[normalized_key] = color
        return cleaned


class SiteThemeResponse(SiteThemeSettings):
    config: ThemeConfig


class ChefSpecialSettings(BaseModel):
    product_id: Optional[ProductId] = None

    @field_validator("product_id")
    @classmethod
    def normalize_product_id(cls, value: Optional[int]) -> Optional[int]:
        return value


class LoyaltyCouponSettings(BaseModel):
    enabled: bool = True
    qualifying_order_count: int = Field(3, ge=1, le=20)
    qualifying_order_minimum: Decimal = Field(Decimal("50.00"), ge=0)
    discount_type: CouponDiscountType = CouponDiscountType.FIXED_VALUE
    discount_value: Decimal = Field(Decimal("20.00"), gt=0)
    coupon_minimum_order: Decimal = Field(Decimal("0.00"), ge=0)

    @field_validator("discount_value")
    @classmethod
    def validate_discount_value(cls, value: Decimal, info):
        discount_type = info.data.get("discount_type")
        if discount_type == CouponDiscountType.PERCENTAGE and value > Decimal("100"):
            raise ValueError("Discount percentage cannot exceed 100.")
        return value


class CompanyDetailsSettings(BaseModel):
    brand_name: str = Field("BONEFREE", max_length=80)
    description: str = Field(
        "Bonefree is a vegan restaurant and bar in Costa da Caparica. We serve 100% plant-based dishes, artisanal cocktails, and provide a relaxed atmosphere.",
        max_length=500,
    )
    address: str = Field("Bonefree, R. Eng. Henrique Mendia 28A, 2825-450 Costa da Caparica", max_length=700)
    phone: str = Field("+351 968 107 703", max_length=60)
    email: str = Field("carambolarubra@gmail.com", max_length=160)

    @field_validator("brand_name", "description", "address", "phone", "email")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return value.strip()


class SocialLinkSettings(BaseModel):
    platform: SocialPlatform
    label: str = Field(max_length=40)
    href: str = Field("", max_length=300)
    enabled: bool = True

    @field_validator("label", "href")
    @classmethod
    def normalize_social_text(cls, value: str) -> str:
        return value.strip()


class SocialMediaSettings(BaseModel):
    links: List[SocialLinkSettings] = Field(default_factory=list)


class OrganizationProfileResponse(BaseModel):
    display_name: Optional[str] = None
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    description: Optional[str] = None
    about_text: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = "Portugal"
    logo_url: Optional[str] = None
    currency_code: str = "EUR"
    vat_exemption_reason: Optional[str] = None
    opening_hours: Optional[Dict[str, Any]] = None
    social_links: Optional[Dict[str, Any]] = None
    website: Optional[str] = None


class OrganizationProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=150)
    legal_name: Optional[str] = Field(default=None, max_length=150)
    tax_id: Optional[str] = Field(default=None, max_length=20)
    description: Optional[str] = Field(default=None, max_length=500)
    about_text: Optional[str] = None
    email: Optional[str] = Field(default=None, max_length=150)
    phone: Optional[str] = Field(default=None, max_length=30)
    address_line_1: Optional[str] = Field(default=None, max_length=255)
    address_line_2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    country: Optional[str] = Field(default=None, max_length=100)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    currency_code: Optional[str] = Field(default=None, min_length=3, max_length=3)
    vat_exemption_reason: Optional[str] = Field(default=None, max_length=500)
    opening_hours: Optional[Dict[str, Any]] = None
    social_links: Optional[Dict[str, Any]] = None

    @field_validator(
        "display_name", "legal_name", "tax_id", "description", "about_text",
        "email", "phone", "address_line_1", "address_line_2", "city",
        "postal_code", "country", "logo_url", "vat_exemption_reason",
    )
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        normalized = (value or "").strip()
        return normalized or None

    @field_validator("currency_code")
    @classmethod
    def normalize_currency_code(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if value is not None else None


class EventItemSettings(BaseModel):
    id: str = Field(max_length=40)
    title: str = Field(max_length=100)
    kicker: str = Field("Upcoming event", max_length=80)
    description: str = Field(max_length=400)
    date: str = Field(max_length=20)
    start_time: str = Field(max_length=10)
    end_time: str = Field(max_length=10)
    image_url: str = Field(max_length=300)
    enabled: bool = True

    @field_validator("id", "title", "kicker", "description", "date", "start_time", "end_time", "image_url")
    @classmethod
    def normalize_event_text(cls, value: str) -> str:
        return value.strip()


class EventsSettings(BaseModel):
    events: List[EventItemSettings] = Field(default_factory=list)
