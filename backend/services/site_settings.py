from __future__ import annotations

import copy
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import SiteSetting
from schemas.site_settings import (
    ChefSpecialSettings,
    CompanyDetailsSettings,
    EventsSettings,
    LoyaltyCouponSettings,
    SiteThemeResponse,
    SiteThemeSettings,
    SocialMediaSettings,
    ThemeConfig,
)


SITE_THEME_KEY = "site_theme"
CHEF_SPECIAL_KEY = "chef_special"
LOYALTY_COUPON_KEY = "loyalty_coupon"
COMPANY_DETAILS_KEY = "company_details"
SOCIAL_MEDIA_KEY = "social_media"
EVENTS_KEY = "events"
DEFAULT_SITE_THEME = SiteThemeSettings()
DEFAULT_CHEF_SPECIAL = ChefSpecialSettings()
DEFAULT_LOYALTY_COUPON = LoyaltyCouponSettings()
DEFAULT_COMPANY_DETAILS = CompanyDetailsSettings()
DEFAULT_SOCIAL_MEDIA = SocialMediaSettings(
    links=[
        {"platform": "facebook", "label": "Facebook", "href": "#", "enabled": True},
        {"platform": "instagram", "label": "Instagram", "href": "#", "enabled": True},
        {"platform": "whatsapp", "label": "WhatsApp", "href": "#", "enabled": True},
        {"platform": "youtube", "label": "YouTube", "href": "#", "enabled": True},
    ]
)
DEFAULT_EVENTS = EventsSettings(
    events=[
        {
            "id": "dj-adriano",
            "title": "DJ Adriano",
            "kicker": "Friday selector",
            "description": "A warm late-night set built for cocktails, plant-based plates, and a room that stays moving.",
            "date": "2026-06-12",
            "start_time": "19:00",
            "end_time": "23:00",
            "image_url": "/assets/images/dj_adriano.jpg",
            "enabled": True,
        },
        {
            "id": "dj-khalil",
            "title": "DJ Khalil",
            "kicker": "Saturday session",
            "description": "Groove-led sounds for a long table night with friends, sharing dishes, and coastal energy.",
            "date": "2026-06-13",
            "start_time": "20:00",
            "end_time": "00:00",
            "image_url": "/assets/images/dj_khalil.jpg",
            "enabled": True,
        },
    ]
)


def _get_setting_row(db: Session, key: str) -> SiteSetting | None:
    return db.scalar(select(SiteSetting).where(SiteSetting.key == key))


