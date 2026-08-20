"""Backward-compatible imports for authentication transactional emails.

Use services.email_service for new code.
"""

from services.email_service import send_password_reset_email, send_welcome_email
from core.email_provider import validate_email_config

__all__ = [
    "send_password_reset_email",
    "send_welcome_email",
    "validate_email_config",
]