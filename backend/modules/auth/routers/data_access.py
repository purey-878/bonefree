from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Header, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from core.errors import AppHTTPException
from core.organizations import normalize_hostname
from core.rate_limit import RATE_LIMIT_OPENAPI_RESPONSES, enforce_rate_limit, get_client_ip
from database import get_db
from modules.auth.dependencies import get_session_token_optional
from modules.auth.models import (
    DataAccessLoginChallenge,
    Organization,
    OrganizationDomain,
    Session,
    SessionMode,
    User,
    UserRole,
    UserStatus,
)
from modules.auth.schemas.data_access import (
    DataAccessOtpChallengeResponse,
    DataAccessOtpRequest,
    DataAccessOtpVerifyRequest,
    DataAccessOwnerIdentity,
    DataAccessSessionResponse,
    DataAccessTokenResponse,
)
from modules.auth.services.authentication import (
    create_data_access_session,
    hash_session_token,
    verify_password,
)
from modules.auth.services.email import send_data_access_otp_email
from modules.auth.services.organization_lifecycle import (
    OrganizationAccessState,
    data_access_expires_at,
    organization_access_state,
)
from utils.datetime_utils import to_naive_utc


router = APIRouter(prefix="/data-access", tags=["Data Access"])


def _now() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def _origin_hostname(request: Request) -> str:
    origin = request.headers.get("origin")
    if not origin:
        raise AppHTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error="origin_required",
            message="A matching Origin header is required.",
        )
    try:
        return normalize_hostname(origin)
    except ValueError as exc:
        raise AppHTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error="origin_mismatch",
            message="The request origin does not match the organization hostname.",
        ) from exc


def _require_frozen_organization(
    request: Request,
    hostname: str,
    db: DBSession,
) -> Organization:
    try:
        normalized_hostname = normalize_hostname(hostname)
    except ValueError as exc:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        ) from exc
    if _origin_hostname(request) != normalized_hostname:
        raise AppHTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            error="origin_mismatch",
            message="The request origin does not match the organization hostname.",
        )

    organization = db.scalar(
        select(Organization)
        .join(OrganizationDomain, OrganizationDomain.organization_id == Organization.id)
        .where(
            OrganizationDomain.domain == normalized_hostname,
            OrganizationDomain.is_verified.is_(True),
            OrganizationDomain.deactivated_at.is_(None),
            Organization.purged_at.is_(None),
        )
        .execution_options(skip_organization_scope=True)
    )
    if (
        organization is None
        or organization_access_state(organization) != OrganizationAccessState.FROZEN
    ):
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    db.info["organization_id"] = organization.id
    request.state.organization_id = organization.id
    request.state.organization_hostname = normalized_hostname
    return organization


def require_data_access_owner(
    request: Request,
    organization_hostname: str | None = Header(default=None, alias="X-Organization-Hostname"),
    token: str | None = Depends(get_session_token_optional),
    db: DBSession = Depends(get_db),
) -> User:
    if not organization_hostname or not token:
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="authentication_required",
            message="Authentication required.",
        )
    organization = _require_frozen_organization(request, organization_hostname, db)
    session = db.scalar(
        select(Session).where(
            Session.token_hash == hash_session_token(token),
            Session.mode == SessionMode.DATA_ACCESS,
        )
    )
    now = _now()
    if (
        session is None
        or session.organization_id != organization.id
        or session.revoked
        or session.expires_at <= now
        or session.user is None
        or session.user.status != UserStatus.ACTIVE
        or session.user.role != UserRole.OWNER
    ):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="authentication_required",
            message="Authentication required.",
        )
    request.state.data_access_expires_at = data_access_expires_at(organization)
    return session.user


def _identity(owner: User) -> DataAccessOwnerIdentity:
    return DataAccessOwnerIdentity(owner_id=owner.id, name=owner.name, email=owner.email)


