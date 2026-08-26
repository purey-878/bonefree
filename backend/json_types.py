"""Static types for JSON values persisted by ORM models.

SQLAlchemy's JSON column stores ordinary Python containers at runtime. These
types document the accepted shape for type checkers; request/response runtime
validation remains the responsibility of the Pydantic schemas.
"""

from __future__ import annotations

from typing import Literal, NotRequired, TypedDict, TypeAlias


JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
JsonObject: TypeAlias = dict[str, JsonValue]
SectionPropertyScalar: TypeAlias = JsonScalar
SectionPropertyValue: TypeAlias = SectionPropertyScalar | list[SectionPropertyScalar]
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
