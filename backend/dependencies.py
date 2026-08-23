from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

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
from schemas.admin import AdminLogin
from schemas.enums import UserRole, UserStatus, is_admin_role, normalize_admin_role, normalize_user_role
from schemas.user import UserAuth, UserRegister
from models import Admin, Customer, Organization, Session
from services.auth_service import hash_session_token
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
        if header_organization is None:
            raise AppHTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                error="organization_not_found",
                message="Organization not found.",
                details={"organization_slug": normalized_slug},
            )

    token_organization_id: int | None = None
    if token is not None:
        token_organization_id = db.scalar(
            select(Session.organization_id)
            .where(Session.token_hash == hash_session_token(token))
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
    if organization is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
            details={"organization_slug": normalized_slug},
        )

    db.info["organization_id"] = organization.id
    request.state.organization_id = organization.id
    request.state.organization_slug = organization.slug
    return organization.id


def get_current_user(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> Customer:
    if token is None:
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.customer is None
        or session.revoked is True
        or session.expires_at <= now
        or normalize_user_role(session.customer.role) != UserRole.CLIENT
    ):
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    current_user = session.customer
    if current_user.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    return current_user


def get_current_user_optional(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> Customer | None:
    if token is None:
        return None

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.customer is None
        or session.revoked is True
        or session.expires_at <= now
        or session.customer.status != UserStatus.ACTIVE
        or normalize_user_role(session.customer.role) != UserRole.CLIENT
    ):
        return None

    return session.customer


def get_current_admin(
    _organization_id: int = Depends(require_organization_context),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> Admin:
    if token is None:
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.admin is None
        or session.revoked is True
        or session.expires_at <= now
        or (
            session.last_seen_at is not None
            and (
                session.last_seen_at
                + timedelta(minutes=settings.admin_session_inactivity_expiration_minutes)
            )
            <= now
        )
    ):
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    current_admin = session.admin
    if current_admin.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    current_admin.role = normalize_user_role(current_admin.role)
    if not is_admin_role(current_admin.role):
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    if session.last_seen_at is None or (now - session.last_seen_at).total_seconds() > 60:
        session.last_seen_at = now
        db.commit()

    return current_admin


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


async def rate_limit_admin_login(payload: AdminLogin, request: Request) -> AdminLogin:
    await _enforce_auth_ip_and_credential_rate_limits(
        request,
        action="admin:login",
        credential_bucket="identifier",
        credential=payload.email,
        credential_max_requests=settings.rate_limit_admin_login_requests,
        credential_window_seconds=settings.rate_limit_admin_login_window_seconds,
    )
    return payload


async def rate_limit_admin(request: Request) -> None:
    await enforce_rate_limit(
        request,
        bucket="admin:ip",
        identity=get_client_ip(request),
        max_requests=settings.rate_limit_admin_requests,
        window_seconds=settings.rate_limit_admin_window_seconds,
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


def require_role(*allowed_roles: str | UserRole) -> Callable:
    normalized_allowed_roles = tuple(normalize_admin_role(role) for role in allowed_roles)

    def role_checker(
        _rate_limit: None = Depends(rate_limit_admin),
        current_admin: Admin = Depends(get_current_admin),
    ) -> Admin:
        current_admin.role = normalize_user_role(current_admin.role)
        if current_admin.role not in normalized_allowed_roles:
            raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})
        return current_admin

    return role_checker
