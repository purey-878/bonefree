"""Aggregate the legacy `/admin` contract from capability routers."""

from . import analytics, catalog, customers, orders, owner, staff_auth  # noqa: F401
from ._shared import router

__all__ = ["router"]
