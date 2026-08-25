"""Create an organization and its basic profile atomically.

Examples:
    python scripts/create_organization.py
    python scripts/create_organization.py --name "Second Restaurant" --slug second-restaurant \
        --email hello@example.com --legal-name "Second Restaurant, Lda."
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.organizations import normalize_organization_slug
from database import SessionLocal
from models import Organization, OrganizationExperience, OrganizationProfile
from schemas.enums import OrganizationType


def check_database_ready(db: DBSession) -> None:
    table_names = set(inspect(db.bind).get_table_names())
    missing = {
        "organization",
        "organization_profile",
        "organization_experience",
    } - table_names
    if missing:
        raise RuntimeError(
            f"Database is not ready. Missing table(s): {', '.join(sorted(missing))}. Run migrations first."
        )


def normalize_email(value: str) -> str:
    try:
        result = validate_email(value.strip(), check_deliverability=False)
    except EmailNotValidError as exc:
        raise ValueError(str(exc)) from exc
    return result.normalized.lower()


def normalize_organization_type(value: str) -> OrganizationType:
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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create an organization and basic profile.")
    parser.add_argument("--name")
    parser.add_argument("--slug")
    parser.add_argument("--organization-type", default=OrganizationType.RESTAURANT.value)
    parser.add_argument("--email")
    parser.add_argument("--phone")
    parser.add_argument("--display-name")
    parser.add_argument("--legal-name")
    parser.add_argument("--tax-id")
    parser.add_argument("--country", default="Portugal")
    parser.add_argument("--currency-code", default="EUR")
    return parser.parse_args(argv)


def prompt_missing_args(args: argparse.Namespace) -> argparse.Namespace:
    args.name = args.name or input("Organization name: ").strip()
    args.slug = args.slug or input("Organization slug: ").strip()
    args.email = args.email or input("Organization email: ").strip()
    if args.phone is None:
        args.phone = input("Organization phone (optional): ").strip()
    return args


def main(argv: list[str] | None = None) -> int:
    args = prompt_missing_args(parse_args(argv))
    try:
        with SessionLocal() as db:
            check_database_ready(db)
            organization = create_organization(
                db,
                name=args.name,
                slug=args.slug,
                organization_type=normalize_organization_type(args.organization_type),
                email=args.email,
                phone=args.phone,
                display_name=args.display_name,
                legal_name=args.legal_name,
                tax_id=args.tax_id,
                country=args.country,
                currency_code=args.currency_code,
            )
    except (ValueError, RuntimeError, IntegrityError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(f"Created organization '{organization.name}' with slug '{organization.slug}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
