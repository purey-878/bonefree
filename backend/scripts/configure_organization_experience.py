"""Validate and apply an organization experience JSON document.

Example:
    python scripts/configure_organization_experience.py \
        --organization bonefree --file experience.json --dry-run
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session as DBSession


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from core.organizations import bind_session_to_organization
from database import SessionLocal
from models import OrganizationExperience
from schemas.organization import PublicExperienceConfiguration


class OrganizationExperienceDocument(BaseModel):
    schema_version: int = Field(ge=1)
    experience: PublicExperienceConfiguration


def load_document(path: Path) -> OrganizationExperienceDocument:
    payload: Any = json.loads(path.read_text(encoding="utf-8"))
    return OrganizationExperienceDocument.model_validate(payload)


def upsert_organization_experience(
    db: DBSession,
    *,
    organization_slug: str,
    document: OrganizationExperienceDocument,
) -> OrganizationExperience:
    bind_session_to_organization(db, organization_slug)
    stored = db.scalar(select(OrganizationExperience))
    if stored is None:
        stored = OrganizationExperience(
            schema_version=document.schema_version,
            theme_key=document.experience.theme.key,
        )
        db.add(stored)

    stored.schema_version = document.schema_version
    stored.theme_key = document.experience.theme.key
    stored.theme_mode = document.experience.theme.mode
    stored.decoration_preset = document.experience.theme.decoration_preset
    stored.token_overrides = document.experience.theme.token_overrides
    stored.assets = document.experience.assets
    stored.navigation = [item.model_dump() for item in document.experience.navigation]
    stored.pages = {
        key: page.model_dump()
        for key, page in document.experience.pages.items()
    }
    stored.variant_overrides = document.experience.variant_overrides
    return stored


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate and apply an organization experience.")
    parser.add_argument("--organization", required=True)
    parser.add_argument("--file", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        document = load_document(args.file)
        with SessionLocal() as db:
            missing = {"organization", "organization_experience"} - set(
                inspect(db.bind).get_table_names()
            )
            if missing:
                raise RuntimeError(
                    f"Database is not ready. Missing table(s): {', '.join(sorted(missing))}."
                )
            upsert_organization_experience(
                db,
                organization_slug=args.organization,
                document=document,
            )
            db.flush()
            if args.dry_run:
                db.rollback()
            else:
                db.commit()
    except (OSError, json.JSONDecodeError, ValidationError, ValueError, RuntimeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    action = "Validated" if args.dry_run else "Updated"
    print(f"{action} experience for organization '{args.organization}'.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
