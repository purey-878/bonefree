from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy import update
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from enums import UserRole, UserStatus, is_admin_role, normalize_user_role
from models import Admin, Customer, Session
from utils.datetime_utils import to_naive_utc

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

STAFF_ADMIN_ROLE = UserRole.MANAGER
SUPER_ADMIN_ROLE = UserRole.OWNER
CHEF_ROLE = UserRole.CHEF


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def _verify_pbkdf2_password(password: str, encoded_password: str) -> bool:
    salt, stored_hash = encoded_password.split("$", maxsplit=1)
    candidate_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100_000,
    ).hex()
    return hmac.compare_digest(candidate_hash, stored_hash)


def verify_password(password: str, encoded_password: str) -> bool:
    if "$" in encoded_password and not encoded_password.startswith("$2"):
        try:
            return _verify_pbkdf2_password(password, encoded_password)
        except ValueError:
            return False

    return pwd_context.verify(password, encoded_password)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def get_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip

    if request.client:
        return request.client.host

    return None


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou palavra-passe inválido.")

    if customer.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de customer está inativa.")

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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou palavra-passe inválido.")

    if admin.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de administrador está inativa.")

    admin.role = normalize_user_role(admin.role)
    if not is_admin_role(admin.role):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou palavra-passe inválido.")

    token = create_admin_session(
        db,
        admin.id,
        get_client_ip(request),
        request.headers.get("user-agent"),
    )
    db.commit()
    return admin, token