"""Compatibility facade for public request and response schemas."""

from modules.auth.schemas import *  # noqa: F403
from modules.auth.schemas import __all__ as _auth_exports
from modules.restaurant.schemas import *  # noqa: F403
from modules.restaurant.schemas import __all__ as _restaurant_exports

__all__ = [*_auth_exports, *_restaurant_exports]

del _auth_exports, _restaurant_exports