BUILT_IN_THEMES: dict[str, dict[str, Any]] = {
    "normal": {
        "id": "normal",
        "name": "Bonefree Classic",
        "colors": {
            "primary": "#7BAF4B",
            "accent": "#FDCD43",
            "secondary": "#076050",
            "background": "#f8faf6",
            "surface": "#ffffff",
            "text": "#17211d",
            "textMuted": "#65746c",
            "border": "#dfe8dc",
            "priceHighlight": "#b42318",
        },
        "background": {
            "type": "gradient",
            "value": "radial-gradient(circle at top left, rgba(253, 205, 67, 0.12), transparent 30rem), radial-gradient(circle at top right, rgba(123, 175, 75, 0.1), transparent 34rem), #f8faf6",
        },
        "decorations": [],
        "ui": {
            "borderRadius": "8px",
            "buttonStyle": "rounded",
            "cardShadow": "0 18px 48px rgba(23, 33, 29, 0.1)",
        },
    },
    "presentation": {
        "id": "presentation",
        "name": "Bonefree Presentation",
        "colors": {
            "primary": "#5f9636",
            "accent": "#e0aa00",
            "secondary": "#04483d",
            "background": "#eef5ea",
            "surface": "#ffffff",
            "text": "#07110d",
            "textMuted": "#334238",
            "border": "#6f806f",
            "priceHighlight": "#981b1b",
        },
        "background": {
            "type": "gradient",
            "value": "radial-gradient(circle at top left, rgba(224, 170, 0, 0.2), transparent 28rem), radial-gradient(circle at top right, rgba(95, 150, 54, 0.18), transparent 32rem), #eef5ea",
        },
        "decorations": [],
        "ui": {
            "borderRadius": "8px",
            "buttonStyle": "rounded",
            "cardShadow": "0 18px 44px rgba(7, 17, 13, 0.18)",
        },
    },
    "christmas": {
        "id": "christmas",
        "name": "Christmas",
        "colors": {
            "primary": "#a83232",
            "accent": "#d9b441",
            "secondary": "#2f6f4e",
            "background": "#f8f4ea",
            "surface": "#fffdf7",
            "text": "#1e2a20",
            "textMuted": "#607064",
            "border": "#d8cdbb",
            "priceHighlight": "#b45309",
        },
        "background": {
            "type": "gradient",
            "value": "radial-gradient(circle at 10% 8%, rgba(168, 50, 50, 0.1), transparent 24rem), radial-gradient(circle at 90% 12%, rgba(47, 111, 78, 0.12), transparent 24rem), linear-gradient(180deg, #fbf8ef 0%, #f1eadb 100%)",
            "overlay": "rgba(255,255,255,0.18)",
        },
        "decorations": [
            {"type": "floating", "element": "snowflake", "count": 10, "animation": "fall", "opacity": 0.35, "zIndex": "above-content", "size": "mixed", "color": "#ffffff"},
            {"type": "floating", "element": "bauble", "count": 3, "animation": "sway", "opacity": 0.35, "zIndex": "behind-content", "size": "lg"},
            {"type": "floating", "element": "candy-cane", "count": 2, "animation": "float", "opacity": 0.28, "zIndex": "behind-content", "size": "md"},
            {"type": "fixed", "element": "santa-hat", "count": 1, "animation": "none", "opacity": 0.9, "zIndex": "above-content", "size": "sm"},
        ],
        "fonts": {"heading": "Mountains of Christmas"},
        "ui": {
            "borderRadius": "10px",
            "buttonStyle": "pill",
            "cardShadow": "0 16px 40px rgba(84, 62, 42, 0.12)",
        },
    },
    "halloween": {
        "id": "halloween",
        "name": "Halloween",
        "colors": {
            "primary": "#b45309",
            "accent": "#7c3aed",
            "secondary": "#4c1d95",
            "background": "#f7f0e8",
            "surface": "#fffaf2",
            "text": "#241b2d",
            "textMuted": "#6f5f78",
            "border": "#d8c9da",
            "priceHighlight": "#c2410c",
        },
        "background": {
            "type": "gradient",
            "value": "radial-gradient(circle at 10% 8%, rgba(180, 83, 9, 0.13), transparent 23rem), radial-gradient(circle at 88% 12%, rgba(76, 29, 149, 0.12), transparent 24rem), linear-gradient(180deg, #fbf4ea 0%, #efe7f2 100%)",
            "overlay": "rgba(255,255,255,0.16)",
        },
        "decorations": [
            {"type": "floating", "element": "ghost", "count": 3, "animation": "float", "opacity": 0.12, "zIndex": "behind-content", "size": "lg", "color": "#4c1d95"},
            {"type": "floating", "element": "ghost", "count": 2, "animation": "float", "opacity": 0.14, "zIndex": "above-content", "size": "sm", "color": "#7c3aed"},
            {"type": "fixed", "element": "spider-web", "count": 2, "animation": "none", "opacity": 0.18, "zIndex": "behind-content", "size": "lg"},
            {"type": "floating", "element": "spider", "count": 2, "animation": "sway", "opacity": 0.3, "zIndex": "above-content", "size": "sm", "color": "#241b2d"},
            {"type": "floating", "element": "pumpkin", "count": 2, "animation": "fade-in-out", "opacity": 0.22, "zIndex": "behind-content", "size": "md"},
        ],
        "ui": {
            "borderRadius": "12px",
            "buttonStyle": "rounded",
            "cardShadow": "0 16px 40px rgba(76, 29, 149, 0.13)",
        },
    },
}


def _scaled_decorations(settings: SiteThemeSettings, config: dict[str, Any]) -> list[dict[str, Any]]:
    if not settings.decoration_enabled:
        return []
    multiplier = {1: 0.5, 2: 1, 3: 1.5}.get(settings.decoration_intensity, 1)
    scaled = []
    for decoration in config.get("decorations", []):
        item = dict(decoration)
        if item.get("count") is not None:
            item["count"] = max(1, round(int(item["count"]) * multiplier))
        scaled.append(item)
    return scaled


def resolve_site_theme(settings: SiteThemeSettings) -> SiteThemeResponse:
    if settings.theme_id not in BUILT_IN_THEMES:
        settings = SiteThemeSettings(
            theme_id="normal",
            decoration_enabled=settings.decoration_enabled,
            decoration_intensity=settings.decoration_intensity,
        )
    base = copy.deepcopy(BUILT_IN_THEMES.get(settings.theme_id, BUILT_IN_THEMES["normal"]))
    if settings.colors:
        base["colors"].update(settings.colors)
        if settings.colors.get("background"):
            base["background"]["type"] = "solid"
            base["background"]["value"] = settings.colors["background"]
    base["decorations"] = _scaled_decorations(settings, base)
    config = ThemeConfig(**base)
    return SiteThemeResponse(**settings.model_dump(), config=config)


