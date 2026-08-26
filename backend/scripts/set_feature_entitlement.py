"""Enable or disable one backend feature entitlement for an organization.

Examples:
    python scripts/set_feature_entitlement.py --organization bonefree --feature reviews --enable
    python scripts/set_feature_entitlement.py --organization bonefree --feature reviews --disable --dry-run
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import sys
from typing import cast

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session as DBSession


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.organizations import bind_session_to_organization
from database import SessionLocal
from modules.auth.models import FeatureEntitlementConfigurationData
from models import OrganizationFeatureEntitlement


FEATURE_KEY_PATTERN = re.compile(r"^[a-z0-9]+(?:_[a-z0-9]+)*$")


def normalize_feature_key(value: str) -> str:
    normalized = value.strip().lower()
    if FEATURE_KEY_PATTERN.fullmatch(normalized) is None:
        raise ValueError("Feature key must be lower snake case.")
    return normalized


def set_feature_entitlement(
    db: DBSession,
    *,
    organization_slug: str,
    feature_key: str,
    enabled: bool,
    configuration: FeatureEntitlementConfigurationData | None = None,
) -> OrganizationFeatureEntitlement:
    bind_session_to_organization(db, organization_slug)
    normalized_feature_key = normalize_feature_key(feature_key)
    entitlement = db.scalar(
        select(OrganizationFeatureEntitlement).where(
            OrganizationFeatureEntitlement.feature_key == normalized_feature_key
        )
    )
    if entitlement is None:
        entitlement = OrganizationFeatureEntitlement(feature_key=normalized_feature_key)
        db.add(entitlement)
    entitlement.enabled = enabled
    entitlement.configuration = configuration
    return entitlement


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Set an organization feature entitlement.")
    parser.add_argument("--organization", required=True)
    parser.add_argument("--feature", required=True)
    state = parser.add_mutually_exclusive_group(required=True)
    state.add_argument("--enable", action="store_true")
    state.add_argument("--disable", action="store_true")
    parser.add_argument("--configuration", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        normalized_feature_key = normalize_feature_key(args.feature)
        raw_configuration = (
            json.loads(args.configuration.read_text(encoding="utf-8"))
            if args.configuration
            else None
        )
        if raw_configuration is not None and not isinstance(raw_configuration, dict):
            raise ValueError("Feature configuration must be a JSON object.")
        configuration = cast(
            FeatureEntitlementConfigurationData | None,
            raw_configuration,
        )
        with SessionLocal() as db:
            missing = {"organization", "organization_feature_entitlement"} - set(
                inspect(db.get_bind()).get_table_names()
            )
            if missing:
                raise RuntimeError(
                    f"Database is not ready. Missing table(s): {', '.join(sorted(missing))}."
                )
            entitlement = set_feature_entitlement(
                db,
                organization_slug=args.organization,
                feature_key=normalized_feature_key,
                enabled=args.enable,
                configuration=configuration,
            )
            db.flush()
            if args.dry_run:
                db.rollback()
            else:
                db.commit()
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    action = "Validated" if args.dry_run else "Updated"
    state = "enabled" if args.enable else "disabled"
    print(
        f"{action} feature '{normalized_feature_key}' as {state} "
        f"for organization '{args.organization}'."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
