"""Create or complete the Bonefree profile and legal documents, preserving edits."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from core.config import settings
from database import SessionLocal, engine
from modules.auth.models import Organization, OrganizationExperience, OrganizationProfile
from modules.auth.schemas.legal_documents import LegalDocumentResponse
from modules.auth.services.legal_documents import FIXTURE_ROOT, add_missing_documents
from modules.auth.services.organization_management import normalize_email


def load_bonefree_fixture() -> dict:
    fixture = json.loads((FIXTURE_ROOT / "bonefree_v1.json").read_text(encoding="utf-8"))
    if fixture["format_version"] != 1 or fixture["organization"]["slug"] != "bonefree":
        raise ValueError("Invalid Bonefree organisation fixture.")
    normalize_email(fixture["organization"]["email"])
    normalize_email(fixture["profile"]["privacy_contact_email"])
    keys = set()
    for document in fixture["documents"]:
        LegalDocumentResponse.model_validate(document)
        keys.add((document["document_type"], document["locale"]))
    if len(keys) != 6 or len(fixture["documents"]) != 6:
        raise ValueError("Bonefree requires six distinct legal documents.")
    return fixture


def check_production_organization(db: Session) -> dict:
    fixture = load_bonefree_fixture()
    organization = db.scalar(select(Organization).where(Organization.slug == "bonefree").execution_options(skip_organization_scope=True))
    if organization is not None and organization.purged_at is not None:
        raise ValueError("The Bonefree organisation was purged and cannot be seeded.")
    return {"organization": "bonefree", "action": "complete_missing" if organization else "create", "documents": len(fixture["documents"])}


def apply_production_organization(db: Session) -> dict:
    try:
        if db.bind.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext('bonefree-production-organization'))"))
        summary = check_production_organization(db)
        fixture = load_bonefree_fixture()
        organization = db.scalar(select(Organization).where(Organization.slug == "bonefree").execution_options(skip_organization_scope=True).with_for_update())
        if organization is None:
            organization = Organization(**fixture["organization"])
            db.add(organization)
            db.flush()
        else:
            for key, value in fixture["organization"].items():
                if getattr(organization, key) in (None, ""):
                    setattr(organization, key, value)
        db.info["organization_id"] = organization.id
        profile = db.scalar(select(OrganizationProfile))
        if profile is None:
            profile = OrganizationProfile()
            db.add(profile)
        for key, value in fixture["profile"].items():
            if getattr(profile, key) in (None, "", {}):
                if key in {"email", "privacy_contact_email"}:
                    value = (profile.email or organization.email) if key == "privacy_contact_email" else organization.email
                setattr(profile, key, value)
        if db.scalar(select(OrganizationExperience)) is None:
            db.add(OrganizationExperience(schema_version=1, theme_key="base", token_overrides={}, assets={}, navigation=[], pages={}, variant_overrides={}))
        add_missing_documents(db, fixture["documents"])
        db.commit()
        return summary
    except Exception:
        db.rollback()
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if settings.environment != "production" or engine.dialect.name != "postgresql":
        raise SystemExit("Error: this command requires production PostgreSQL.")
    with SessionLocal() as db:
        try:
            print(apply_production_organization(db) if args.apply else check_production_organization(db))
        except ValueError as exc:
            raise SystemExit(f"Error: {exc}") from exc


if __name__ == "__main__":
    main()
