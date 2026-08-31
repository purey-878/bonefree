from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
import re

from fastapi import Depends, Header, Request, Security, status
from fastapi.security import APIKeyHeader
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from core.errors import AppHTTPException
from core.organizations import normalize_organization_slug
from core.rate_limit import enforce_rate_limit, get_client_ip
from database import get_db
from modules.restaurant.schemas.owner import AdminLogin
from modules.auth.models import (
    Organization,
    OrganizationFeatureEntitlement,
    Session,
    SessionMode,
    User,
    UserRole,
    UserStatus,
    is_organization_staff_role,
    normalize_user_role,
)
from modules.auth.schemas.user import UserAuth, UserRegister
from modules.auth.services.authentication import hash_session_token
from modules.auth.services.organization_lifecycle import (
    OrganizationAccessState,
    organization_access_state,
)
from utils.datetime_utils import to_naive_utc


bearer_security = HTTPBearer(
    auto_error=False,
    bearerFormat="opaque session token",
    scheme_name="BearerAuth",
    description="Session token returned by a customer or administrator login.",
)

order_access_security = APIKeyHeader(
    name="X-Order-Token",
    auto_error=False,
    scheme_name="OrderAccessToken",
    description="Secret token returned once when a guest order is created.",
)


def get_session_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_security),
) -> str | None:
    return credentials.credentials if credentials is not None else None


def get_order_access_token_optional(
    token: str | None = Security(order_access_security),
) -> str | None:
    return token.strip() if token and token.strip() else None


def _current_naive_utc() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def _require_operational_organization(organization: Organization | None) -> Organization:
    if organization is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    if organization_access_state(organization) != OrganizationAccessState.OPERATIONAL:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    return organization


def require_organization_context(
    request: Request,
    organization_slug: str | None = Header(default=None, alias="X-Organization-Slug"),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> int:
    """Resolve and bind the tenant before any business query is executed."""
    header_organization: Organization | None = None
    normalized_slug: str | None = None
    if organization_slug is not None:
        try:
            normalized_slug = normalize_organization_slug(organization_slug)
        except ValueError as exc:
            raise AppHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                error="organization_not_found",
                message="Organization not found.",
                details={"organization_slug": organization_slug},
            ) from exc

        header_organization = db.scalar(
            select(Organization)
            .where(Organization.slug == normalized_slug)
            .execution_options(skip_organization_scope=True)
        )
        _require_operational_organization(header_organization)

    token_organization_id: int | None = None
    if token is not None:
        token_organization_id = db.scalar(
            select(Session.organization_id)
            .where(
                Session.token_hash == hash_session_token(token),
                Session.mode == SessionMode.OPERATIONAL,
            )
            .execution_options(skip_organization_scope=True)
        )

    if token_organization_id is not None and header_organization is not None:
        if token_organization_id != header_organization.id:
            raise AppHTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                error="organization_context_mismatch",
                message="The authenticated session belongs to a different organization.",
            )

    organization_id = token_organization_id or (
        header_organization.id if header_organization is not None else None
    )
    if organization_id is None:
        if token is not None:
            raise AppHTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                error="authentication_required",
                message="Authentication required.",
                details={"reason": "request_failed"},
            )
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="organization_context_required",
            message="Organization context is required.",
        )

    if header_organization is None:
        token_organization = db.scalar(
            select(Organization)
            .where(Organization.id == organization_id)
            .execution_options(skip_organization_scope=True)
        )
        _require_operational_organization(token_organization)

    db.info["organization_id"] = organization_id
    request.state.organization_id = organization_id
    request.state.organization_slug = (
        header_organization.slug if header_organization is not None else None
    )
    return organization_id


def require_organization_header_context(
    request: Request,
    organization_slug: str | None = Header(default=None, alias="X-Organization-Slug"),
    db: DBSession = Depends(get_db),
) -> int:
    """Bind a guest/public request without declaring bearer authentication."""
    if organization_slug is None:
        raise AppHTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            error="organization_context_required",
            message="Organization context is required.",
        )
    try:
        normalized_slug = normalize_organization_slug(organization_slug)
    except ValueError as exc:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
            details={"organization_slug": organization_slug},
        ) from exc

    organization = db.scalar(
        select(Organization)
        .where(Organization.slug == normalized_slug)
        .execution_options(skip_organization_scope=True)
    )
    _require_operational_organization(organization)

    db.info["organization_id"] = organization.id
    request.state.organization_id = organization.id
    request.state.organization_slug = organization.slug
    return organization.id


def require_organization_feature(feature_key: str) -> Callable:
    """Require a backend entitlement after organization context has been bound."""
    normalized_feature_key = feature_key.strip().lower()
    if re.fullmatch(r"[a-z0-9]+(?:_[a-z0-9]+)*", normalized_feature_key) is None:
        raise ValueError("Feature key must be lower snake case.")

    def feature_checker(
        request: Request,
        db: DBSession = Depends(get_db),
    ) -> str:
        organization_id = getattr(request.state, "organization_id", None)
        if organization_id is None or db.info.get("organization_id") != organization_id:
            raise AppHTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                error="organization_context_required",
                message="Organization context is required.",
            )

        enabled = db.scalar(
            select(OrganizationFeatureEntitlement.enabled).where(
                OrganizationFeatureEntitlement.organization_id == organization_id,
                OrganizationFeatureEntitlement.feature_key == normalized_feature_key,
            )
        )
        if enabled is not True:
            raise AppHTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                error="organization_feature_not_enabled",
                message="Organization feature is not enabled.",
                params={"feature_key": normalized_feature_key},
            )
        return normalized_feature_key

    return feature_checker


