from __future__ import annotations

import re
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session


_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def normalize_organization_slug(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized or not _SLUG_RE.fullmatch(normalized):
        raise ValueError(
            "Organization slug must contain only lowercase letters, numbers, and hyphens."
        )
    return normalized


def normalize_hostname(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError("Hostname is required.")

    parsed = urlparse(normalized if "://" in normalized else f"//{normalized}")
    hostname = parsed.hostname
    if hostname is None:
        raise ValueError("Hostname is invalid.")

    hostname = hostname.strip().lower().rstrip(".")
    if not hostname:
        raise ValueError("Hostname is required.")

    try:
        return hostname.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("Hostname is invalid.") from exc


def bind_session_to_organization(db: Session, slug: str) -> int:
    """Explicit administrative/bootstrap bypass that binds a session to one tenant."""
    from modules.auth.models import Organization

    normalized_slug = normalize_organization_slug(slug)
    organization_id = db.scalar(
        select(Organization.id)
        .where(Organization.slug == normalized_slug)
        .execution_options(skip_organization_scope=True)
    )
    if organization_id is None:
        raise ValueError(f"Organization slug '{normalized_slug}' was not found.")
    db.info["organization_id"] = organization_id
    return organization_id
