"""Assign a globally unique hostname to an organization.

Examples:
    python scripts/add_organization_domain.py
    python scripts/add_organization_domain.py --organization-slug bonefree \
        --domain https://orders.bonefree.pt:443 --primary --verified
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.organizations import normalize_hostname, normalize_organization_slug
from database import SessionLocal
from models import Organization, OrganizationDomain


def check_database_ready(db: DBSession) -> None:
    table_names = set(inspect(db.bind).get_table_names())
    missing = {"organization", "organization_domain"} - table_names
    if missing:
        raise RuntimeError(
            f"Database is not ready. Missing table(s): {', '.join(sorted(missing))}. Run migrations first."
        )


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
            raise ValueError(f"Domain '{normalized_domain}' is already assigned to an organization.")

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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Add a domain to an organization.")
    parser.add_argument("--organization-slug")
    parser.add_argument("--domain")
    parser.add_argument("--primary", action="store_true")
    parser.add_argument("--verified", action="store_true")
    return parser.parse_args(argv)


def prompt_missing_args(args: argparse.Namespace) -> argparse.Namespace:
    args.organization_slug = args.organization_slug or input("Organization slug: ").strip()
    args.domain = args.domain or input("Domain or URL: ").strip()
    return args


def main(argv: list[str] | None = None) -> int:
    args = prompt_missing_args(parse_args(argv))
    try:
        with SessionLocal() as db:
            check_database_ready(db)
            organization_domain = add_organization_domain(
                db,
                organization_slug=args.organization_slug,
                domain=args.domain,
                is_primary=args.primary,
                is_verified=args.verified,
            )
    except (ValueError, RuntimeError, IntegrityError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    print(
        f"Added domain '{organization_domain.domain}' to organization "
        f"{organization_domain.organization_id}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
