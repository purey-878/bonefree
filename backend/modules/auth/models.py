from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Literal, NotRequired, TypeAlias, TypedDict

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.base import AppBaseModel, OrganizationModel
from core.database_types import StrEnumType
from utils.datetime_utils import naive_utc_now


class OrganizationType(StrEnum):
    RESTAURANT = "restaurant"


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


ORGANIZATION_STAFF_ROLES = {
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.WAITER,
    UserRole.CHEF,
}


def normalize_user_role(role: str | UserRole | None) -> UserRole:
    if isinstance(role, UserRole):
        return role
    if role is None:
        return UserRole.CLIENT
    try:
        return UserRole(str(role).strip())
    except ValueError:
        return UserRole.CLIENT


def is_organization_staff_role(role: str | UserRole | None) -> bool:
    return normalize_user_role(role) in ORGANIZATION_STAFF_ROLES


JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
SectionPropertyValue: TypeAlias = JsonScalar | list[JsonScalar]
SectionPropertiesData: TypeAlias = dict[str, SectionPropertyValue]

Weekday: TypeAlias = Literal[
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]
FeatureKey: TypeAlias = Literal[
    "catalog",
    "customer_accounts",
    "ordering",
    "reviews",
    "loyalty",
    "events",
]
SectionType: TypeAlias = Literal[
    "hero",
    "category_navigation",
    "loyalty",
    "popular_products",
    "chef_special",
    "reviews",
    "events",
]
NavigationRouteId: TypeAlias = Literal[
    "home",
    "menu",
    "about",
    "contact",
    "profile",
    "cart",
    "orders",
    "events",
]
SocialPlatformKey: TypeAlias = Literal["facebook", "instagram", "whatsapp", "youtube"]


class OpeningHoursPeriodData(TypedDict):
    opens_at: str
    closes_at: str


OpeningHoursData: TypeAlias = dict[Weekday, list[OpeningHoursPeriodData]]


class SocialLinkData(TypedDict):
    platform: SocialPlatformKey
    label: str
    href: str
    enabled: bool


class SocialLinksData(TypedDict):
    links: list[SocialLinkData]


class ThemeTokenOverridesData(TypedDict, total=False):
    primary: str
    accent: str
    secondary: str
    background: str
    surface: str
    text: str
    text_muted: str
    border: str
    price_highlight: str


class ExperienceAssetsData(TypedDict, total=False):
    logo: str


class NavigationItemData(TypedDict):
    id: str
    route_id: NavigationRouteId
    label: str
    enabled: bool


class SectionDescriptorData(TypedDict):
    id: str
    type: SectionType
    enabled: bool
    feature_key: NotRequired[FeatureKey | None]
    variant: NotRequired[str | None]
    override_key: NotRequired[str | None]
    props: NotRequired[SectionPropertiesData]


class PageConfigurationData(TypedDict):
    sections: list[SectionDescriptorData]


class ExperiencePagesData(TypedDict, total=False):
    home: PageConfigurationData


class VariantOverridesData(TypedDict, total=False):
    hero: str
    category_navigation: str
    loyalty: str
    popular_products: str
    chef_special: str
    reviews: str
    events: str


FeatureEntitlementConfigurationData: TypeAlias = JsonObject


# SQLAlchemy 2.0.35 cannot resolve union annotations on Python 3.14.
if TYPE_CHECKING:
    NullableString: TypeAlias = str | None
    NullableOpeningHoursData: TypeAlias = OpeningHoursData | None
    NullableSocialLinksData: TypeAlias = SocialLinksData | None
    NullableFeatureEntitlementConfigurationData: TypeAlias = FeatureEntitlementConfigurationData | None
else:
    NullableString = str
    NullableOpeningHoursData = OpeningHoursData
    NullableSocialLinksData = SocialLinksData
    NullableFeatureEntitlementConfigurationData = FeatureEntitlementConfigurationData


class Organization(AppBaseModel):
    __tablename__ = "organization"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    organization_type: Mapped[OrganizationType] = mapped_column(
        StrEnumType(OrganizationType, length=50),
        nullable=False,
        default=OrganizationType.RESTAURANT,
        server_default=OrganizationType.RESTAURANT.value,
    )
    email: Mapped[str] = mapped_column(String(150), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=True)

    users: Mapped[list["User"]] = relationship("User", back_populates="organization")
    domains: Mapped[list["OrganizationDomain"]] = relationship(
        "OrganizationDomain", back_populates="organization", cascade="all, delete-orphan"
    )
    profile: Mapped["OrganizationProfile"] = relationship(
        "OrganizationProfile", back_populates="organization", cascade="all, delete-orphan", uselist=False
    )
    experience: Mapped["OrganizationExperience"] = relationship(
        "OrganizationExperience", back_populates="organization", cascade="all, delete-orphan", uselist=False
    )
    feature_entitlements: Mapped[list["OrganizationFeatureEntitlement"]] = relationship(
        "OrganizationFeatureEntitlement", back_populates="organization", cascade="all, delete-orphan"
    )


class OrganizationDomain(OrganizationModel):
    __tablename__ = "organization_domain"
    __table_args__ = (
        UniqueConstraint("organization_id", "domain", name="uq_organization_domain_organization_domain"),
        Index(
            "uq_organization_domain_primary",
            "organization_id",
            unique=True,
            sqlite_where=text("is_primary = 1"),
            postgresql_where=text("is_primary"),
        ),
    )

    domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    organization: Mapped[Organization] = relationship("Organization", back_populates="domains")


