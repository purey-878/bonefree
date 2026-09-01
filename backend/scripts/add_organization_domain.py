"""Compatibility command for assigning a hostname to an organization.

Prefer ``python -m scripts.manage_organizations domain create`` for new use.

Examples:
    python scripts/add_organization_domain.py
    python scripts/add_organization_domain.py --organization-slug bonefree \
        --domain https://orders.bonefree.pt:443 --primary --verified
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
from modules.auth.services.organization_management import (
    add_organization_domain,
    check_database_ready as check_management_database_ready,
)


def check_database_ready(db) -> None:
    check_management_database_ready(db, "organization", "organization_domain")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Add a domain to an organization. For new use, prefer "
            "'python -m scripts.manage_organizations domain create'."
        )
    )
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
