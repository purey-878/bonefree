"""Organisation legal content; callers own transaction boundaries."""
import json
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from modules.auth.models import Organization, OrganizationLegalDocument, OrganizationProfile
from modules.auth.schemas.legal_documents import LegalDocumentWrite

FIXTURE_ROOT = Path(__file__).resolve().parents[3] / "seeds" / "organizations"


def load_legal_defaults() -> list[dict]:
    return json.loads((FIXTURE_ROOT / "legal_defaults_v1.json").read_text(encoding="utf-8"))


def add_missing_documents(db: Session, documents: list[dict]) -> None:
    existing = set(db.execute(select(OrganizationLegalDocument.document_type, OrganizationLegalDocument.locale)).all())
    for source in documents:
        key = (source["document_type"], source["locale"])
        if key in existing:
            continue
        content = LegalDocumentWrite.model_validate({key: value for key, value in source.items() if key not in {"document_type", "locale", "updated_at"}})
        values = content.model_dump(exclude_none=True, by_alias=True)
        if source.get("updated_at"):
            values["updated_at"] = datetime.fromisoformat(source["updated_at"])
        db.add(OrganizationLegalDocument(document_type=key[0], locale=key[1], **values))
        existing.add(key)


def organization_variables(db: Session) -> dict[str, str]:
    organization = db.scalar(select(Organization).where(Organization.id == db.info["organization_id"]))
    profile = db.scalar(select(OrganizationProfile))
    return {
        "organization_name": (profile.display_name if profile else None) or organization.name,
        "organization_contact": (profile.privacy_contact_email or profile.email if profile else None) or organization.email,
    }
