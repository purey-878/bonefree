from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session as DBSession

from core.config import settings
from database import get_db
from models import Admin, AdminSession, Customer, Session
from services.auth_service import hash_session_token, normalize_admin_role
from utils.datetime_utils import to_naive_utc


def _extract_session_token(
    x_session_token: str | None,
    authorization: str | None,
) -> str | None:
    if x_session_token:
        return x_session_token

    if authorization:
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() == "bearer" and token:
            return token

    return None


def _current_naive_utc() -> datetime:
    return to_naive_utc(datetime.now(UTC)) or datetime.utcnow()


def get_current_user(
    x_session_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
) -> Customer:
    token = _extract_session_token(x_session_token, authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticação necessária.")

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.customer is None
        or session.revoked is True
        or session.expires_at <= now
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")

    current_user = session.customer
    if current_user.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de customer está inativa.")

    return current_user


def get_current_user_optional(
    x_session_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
) -> Customer | None:
    token = _extract_session_token(x_session_token, authorization)
    if token is None:
        return None

    session = db.scalars(select(Session).where(Session.token_hash == hash_session_token(token))).first()
    now = _current_naive_utc()

    if (
        session is None
        or session.customer is None
        or session.revoked is True
        or session.expires_at <= now
        or session.customer.status == 0
    ):
        return None

    return session.customer


def get_current_admin(
    x_session_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
    db: DBSession = Depends(get_db),
) -> Admin:
    token = _extract_session_token(x_session_token, authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Autenticação necessária.")

    session = db.scalars(select(AdminSession).where(AdminSession.token_hash == hash_session_token(token))).first()
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão inválida ou expirada.")

    current_admin = session.admin
    if current_admin.status == 0:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A conta de administrador está inativa.")

    current_admin.role = normalize_admin_role(current_admin.role)

    if session.last_seen_at is None or (now - session.last_seen_at).total_seconds() > 60:
        session.last_seen_at = now
        db.commit()

    return current_admin


def require_role(*allowed_roles: str) -> Callable:
    normalized_allowed_roles = tuple(normalize_admin_role(role) for role in allowed_roles)

    def role_checker(current_admin: Admin = Depends(get_current_admin)) -> Admin:
        current_admin.role = normalize_admin_role(current_admin.role)
        if current_admin.role not in normalized_allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Não tem permissão para executar esta ação.",
            )
        return current_admin

    return role_checker