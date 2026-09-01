from pydantic import BaseModel, ConfigDict, Field

from modules.auth.models import (
    FeatureKey,
    NavigationRouteId,
    SectionType,
    SocialPlatformKey,
)


SectionPropertyScalar = str | int | float | bool | None
SectionPropertyValue = SectionPropertyScalar | list[SectionPropertyScalar]


class StrictOrganizationConfiguration(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OpeningHoursPeriod(StrictOrganizationConfiguration):
    opens_at: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    closes_at: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class OpeningHours(StrictOrganizationConfiguration):
    monday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    tuesday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    wednesday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    thursday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    friday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    saturday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)
    sunday: list[OpeningHoursPeriod] | None = Field(default=None, exclude_if=lambda value: value is None)


class PublicSocialLink(StrictOrganizationConfiguration):
    platform: SocialPlatformKey
    label: str
    href: str
    enabled: bool = True


class PublicSocialLinks(StrictOrganizationConfiguration):
    links: list[PublicSocialLink] = Field(default_factory=list)


class ResolvedOrganizationResponse(BaseModel):
    slug: str
    name: str


class PublicOrganizationIdentity(BaseModel):
    slug: str
    name: str


class PublicOrganizationProfile(BaseModel):
    display_name: str | None = None
    description: str | None = None
    about_text: str | None = None
    email: str | None = None
    privacy_contact_email: str | None = None
    phone: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str
    logo_url: str | None = None
    currency_code: str
    opening_hours: OpeningHours = Field(default_factory=OpeningHours)
    social_links: PublicSocialLinks = Field(default_factory=PublicSocialLinks)


class ThemeTokenOverrides(StrictOrganizationConfiguration):
    primary: str | None = Field(default=None, exclude_if=lambda value: value is None)
    accent: str | None = Field(default=None, exclude_if=lambda value: value is None)
    secondary: str | None = Field(default=None, exclude_if=lambda value: value is None)
    background: str | None = Field(default=None, exclude_if=lambda value: value is None)
    surface: str | None = Field(default=None, exclude_if=lambda value: value is None)
    text: str | None = Field(default=None, exclude_if=lambda value: value is None)
    text_muted: str | None = Field(default=None, exclude_if=lambda value: value is None)
    border: str | None = Field(default=None, exclude_if=lambda value: value is None)
    price_highlight: str | None = Field(default=None, exclude_if=lambda value: value is None)


class PublicThemeConfiguration(StrictOrganizationConfiguration):
    key: str
    mode: str | None = None
    decoration_preset: str | None = None
    token_overrides: ThemeTokenOverrides = Field(default_factory=ThemeTokenOverrides)


class ExperienceAssets(StrictOrganizationConfiguration):
    logo: str | None = Field(default=None, exclude_if=lambda value: value is None)


class NavigationItem(StrictOrganizationConfiguration):
    id: str
    route_id: NavigationRouteId
    label: str
    enabled: bool = True


class SectionDescriptor(StrictOrganizationConfiguration):
    id: str
    type: SectionType
    enabled: bool = True
    feature_key: FeatureKey | None = None
    variant: str | None = None
    override_key: str | None = None
    props: dict[str, SectionPropertyValue] = Field(default_factory=dict)


class PageConfiguration(StrictOrganizationConfiguration):
    sections: list[SectionDescriptor] = Field(default_factory=list)


class ExperiencePages(StrictOrganizationConfiguration):
    home: PageConfiguration | None = Field(default=None, exclude_if=lambda value: value is None)


class VariantOverrides(StrictOrganizationConfiguration):
    hero: str | None = Field(default=None, exclude_if=lambda value: value is None)
    category_navigation: str | None = Field(default=None, exclude_if=lambda value: value is None)
    loyalty: str | None = Field(default=None, exclude_if=lambda value: value is None)
    popular_products: str | None = Field(default=None, exclude_if=lambda value: value is None)
    chef_special: str | None = Field(default=None, exclude_if=lambda value: value is None)
    reviews: str | None = Field(default=None, exclude_if=lambda value: value is None)
    events: str | None = Field(default=None, exclude_if=lambda value: value is None)


class PublicExperienceConfiguration(StrictOrganizationConfiguration):
    theme: PublicThemeConfiguration
    assets: ExperienceAssets = Field(default_factory=ExperienceAssets)
    navigation: list[NavigationItem] = Field(default_factory=list)
    pages: ExperiencePages = Field(default_factory=ExperiencePages)
    variant_overrides: VariantOverrides = Field(default_factory=VariantOverrides)


class PublicOrganizationExperienceResponse(BaseModel):
    schema_version: int
    organization: PublicOrganizationIdentity
    profile: PublicOrganizationProfile
    capabilities: list[FeatureKey]
    experience: PublicExperienceConfiguration
