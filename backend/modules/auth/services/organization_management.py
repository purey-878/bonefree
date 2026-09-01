"""Shared organization and domain management operations."""

from __future__ import annotations

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session as DBSession

from core.organizations import normalize_hostname, normalize_organization_slug
from modules.auth.models import (
    Organization,
    OrganizationDomain,
    OrganizationExperience,
    OrganizationProfile,
    OrganizationType,
)
from utils.datetime_utils import naive_utc_now


def check_database_ready(db: DBSession, *table_names: str) -> None:
    existing_tables = set(inspect(db.bind).get_table_names())
    missing = set(table_names) - existing_tables
    if missing:
        raise RuntimeError(
            f"Database is not ready. Missing table(s): {', '.join(sorted(missing))}. "
            "Run migrations first."
        )


def normalize_email(value: str) -> str:
    try:
        result = validate_email(value.strip(), check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return result.normalized.lower()


def normalize_organization_type(value: str | OrganizationType) -> OrganizationType:
    if isinstance(value, OrganizationType):
        return value
    try:
        return OrganizationType(value.strip().lower())
    except ValueError as exc:
        valid = ", ".join(item.value for item in OrganizationType)
        raise ValueError(f"Invalid organization type. Expected one of: {valid}.") from exc


def create_organization(
    db: DBSession,
    *,
    name: str,
    slug: str,
    organization_type: OrganizationType,
    email: str,
    privacy_contact_email: str | None = None,
    phone: str | None = None,
    display_name: str | None = None,
    legal_name: str | None = None,
    tax_id: str | None = None,
    country: str = "Portugal",
    currency_code: str = "EUR",
) -> Organization:
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("Organization name is required.")
    normalized_slug = normalize_organization_slug(slug)
    normalized_email = normalize_email(email)
    normalized_privacy_email = normalize_email(privacy_contact_email or normalized_email)
    normalized_currency = currency_code.strip().upper()
    if len(normalized_currency) != 3 or not normalized_currency.isalpha():
        raise ValueError("Currency code must be a three-letter ISO code.")

    try:
        existing = db.scalar(
            select(Organization)
            .where(Organization.slug == normalized_slug)
            .execution_options(skip_organization_scope=True)
        )
        if existing is not None:
            raise ValueError(f"Organization slug '{normalized_slug}' already exists.")

        organization = Organization(
            name=normalized_name,
            slug=normalized_slug,
            organization_type=organization_type,
            email=normalized_email,
            phone=(phone or "").strip() or None,
        )
        db.add(organization)
        db.flush()
        db.info["organization_id"] = organization.id
        db.add(
            OrganizationProfile(
                display_name=(display_name or normalized_name).strip(),
                legal_name=(legal_name or "").strip() or None,
                tax_id=(tax_id or "").strip() or None,
                email=normalized_email,
                privacy_contact_email=normalized_privacy_email,
                phone=(phone or "").strip() or None,
                country=country.strip() or "Portugal",
                currency_code=normalized_currency,
            )
        )
        db.add(
            OrganizationExperience(
                schema_version=1,
                theme_key="base",
                token_overrides={},
                assets={},
                navigation=[],
                pages={},
                variant_overrides={},
            )
        )
        db.commit()
        db.refresh(organization)
        return organization
    except Exception:
        db.rollback()
        raise


def add_organization_domain(
    db: DBSession,
    *,
    organization_slug: str,
    domain: str,
    is_primary: bool = False,
    is_verified: bool = False,
) -> OrganizationDomain:
    normalized_slug = normalize_organization_slug(organization_slug)
    normalized_domain = normalize_hostname(domain)
    try:
        organization = db.scalar(
            select(Organization)
            .where(Organization.slug == normalized_slug)
            .execution_options(skip_organization_scope=True)
        )
        if organization is None:
            raise ValueError(f"Organization slug '{normalized_slug}' was not found.")

        existing = db.scalar(
            select(OrganizationDomain)
            .where(OrganizationDomain.domain == normalized_domain)
            .execution_options(skip_organization_scope=True)
        )
        if existing is not None:
            raise ValueError(
                f"Domain '{normalized_domain}' is already assigned to an organization."
            )

        db.info["organization_id"] = organization.id
        if is_primary:
            current_primary = db.scalar(
                select(OrganizationDomain).where(
                    OrganizationDomain.organization_id == organization.id,
                    OrganizationDomain.is_primary.is_(True),
                )
            )
            if current_primary is not None:
                current_primary.is_primary = False
                db.flush()

        organization_domain = OrganizationDomain(
            domain=normalized_domain,
            is_primary=is_primary,
            is_verified=is_verified,
        )
        db.add(organization_domain)
        db.commit()
        db.refresh(organization_domain)
        return organization_domain
    except Exception:
        db.rollback()
        raise


def get_organization_domain(db: DBSession, domain: str) -> OrganizationDomain:
    normalized_domain = normalize_hostname(domain)
    stored = db.scalar(
        select(OrganizationDomain)
        .where(OrganizationDomain.domain == normalized_domain)
        .execution_options(skip_organization_scope=True)
    )
    if stored is None:
        raise ValueError(f"Domain '{normalized_domain}' was not found.")
    db.info["organization_id"] = stored.organization_id
    return stored


def list_organization_domains(
    db: DBSession,
    *,
    organization_slug: str,
) -> tuple[Organization, list[OrganizationDomain]]:
    normalized_slug = normalize_organization_slug(organization_slug)
    organization = db.scalar(
        select(Organization)
        .where(Organization.slug == normalized_slug)
        .execution_options(skip_organization_scope=True)
    )
    if organization is None:
        raise ValueError(f"Organization '{normalized_slug}' was not found.")
    db.info["organization_id"] = organization.id
    domains = db.scalars(
        select(OrganizationDomain).order_by(
            OrganizationDomain.is_primary.desc(),
            OrganizationDomain.domain.asc(),
        )
    ).all()
    return organization, list(domains)


def update_organization_domain(
    db: DBSession,
    *,
    domain: str,
    is_verified: bool | None = None,
    is_primary: bool | None = None,
) -> OrganizationDomain:
    stored = get_organization_domain(db, domain)
    try:
        if is_verified is not None:
            stored.is_verified = is_verified
        if is_primary is not None:
            if is_primary:
                current_primaries = db.scalars(
                    select(OrganizationDomain).where(
                        OrganizationDomain.organization_id == stored.organization_id,
                        OrganizationDomain.id != stored.id,
                        OrganizationDomain.is_primary.is_(True),
                    )
                ).all()
                for current in current_primaries:
                    current.is_primary = False
                if current_primaries:
                    db.flush()
            stored.is_primary = is_primary
        db.commit()
        db.refresh(stored)
        return stored
    except Exception:
        db.rollback()
        raise


def set_organization_domain_active(
    db: DBSession,
    *,
    domain: str,
    active: bool,
) -> OrganizationDomain:
    stored = get_organization_domain(db, domain)
    try:
        stored.deactivated_at = None if active else naive_utc_now()
        db.commit()
        db.refresh(stored)
        return stored
    except Exception:
        db.rollback()
        raise
