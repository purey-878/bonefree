from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from core.base import Base
from core.config import settings
from database import get_db
from modules.auth.models import Organization, OrganizationLegalDocument, OrganizationProfile, OrganizationType, Session, User, UserRole
from modules.auth.services.authentication import hash_session_token
from modules.auth.services.legal_documents import load_legal_defaults
from modules.auth.services.organization_management import create_organization
from modules.auth.services.organization_lifecycle import build_purge_plan
from modules.restaurant.services.data_exports import _tenant_payloads
from scripts.seed_production_organization import apply_production_organization, check_production_organization, load_bonefree_fixture
from utils.datetime_utils import naive_utc_now


class LegalDocumentTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.rate_limit = patch.object(settings, "rate_limit_enabled", False)
        self.rate_limit.start()
        app = create_app(run_startup_tasks=False, public_assets_dir=Path(self.temp.name) / "assets", uploads_dir=Path(self.temp.name) / "uploads")

        def override_db():
            with self.sessions() as db:
                yield db
        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        self.ids = {}
        with self.sessions() as db:
            for slug in ("first", "second"):
                organization = create_organization(db, name=slug.title(), slug=slug, organization_type=OrganizationType.RESTAURANT, email=f"{slug}@example.com")
                self.ids[slug] = organization.id
                for role in UserRole:
                    user = User(name=role.value, email=f"{role.value}@example.com", password="unused", role=role)
                    db.add(user)
                    db.flush()
                    db.add(Session(user_id=user.id, token_hash=hash_session_token(f"{slug}-{role.value}"), expires_at=naive_utc_now() + timedelta(hours=2)))
                    db.commit()
        self.body = {key: value for key, value in load_legal_defaults()[0].items() if key not in {"document_type", "locale"}}

    def tearDown(self):
        self.client.close()
        self.rate_limit.stop()
        self.engine.dispose()
        self.temp.cleanup()

    def headers(self, slug="first", role="owner"):
        return {"X-Organization-Slug": slug, "Authorization": f"Bearer {slug}-{role}"}

    def test_creation_defaults_and_english_fallback(self):
        response = self.client.get("/admin/legal-documents", headers=self.headers())
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([(item["document_type"], item["locale"]) for item in response.json()["items"]], [("privacy_policy", "en-GB"), ("terms_conditions", "en-GB")])
        for kind in ("privacy_policy", "terms_conditions"):
            response = self.client.get(f"/public/legal-documents/{kind}?locale=de-DE", headers={"X-Organization-Slug": "first"})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertTrue(response.json()["is_fallback"])
            self.assertEqual(response.json()["document"]["locale"], "en-GB")
            self.assertEqual(response.json()["organization_contact"], "first@example.com")
            self.assertEqual(response.headers["cache-control"], "no-store")

    def test_only_owners_can_read_and_publish_and_tenants_cannot_cross(self):
        for role in ("manager", "waiter", "chef", "client"):
            self.assertIn(self.client.get("/admin/legal-documents", headers=self.headers(role=role)).status_code, (401, 403))
            self.assertIn(self.client.put("/admin/legal-documents/privacy_policy/en-GB", json=self.body, headers=self.headers(role=role)).status_code, (401, 403))
        self.assertEqual(self.client.get("/admin/legal-documents", headers={"X-Organization-Slug": "first"}).status_code, 401)
        self.assertIn(self.client.get("/admin/legal-documents", headers={"X-Organization-Slug": "second", "Authorization": "Bearer first-owner"}).status_code, (401, 403))
        self.assertEqual(self.client.get("/public/legal-documents/privacy_policy").status_code, 400)

    def test_six_versions_publish_independently_and_contact_stays_dynamic(self):
        for kind in ("privacy_policy", "terms_conditions"):
            for locale in ("pt-PT", "en-GB", "de-DE"):
                title = f"{kind} {locale}"
                response = self.client.put(f"/admin/legal-documents/{kind}/{locale}", headers=self.headers(), json={**self.body, "title": title})
                self.assertEqual(response.status_code, 200, response.text)
        with self.sessions() as db:
            db.info["organization_id"] = self.ids["first"]
            profile = db.scalar(select(OrganizationProfile))
            profile.privacy_contact_email = "privacy@example.com"
            db.commit()
        for kind in ("privacy_policy", "terms_conditions"):
            for locale in ("pt-PT", "en-GB", "de-DE"):
                result = self.client.get(f"/public/legal-documents/{kind}?locale={locale}", headers=self.headers()).json()
                self.assertFalse(result["is_fallback"])
                self.assertEqual(result["document"]["title"], f"{kind} {locale}")
                self.assertEqual(result["organization_contact"], "privacy@example.com")
        other = self.client.get("/admin/legal-documents", headers=self.headers("second")).json()
        self.assertEqual(len(other["items"]), 2)
        self.assertEqual(other["organization_contact"], "second@example.com")

    def test_invalid_documents_and_links_do_not_replace_published_content(self):
        cases = [{**self.body, "title": "   "}, {**self.body, "body": {"type": "doc", "content": [{"type": "paragraph"}]}}]
        for href in ("javascript:alert(1)", "data:text/html,bad", "//example.com", "https:\\evil.com", "https://example.com\n"):
            body = deepcopy(self.body)
            body["body"] = {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Click", "marks": [{"type": "link", "attrs": {"href": href}}]}]}]}
            cases.append(body)
        cases.append({**self.body, "body": {"type": "doc", "content": [{"type": "script", "text": "alert(1)"}]}})
        for body in cases:
            response = self.client.put("/admin/legal-documents/privacy_policy/en-GB", headers=self.headers(), json=body)
            self.assertEqual(response.status_code, 422, response.text)
        result = self.client.get("/public/legal-documents/privacy_policy", headers=self.headers()).json()
        self.assertEqual(result["document"]["title"], self.body["title"])
        self.assertEqual(self.client.put("/admin/legal-documents/privacy_policy/fr-FR", headers=self.headers(), json=self.body).status_code, 422)

    def test_contact_falls_back_and_documents_are_in_export_and_purge(self):
        with self.sessions() as db:
            db.info["organization_id"] = self.ids["first"]
            profile = db.scalar(select(OrganizationProfile))
            profile.privacy_contact_email = None
            profile.email = "company@example.com"
            db.commit()
            payload = _tenant_payloads(db, self.ids["first"])
            self.assertEqual(len(payload["organization_legal_document"]), 2)
            organization = db.scalar(select(Organization).where(Organization.id == self.ids["first"]))
            plan = build_purge_plan(db, organization)
            self.assertEqual(plan.operational_rows["organization_legal_document"], 2)
        result = self.client.get("/public/legal-documents/terms_conditions", headers=self.headers()).json()
        self.assertEqual(result["organization_contact"], "company@example.com")

    def test_bonefree_seed_preserves_edits_and_never_revives_purged_organizations(self):
        with self.sessions() as db:
            summary = check_production_organization(db)
            self.assertEqual(summary["action"], "create")
            self.assertIsNone(db.scalar(select(Organization).where(Organization.slug == "bonefree")))
            apply_production_organization(db)
            documents = db.scalars(select(OrganizationLegalDocument)).all()
            self.assertEqual(len(documents), 6)
            fixture = load_bonefree_fixture()
            self.assertEqual({(d.document_type, d.locale): d.title for d in documents}, {(d["document_type"], d["locale"]): d["title"] for d in fixture["documents"]})
            self.assertTrue(all(d.updated_at == datetime(2026, 8, 29) for d in documents))
            profile = db.scalar(select(OrganizationProfile))
            self.assertEqual(profile.email, "carambolarubra@gmail.com")
            profile.privacy_contact_email = "changed@example.com"
            documents[0].title = "Owner edition"
            db.commit()
            apply_production_organization(db)
            self.assertEqual(documents[0].title, "Owner edition")
            self.assertEqual(profile.privacy_contact_email, "changed@example.com")
            self.assertEqual(db.scalar(select(func.count()).select_from(OrganizationLegalDocument)), 6)
            organization = db.scalar(select(Organization).where(Organization.slug == "bonefree"))
            organization.purged_at = naive_utc_now()
            db.commit()
            with self.assertRaisesRegex(ValueError, "purged"):
                apply_production_organization(db)

    def test_migration_backfills_and_preserves_existing_documents(self):
        with self.sessions() as db:
            db.info["organization_id"] = self.ids["first"]
            documents = db.scalars(select(OrganizationLegalDocument).order_by(OrganizationLegalDocument.id)).all()
            documents[0].title = "Preserved custom policy"
            db.delete(documents[1])
            db.add(Organization(name="Bonefree", slug="bonefree", email="bonefree@example.com"))
            db.add(Organization(name="Purged", slug="purged", email="purged@example.com", purged_at=naive_utc_now()))
            db.commit()
        path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "20260907_0007_organization_legal_documents.py"
        spec = importlib.util.spec_from_file_location("legal_migration", path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with self.engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with patch.object(migration, "op", Operations(context)):
                migration.upgrade()
                migration.upgrade()
        with self.sessions() as db:
            db.info["organization_id"] = self.ids["first"]
            self.assertEqual(db.scalar(select(func.count()).select_from(OrganizationLegalDocument)), 2)
            self.assertEqual(db.scalar(select(OrganizationLegalDocument.title).where(OrganizationLegalDocument.document_type == "privacy_policy")), "Preserved custom policy")
            bonefree = db.scalar(select(Organization).where(Organization.slug == "bonefree"))
            db.info["organization_id"] = bonefree.id
            self.assertEqual(db.scalar(select(func.count()).select_from(OrganizationLegalDocument)), 6)
            purged = db.scalar(select(Organization).where(Organization.slug == "purged"))
            db.info["organization_id"] = purged.id
            self.assertEqual(db.scalar(select(func.count()).select_from(OrganizationLegalDocument)), 0)


if __name__ == "__main__":
    unittest.main()
