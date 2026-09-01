"""Compatibility command for creating an organization and its basic profile.

Prefer ``python -m scripts.manage_organizations organization create`` for new use.

Examples:
    python scripts/create_organization.py
    python scripts/create_organization.py --name "Second Restaurant" --slug second-restaurant \
        --email hello@example.com --legal-name "Second Restaurant, Lda."
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy.exc import IntegrityError


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from modules.auth.models import OrganizationType
from modules.auth.services.organization_management import (
    check_database_ready as check_management_database_ready,
    create_organization,
    normalize_email,
    normalize_organization_type,
)


def check_database_ready(db) -> None:
    check_management_database_ready(
        db,
        "organization",
        "organization_profile",
        "organization_experience",
    )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create an organization and basic profile. For new use, prefer "
            "'python -m scripts.manage_organizations organization create'."
        )
    )
    parser.add_argument("--name")
    parser.add_argument("--slug")
    parser.add_argument("--organization-type", default=OrganizationType.RESTAURANT.value)
    parser.add_argument("--email")
    parser.add_argument("--phone")
    parser.add_argument("--privacy-contact-email")
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
                privacy_contact_email=args.privacy_contact_email,
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
