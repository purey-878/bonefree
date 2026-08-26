"""Compatibility facade for domain service modules."""

from modules.auth.services import auth_email, authentication, email, password_reset
from modules.restaurant.services import (
    invoices,
    media_storage,
    order_customization,
    product_availability,
    product_media,
    product_pricing,
    receipt_email,
    receipt_pdf,
    site_settings,
    substitution,
)

__all__ = [
    "auth_email",
    "authentication",
    "email",
    "invoices",
    "media_storage",
    "order_customization",
    "password_reset",
    "product_availability",
    "product_media",
    "product_pricing",
    "receipt_email",
    "receipt_pdf",
    "site_settings",
    "substitution",
]