class OrganizationProfile(OrganizationModel):
    __tablename__ = "organization_profile"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_organization_profile_organization_id"),)

    display_name: Mapped[str] = mapped_column(String(150), nullable=True)
    legal_name: Mapped[str] = mapped_column(String(150), nullable=True)
    tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    description: Mapped[str] = mapped_column(String(500), nullable=True)
    about_text: Mapped[str] = mapped_column(Text, nullable=True)
    email: Mapped[str] = mapped_column(String(150), nullable=True)
    phone: Mapped[str] = mapped_column(String(30), nullable=True)
    address_line_1: Mapped[str] = mapped_column(String(255), nullable=True)
    address_line_2: Mapped[NullableString] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    postal_code: Mapped[str] = mapped_column(String(20), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="Portugal", server_default="Portugal")
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="EUR", server_default="EUR")
    vat_exemption_reason: Mapped[str] = mapped_column(String(500), nullable=True)
    opening_hours: Mapped[NullableOpeningHoursData] = mapped_column(JSON, nullable=True)
    social_links: Mapped[NullableSocialLinksData] = mapped_column(JSON, nullable=True)
    organization: Mapped[Organization] = relationship("Organization", back_populates="profile")


class OrganizationExperience(OrganizationModel):
    __tablename__ = "organization_experience"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_organization_experience_organization_id"),)

    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    theme_key: Mapped[str] = mapped_column(String(100), nullable=False)
    theme_mode: Mapped[NullableString] = mapped_column(String(100), nullable=True)
    decoration_preset: Mapped[NullableString] = mapped_column(String(100), nullable=True)
    token_overrides: Mapped[ThemeTokenOverridesData] = mapped_column(JSON, nullable=False, default=dict)
    assets: Mapped[ExperienceAssetsData] = mapped_column(JSON, nullable=False, default=dict)
    navigation: Mapped[list[NavigationItemData]] = mapped_column(JSON, nullable=False, default=list)
    pages: Mapped[ExperiencePagesData] = mapped_column(JSON, nullable=False, default=dict)
    variant_overrides: Mapped[VariantOverridesData] = mapped_column(JSON, nullable=False, default=dict)
    organization: Mapped[Organization] = relationship("Organization", back_populates="experience")


class OrganizationFeatureEntitlement(OrganizationModel):
    __tablename__ = "organization_feature_entitlement"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "feature_key", name="uq_organization_feature_entitlement_organization_feature"
        ),
    )

    feature_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    configuration: Mapped[NullableFeatureEntitlementConfigurationData] = mapped_column(JSON, nullable=True)
    organization: Mapped[Organization] = relationship("Organization", back_populates="feature_entitlements")


class User(OrganizationModel):
    __tablename__ = "user"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_user_organization_email"),
        UniqueConstraint("organization_id", "tax_id", name="uq_user_organization_tax_id"),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str] = mapped_column(String(100), nullable=True)
    tax_id: Mapped[str] = mapped_column(String(20), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    password: Mapped[str] = mapped_column(String(255), nullable=False)
    password_reset_code_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    password_reset_expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    password_reset_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=True)
    password_reset_verified_until: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    password_reset_token_hash: Mapped[str] = mapped_column(String(255), nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        StrEnumType(UserStatus, length=50), default=UserStatus.ACTIVE, nullable=False, index=True
    )
    role: Mapped[UserRole] = mapped_column(
        StrEnumType(UserRole, length=50), default=UserRole.CLIENT, nullable=False, index=True
    )

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    billing_address: Mapped["CustomerBillingAddress"] = relationship(
        "CustomerBillingAddress", back_populates="customer", uselist=False, cascade="all, delete-orphan"
    )
    cart: Mapped["Cart"] = relationship("Cart", back_populates="customer", uselist=False)
    reviews: Mapped[list["ProductReview"]] = relationship("ProductReview", back_populates="customer")
    coupons: Mapped[list["Coupon"]] = relationship("Coupon", back_populates="customer")
    organization: Mapped[Organization] = relationship("Organization", back_populates="users")


class Session(OrganizationModel):
    __tablename__ = "session"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, default=naive_utc_now, onupdate=naive_utc_now, nullable=False
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, server_default="0")
    user: Mapped[User] = relationship("User", back_populates="sessions")


__all__ = [
    "ExperienceAssetsData",
    "ExperiencePagesData",
    "FeatureEntitlementConfigurationData",
    "FeatureKey",
    "NavigationItemData",
    "NavigationRouteId",
    "OpeningHoursData",
    "Organization",
    "OrganizationDomain",
    "OrganizationExperience",
    "OrganizationFeatureEntitlement",
    "OrganizationProfile",
    "OrganizationType",
    "ORGANIZATION_STAFF_ROLES",
    "SectionType",
    "Session",
    "SocialLinksData",
    "SocialPlatformKey",
    "ThemeTokenOverridesData",
    "User",
    "UserRole",
    "UserStatus",
    "VariantOverridesData",
    "is_organization_staff_role",
    "normalize_user_role",
]