def get_current_user(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> User:
    if token is None:
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.user is None
        or session.revoked is True
        or session.mode != SessionMode.OPERATIONAL
        or session.expires_at <= now
        or normalize_user_role(session.user.role) != UserRole.CLIENT
    ):
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    current_user = session.user
    if current_user.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    return current_user


def get_current_user_optional(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> User | None:
    if token is None:
        return None

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.user is None
        or session.revoked is True
        or session.mode != SessionMode.OPERATIONAL
        or session.expires_at <= now
        or session.user.status != UserStatus.ACTIVE
        or normalize_user_role(session.user.role) != UserRole.CLIENT
    ):
        return None

    return session.user


def get_current_staff_user(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> User:
    if token is None:
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.user is None
        or session.revoked is True
        or session.mode != SessionMode.OPERATIONAL
        or session.expires_at <= now
        or (
            session.last_seen_at is not None
            and (
                session.last_seen_at
                + timedelta(minutes=settings.staff_session_inactivity_expiration_minutes)
            )
            <= now
        )
    ):
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    current_staff = session.user
    if current_staff.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    current_staff.role = normalize_user_role(current_staff.role)
    if not is_organization_staff_role(current_staff.role):
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    if session.last_seen_at is None or (now - session.last_seen_at).total_seconds() > 60:
        session.last_seen_at = now
        db.commit()

    return current_staff


async def _enforce_auth_ip_and_credential_rate_limits(
    request: Request,
    *,
    action: str,
    credential_bucket: str,
    credential: str,
    credential_max_requests: int,
    credential_window_seconds: int,
) -> None:
    await enforce_rate_limit(
        request,
        bucket=f"auth:{action}:ip",
        identity=get_client_ip(request),
        max_requests=settings.rate_limit_auth_ip_requests,
        window_seconds=settings.rate_limit_auth_ip_window_seconds,
    )
    await enforce_rate_limit(
        request,
        bucket=f"auth:{action}:{credential_bucket}",
        identity=credential,
        max_requests=credential_max_requests,
        window_seconds=credential_window_seconds,
    )


async def rate_limit_login(payload: UserAuth, request: Request) -> UserAuth:
    await _enforce_auth_ip_and_credential_rate_limits(
        request,
        action="login",
        credential_bucket="identifier",
        credential=payload.email,
        credential_max_requests=settings.rate_limit_login_identifier_requests,
        credential_window_seconds=settings.rate_limit_login_identifier_window_seconds,
    )
    return payload


async def rate_limit_register(payload: UserRegister, request: Request) -> UserRegister:
    await _enforce_auth_ip_and_credential_rate_limits(
        request,
        action="register",
        credential_bucket="email",
        credential=payload.email,
        credential_max_requests=settings.rate_limit_register_email_requests,
        credential_window_seconds=settings.rate_limit_register_email_window_seconds,
    )
    return payload


async def rate_limit_staff_login(payload: AdminLogin, request: Request) -> AdminLogin:
    await _enforce_auth_ip_and_credential_rate_limits(
        request,
        action="admin:login",
        credential_bucket="identifier",
        credential=payload.email,
        credential_max_requests=settings.rate_limit_staff_login_requests,
        credential_window_seconds=settings.rate_limit_staff_login_window_seconds,
    )
    return payload


async def rate_limit_staff(request: Request) -> None:
    await enforce_rate_limit(
        request,
        bucket="admin:ip",
        identity=get_client_ip(request),
        max_requests=settings.rate_limit_staff_requests,
        window_seconds=settings.rate_limit_staff_window_seconds,
    )


async def rate_limit_order(request: Request) -> None:
    """Limit order creation by source IP."""
    await enforce_rate_limit(
        request,
        bucket="order:ip",
        identity=get_client_ip(request),
        max_requests=settings.rate_limit_order_requests,
        window_seconds=settings.rate_limit_order_window_seconds,
    )


def require_organization_role(*allowed_roles: UserRole) -> Callable:
    normalized_allowed_roles = tuple(normalize_user_role(role) for role in allowed_roles)

    def role_checker(
        _rate_limit: None = Depends(rate_limit_staff),
        current_staff: User = Depends(get_current_staff_user),
    ) -> User:
        current_staff.role = normalize_user_role(current_staff.role)
        if current_staff.role not in normalized_allowed_roles:
            raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
        return current_staff

    return role_checker


__all__ = [
    "bearer_security",
    "get_current_staff_user",
    "get_current_user",
    "get_current_user_optional",
    "get_order_access_token_optional",
    "get_session_token_optional",
    "order_access_security",
    "rate_limit_login",
    "rate_limit_order",
    "rate_limit_register",
    "rate_limit_staff",
    "rate_limit_staff_login",
    "require_organization_context",
    "require_organization_feature",
    "require_organization_header_context",
    "require_organization_role",
]