def get_site_theme_settings(db: Session) -> SiteThemeSettings:
    row = _get_setting_row(db, SITE_THEME_KEY)
    if not row or not row.value:
        return DEFAULT_SITE_THEME
    try:
        payload: dict[str, Any] = json.loads(row.value)
        return SiteThemeSettings(**payload)
    except Exception:
        return DEFAULT_SITE_THEME


def get_site_theme(db: Session) -> SiteThemeResponse:
    return resolve_site_theme(get_site_theme_settings(db))


def save_site_theme(db: Session, settings: SiteThemeSettings) -> SiteThemeResponse:
    row = _get_setting_row(db, SITE_THEME_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=SITE_THEME_KEY, value=encoded)
        db.add(row)
    db.commit()
    return resolve_site_theme(settings)


def get_chef_special_settings(db: Session) -> ChefSpecialSettings:
    row = _get_setting_row(db, CHEF_SPECIAL_KEY)
    if not row or not row.value:
        return DEFAULT_CHEF_SPECIAL
    try:
        payload = json.loads(row.value)
        if isinstance(payload, str):
            payload = {"product_id": payload}
        return ChefSpecialSettings(**payload)
    except Exception:
        return DEFAULT_CHEF_SPECIAL


def save_chef_special_settings(db: Session, settings: ChefSpecialSettings) -> ChefSpecialSettings:
    row = _get_setting_row(db, CHEF_SPECIAL_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=CHEF_SPECIAL_KEY, value=encoded)
        db.add(row)
    db.commit()
    return settings


def get_loyalty_coupon_settings(db: Session) -> LoyaltyCouponSettings:
    row = _get_setting_row(db, LOYALTY_COUPON_KEY)
    if not row or not row.value:
        return DEFAULT_LOYALTY_COUPON
    try:
        payload = json.loads(row.value)
        return LoyaltyCouponSettings(**payload)
    except Exception:
        return DEFAULT_LOYALTY_COUPON


def save_loyalty_coupon_settings(db: Session, settings: LoyaltyCouponSettings) -> LoyaltyCouponSettings:
    row = _get_setting_row(db, LOYALTY_COUPON_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=LOYALTY_COUPON_KEY, value=encoded)
        db.add(row)
    db.commit()
    return settings


def get_company_details_settings(db: Session) -> CompanyDetailsSettings:
    row = _get_setting_row(db, COMPANY_DETAILS_KEY)
    if not row or not row.value:
        return DEFAULT_COMPANY_DETAILS
    try:
        payload = json.loads(row.value)
        return CompanyDetailsSettings(**payload)
    except Exception:
        return DEFAULT_COMPANY_DETAILS


def save_company_details_settings(db: Session, settings: CompanyDetailsSettings) -> CompanyDetailsSettings:
    row = _get_setting_row(db, COMPANY_DETAILS_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=COMPANY_DETAILS_KEY, value=encoded)
        db.add(row)
    db.commit()
    return settings


def get_social_media_settings(db: Session) -> SocialMediaSettings:
    row = _get_setting_row(db, SOCIAL_MEDIA_KEY)
    if not row or not row.value:
        return DEFAULT_SOCIAL_MEDIA
    try:
        payload = json.loads(row.value)
        return SocialMediaSettings(**payload)
    except Exception:
        return DEFAULT_SOCIAL_MEDIA


def save_social_media_settings(db: Session, settings: SocialMediaSettings) -> SocialMediaSettings:
    row = _get_setting_row(db, SOCIAL_MEDIA_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=SOCIAL_MEDIA_KEY, value=encoded)
        db.add(row)
    db.commit()
    return settings


def get_events_settings(db: Session) -> EventsSettings:
    row = _get_setting_row(db, EVENTS_KEY)
    if not row or not row.value:
        return DEFAULT_EVENTS
    try:
        payload = json.loads(row.value)
        return EventsSettings(**payload)
    except Exception:
        return DEFAULT_EVENTS


def save_events_settings(db: Session, settings: EventsSettings) -> EventsSettings:
    row = _get_setting_row(db, EVENTS_KEY)
    encoded = settings.model_dump_json()
    if row:
        row.value = encoded
    else:
        row = SiteSetting(key=EVENTS_KEY, value=encoded)
        db.add(row)
    db.commit()
    return settings
