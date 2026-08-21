from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from core.errors import AppHTTPException
from core.rate_limit import enforce_rate_limit, get_client_ip
from database import get_db
from schemas.admin import AdminLogin
from schemas.enums import UserRole, UserStatus, is_admin_role, normalize_admin_role, normalize_user_role
from schemas.user import UserAuth, UserRegister
from models import Admin, Customer, Session
from services.auth_service import hash_session_token
from utils.datetime_utils import to_naive_utc


bearer_security = HTTPBearer(
    auto_error=False,
    bearerFormat="opaque session token",
    scheme_name="BearerAuth",
    description="Session token returned by a customer or administrator login.",
)


def get_session_token_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_security),
) -> str | None:
    return credentials.credentials if credentials is not None else None


def _current_naive_utc() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def get_current_user(
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
    ):
        raise AppHTTPException(status_code=status.HTTP_401_UNAUTHORIZED, error="authentication_required", message="Authentication required.", details={"reason": "request_failed"})

    current_user = session.customer
    if current_user.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    return current_user


def get_current_user_optional(
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
    ):
        return None

    return session.customer


def get_current_admin(
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
    """Prepared for future guest checkout protection; not wired to a route yet."""
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
