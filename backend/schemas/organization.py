from typing import Any

from pydantic import BaseModel, Field


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
    phone: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    postal_code: str | None = None
    country: str
    logo_url: str | None = None
    currency_code: str
    opening_hours: dict[str, Any] = Field(default_factory=dict)
    social_links: dict[str, Any] = Field(default_factory=dict)


class PublicThemeConfiguration(BaseModel):
    key: str
    mode: str | None = None
    decoration_preset: str | None = None
    token_overrides: dict[str, str] = Field(default_factory=dict)


class NavigationItem(BaseModel):
    id: str
    route_id: str
    label: str
    enabled: bool = True


class SectionDescriptor(BaseModel):
    id: str
    type: str
    enabled: bool = True
    feature_key: str | None = None
    variant: str | None = None
    override_key: str | None = None
    props: dict[str, Any] = Field(default_factory=dict)


class PageConfiguration(BaseModel):
    sections: list[SectionDescriptor] = Field(default_factory=list)


class PublicExperienceConfiguration(BaseModel):
    theme: PublicThemeConfiguration
    assets: dict[str, str] = Field(default_factory=dict)
    navigation: list[NavigationItem] = Field(default_factory=list)
    pages: dict[str, PageConfiguration] = Field(default_factory=dict)
    variant_overrides: dict[str, str] = Field(default_factory=dict)


class PublicOrganizationExperienceResponse(BaseModel):
    schema_version: int
    organization: PublicOrganizationIdentity
    profile: PublicOrganizationProfile
    capabilities: list[str]
    experience: PublicExperienceConfiguration
