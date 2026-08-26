"""Compatibility facade for active FastAPI routers."""

from modules.auth.routers.auth import router as auth_router
from modules.auth.routers.organizations import experience_router as organization_experience_router
from modules.auth.routers.organizations import router as organizations_router
from modules.restaurant.routers.management import router as staff_router
from modules.restaurant.routers.cart import router as cart_router
from modules.restaurant.routers.checkout import router as checkout_router
from modules.restaurant.routers.products import router as products_router
from modules.restaurant.routers.profile import router as profile_router
from modules.restaurant.routers.reviews import router as reviews_router
from modules.restaurant.routers.site_settings import owner_router as site_settings_staff_router
from modules.restaurant.routers.site_settings import public_router as site_settings_public_router

__all__ = [
    "auth_router",
    "cart_router",
    "checkout_router",
    "organization_experience_router",
    "organizations_router",
    "products_router",
    "profile_router",
    "reviews_router",
    "site_settings_public_router",
    "site_settings_staff_router",
    "staff_router",
]
