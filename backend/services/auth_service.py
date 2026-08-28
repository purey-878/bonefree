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
from schemas.enums import UserRole, UserStatus, is_admin_role, normalize_user_role
from models import Admin, Customer, Session
from utils.datetime_utils import to_naive_utc

STAFF_ADMIN_ROLE = UserRole.MANAGER
SUPER_ADMIN_ROLE = UserRole.OWNER
CHEF_ROLE = UserRole.CHEF
WAITER_ROLE = UserRole.WAITER


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
        customer_id=customer_id,
        token_hash=hash_session_token(token),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=to_naive_utc(expires_at),
    )
    db.add(session)
    return token


def create_admin_session(
    db: DBSession,
    admin_id: int,
    ip_address: str | None,
    user_agent: str | None,
) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.admin_session_expiration_minutes)
    session = Session(
        admin_id=admin_id,
        token_hash=hash_session_token(token),
        ip_address=ip_address,
        user_agent=user_agent,
        expires_at=to_naive_utc(expires_at),
    )
    db.add(session)
    return token


def revoke_all_customer_sessions(db: DBSession, customer_id: int) -> None:
    db.execute(update(Session).where(Session.customer_id == customer_id).values(revoked=True))
    db.commit()


def revoke_all_admin_sessions(db: DBSession, admin_id: int) -> None:
    db.execute(update(Session).where(Session.admin_id == admin_id).values(revoked=True))
    db.commit()


def authenticate_customer(
    db: DBSession,
    customer: Customer | None,
    password: str,
    request: Request,
) -> tuple[Customer, str]:
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


def authenticate_admin(
    db: DBSession,
    admin: Admin | None,
    password: str,
    request: Request,
) -> tuple[Admin, str]:
    if admin is None or not verify_password(password, admin.password):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
            details={"reason": "invalid_credentials"},
        )

    if admin.status != UserStatus.ACTIVE:
        raise AppHTTPException(status_code=status.HTTP_403_FORBIDDEN, error="permission_denied", message="Permission denied.", details={"reason": "request_failed"})

    admin.role = normalize_user_role(admin.role)
    if not is_admin_role(admin.role):
        raise AppHTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            error="invalid_credentials",
            message="Invalid email or password.",
            details={"reason": "invalid_credentials"},
        )

    token = create_admin_session(
        db,
        admin.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()
    return admin, token
