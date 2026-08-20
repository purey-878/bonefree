"""Password reset OTP helpers."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any


OTP_TTL_MINUTES = 10
RESET_TOKEN_TTL_MINUTES = 15
MAX_OTP_ATTEMPTS = 5


def generate_otp() -> str:
    """Return a six-digit one-time password."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def verify_secret(secret: str, secret_hash: str | None) -> bool:
    if not secret_hash:
        return False
    return hmac.compare_digest(hash_secret(secret), secret_hash)


def start_password_reset(user: Any, now: datetime | None = None) -> str:
    """Create and store a fresh OTP challenge on a user object."""
    current_time = now or datetime.utcnow()
    code = generate_otp()
    user.password_reset_code_hash = hash_secret(code)
    user.password_reset_expires_at = current_time + timedelta(minutes=OTP_TTL_MINUTES)
    user.password_reset_attempts = 0
    user.password_reset_verified_until = None
    user.password_reset_token_hash = None
    return code


def verify_password_reset_code(user: Any, code: str, now: datetime | None = None) -> tuple[bool, str, str | None]:
    """Validate an OTP and return a reset token if successful."""
    current_time = now or datetime.utcnow()

    if not user.password_reset_code_hash or not user.password_reset_expires_at:
        return False, "No password reset code has been requested.", None
    if user.password_reset_expires_at < current_time:
        clear_password_reset(user)
        return False, "The password reset code has expired. Request a new code.", None
    if (user.password_reset_attempts or 0) >= MAX_OTP_ATTEMPTS:
        clear_password_reset(user)
        return False, "Too many incorrect attempts. Request a new code.", None

    if not verify_secret(code, user.password_reset_code_hash):
        user.password_reset_attempts = (user.password_reset_attempts or 0) + 1
        return False, "Invalid password reset code.", None

    token = generate_reset_token()
    user.password_reset_verified_until = current_time + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)
    user.password_reset_token_hash = hash_secret(token)
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0
    return True, "Password reset code verified.", token


def can_reset_password(user: Any, token: str, now: datetime | None = None) -> tuple[bool, str]:
    current_time = now or datetime.utcnow()

    if not user.password_reset_token_hash or not user.password_reset_verified_until:
        return False, "The password reset code has not been verified yet."
    if user.password_reset_verified_until < current_time:
        clear_password_reset(user)
        return False, "The password reset session has expired. Request a new code."
    if not verify_secret(token, user.password_reset_token_hash):
        return False, "Invalid password reset session."

    return True, "Password reset authorized."


def clear_password_reset(user: Any) -> None:
    user.password_reset_code_hash = None
    user.password_reset_expires_at = None
    user.password_reset_attempts = 0
    user.password_reset_verified_until = None
    user.password_reset_token_hash = None