@router.post(
    "/auth/request-code",
    response_model=DataAccessOtpChallengeResponse,
    responses=RATE_LIMIT_OPENAPI_RESPONSES,
    operation_id="data_access_request_login_code",
)
async def request_login_code(
    body: DataAccessOtpRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> DataAccessOtpChallengeResponse:
    await enforce_rate_limit(
        request,
        bucket="auth:data_access_login:ip",
        identity=get_client_ip(request),
        max_requests=settings.rate_limit_auth_ip_requests,
        window_seconds=settings.rate_limit_auth_ip_window_seconds,
    )
    await enforce_rate_limit(
        request,
        bucket="auth:data_access_login:email",
        identity=str(body.email),
        max_requests=settings.rate_limit_login_identifier_requests,
        window_seconds=settings.rate_limit_login_identifier_window_seconds,
    )
    organization = _require_frozen_organization(request, body.hostname, db)
    owner = db.scalar(
        select(User).where(
            User.email == str(body.email).strip().lower(),
            User.role == UserRole.OWNER,
            User.status == UserStatus.ACTIVE,
        )
    )
    if owner is None or not verify_password(body.password, owner.password):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
        )

    challenge_id = str(uuid.uuid4())
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = _now() + timedelta(minutes=settings.data_access_otp_expiration_minutes)
    db.add(
        DataAccessLoginChallenge(
            public_id=challenge_id,
            user_id=owner.id,
            code_hash=hashlib.sha256(f"{challenge_id}:{code}".encode()).hexdigest(),
            expires_at=expires_at,
        )
    )
    db.commit()
    send_data_access_otp_email(
        owner.email,
        code,
        organization.name,
        settings.data_access_otp_expiration_minutes,
    )
    return DataAccessOtpChallengeResponse(challenge_id=challenge_id, expires_at=expires_at)


@router.post(
    "/auth/verify-code",
    response_model=DataAccessTokenResponse,
    operation_id="data_access_verify_login_code",
)
def verify_login_code(
    body: DataAccessOtpVerifyRequest,
    request: Request,
    db: DBSession = Depends(get_db),
) -> DataAccessTokenResponse:
    organization = _require_frozen_organization(request, body.hostname, db)
    challenge = db.scalar(
        select(DataAccessLoginChallenge).where(
            DataAccessLoginChallenge.public_id == body.challenge_id
        )
    )
    now = _now()
    expected = hashlib.sha256(f"{body.challenge_id}:{body.code}".encode()).hexdigest()
    if (
        challenge is None
        or challenge.consumed_at is not None
        or challenge.expires_at <= now
        or challenge.attempts >= 5
        or not hmac.compare_digest(challenge.code_hash, expected)
    ):
        if challenge is not None and challenge.consumed_at is None:
            challenge.attempts += 1
            db.commit()
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_otp",
            message="The verification code is invalid or expired.",
        )
    owner = db.scalar(
        select(User).where(
            User.id == challenge.user_id,
            User.role == UserRole.OWNER,
            User.status == UserStatus.ACTIVE,
        )
    )
    if owner is None:
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="authentication_required",
            message="Authentication required.",
        )
    challenge.consumed_at = now
    token = create_data_access_session(
        db,
        owner.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()
    expires_at = data_access_expires_at(organization)
    if expires_at is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    return DataAccessTokenResponse(
        access_token=token,
        organization_name=organization.name,
        data_access_expires_at=expires_at,
        owner=_identity(owner),
    )


@router.get(
    "/me",
    response_model=DataAccessSessionResponse,
    operation_id="data_access_read_session",
)
def read_data_access_session(
    owner: User = Depends(require_data_access_owner),
    db: DBSession = Depends(get_db),
) -> DataAccessSessionResponse:
    organization = db.scalar(select(Organization).where(Organization.id == owner.organization_id))
    if organization is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    expires_at = data_access_expires_at(organization)
    if expires_at is None:
        raise AppHTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            error="organization_not_found",
            message="Organization not found.",
        )
    return DataAccessSessionResponse(
        organization_name=organization.name,
        data_access_expires_at=expires_at,
        owner=_identity(owner),
    )


__all__ = ["require_data_access_owner", "router"]
