from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
from fastapi import Request, status
from sqlalchemy import update
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from core.errors import AppHTTPException
from core.rate_limit import get_client_ip
from modules.auth.models import (
    Session,
    User,
    UserStatus,
    is_organization_staff_role,
    normalize_user_role,
)
from utils.datetime_utils import to_naive_utc

def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def _verify_pbkdf2_password(password: str, encoded_password: str) -> bool:
    try:
        salt, stored_hash = encoded_password.split("$", maxsplit=1)
    except ValueError:
        return False

    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()
    return hmac.compare_digest(candidate_hash, stored_hash)


def verify_password(password: str, encoded_password: str) -> bool:
    if encoded_password.startswith(("$2a$", "$2b$", "$2y$")):
        return bcrypt.checkpw(
            password.encode("utf-8"),
            encoded_password.encode("utf-8"),
        )

    return _verify_pbkdf2_password(password, encoded_password)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_customer_session(
    db: DBSession,
    customer_id: int,
    ip_address: str | None,
    user_agent: str | None,
) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.session_expiration_minutes)
    session = Session(
        user_id=customer_id,
        token_hash=hash_session_token(token),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=to_naive_utc(expires_at),
    )
    db.add(session)
    return token


def create_staff_session(
    db: DBSession,
    staff_user_id: int,
    ip_address: str | None,
    user_agent: str | None,
) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.staff_session_expiration_minutes)
    session = Session(
        user_id=staff_user_id,
        token_hash=hash_session_token(token),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=to_naive_utc(expires_at),
    )
    db.add(session)
    return token


def revoke_all_customer_sessions(db: DBSession, customer_id: int) -> None:
    db.execute(
        update(Session)
        .where(
            Session.user_id == customer_id,
            Session.organization_id == db.info["organization_id"],
        )
        .values(revoked=True)
    )
    db.commit()


def revoke_all_staff_sessions(db: DBSession, staff_user_id: int) -> None:
    db.execute(
        update(Session)
        .where(
            Session.user_id == staff_user_id,
            Session.organization_id == db.info["organization_id"],
        )
        .values(revoked=True)
    )
    db.commit()


def authenticate_customer(
    db: DBSession,
    customer: User | None,
    password: str,
    request: Request,
) -> tuple[User, str]:
    if customer is None or not verify_password(password, customer.password):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
            details={"reason": "invalid_credentials"},
        )

    if customer.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    token = create_customer_session(
        db,
        customer.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()
    return customer, token


def authenticate_staff_user(
    db: DBSession,
    staff_user: User | None,
    password: str,
    request: Request,
) -> tuple[User, str]:
    if staff_user is None or not verify_password(password, staff_user.password):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
            details={"reason": "invalid_credentials"},
        )

    if staff_user.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    staff_user.role = normalize_user_role(staff_user.role)
    if not is_organization_staff_role(staff_user.role):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
            details={"reason": "invalid_credentials"},
        )

    token = create_staff_session(
        db,
        staff_user.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()
    return staff_user, token
