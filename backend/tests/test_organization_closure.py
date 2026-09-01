from __future__ import annotations

import tempfile
import unittest
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from core.base import Base
from core.config import settings
from database import get_db
from modules.auth.models import DataExport, Organization, OrganizationDomain, Session, User, UserRole
from modules.auth.services.authentication import hash_password, hash_session_token
from modules.auth.services.organization_lifecycle import (
    OrganizationAccessState,
    build_purge_plan,
    cancel_organization_access,
    hosting_plan_rows,
    organization_access_state,
    restore_organization_access,
    send_due_access_notifications,
)
from modules.restaurant.services.data_exports import process_data_export


class OrganizationClosureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.original_exports_dir = settings.data_exports_dir
        self.original_environment = settings.environment
        self.original_rate_limit = settings.rate_limit_enabled
        self.original_notice_days = settings.cancellation_notice_days
        settings.data_exports_dir = Path(self.temporary_directory.name) / "exports"
        settings.environment = "test"
        settings.rate_limit_enabled = False
        settings.cancellation_notice_days = 30

        app = create_app(
            run_startup_tasks=False,
            public_assets_dir=Path(self.temporary_directory.name) / "assets",
            uploads_dir=Path(self.temporary_directory.name) / "uploads",
        )
        self.app = app

        def override_db():
            with self.SessionLocal() as db:
                yield db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        now = datetime.now(UTC).replace(tzinfo=None)

        with self.SessionLocal() as db:
            active = Organization(
                name="Active Restaurant",
                slug="active",
                email="owner@active.example",
                access_expires_at=now + timedelta(days=10),
            )
            expired = Organization(
                name="Expired Restaurant",
                slug="expired",
                email="owner@expired.example",
                access_expires_at=now - timedelta(seconds=1),
            )
            db.add_all([active, expired])
            db.flush()

            for organization, hostname in (
                (active, "active.example"),
                (expired, "expired.example"),
            ):
                db.info["organization_id"] = organization.id
                db.add(
                    OrganizationDomain(
                        organization_id=organization.id,
                        domain=hostname,
                        is_primary=True,
                        is_verified=True,
                    )
                )
                db.add(
                    User(
                        organization_id=organization.id,
                        name="Owner",
                        email=organization.email,
                        password=hash_password("owner-password"),
                        role=UserRole.OWNER,
                    )
                )
                db.flush()
            db.info["organization_id"] = active.id
            db.add(
                User(
                    organization_id=active.id,
                    name="Customer",
                    email="customer@active.example",
                    password=hash_password("customer-password"),
                    role=UserRole.CLIENT,
                )
            )
            db.flush()
            db.info["organization_id"] = expired.id
            db.add(
                User(
                    organization_id=expired.id,
                    name="Customer",
                    email="customer@expired.example",
                    password=hash_password("customer-password"),
                    role=UserRole.CLIENT,
                )
            )
            db.commit()
            self.active_id = active.id
            self.expired_id = expired.id

    def tearDown(self) -> None:
        self.client.close()
        self.engine.dispose()
        self.temporary_directory.cleanup()
        settings.data_exports_dir = self.original_exports_dir
        settings.environment = self.original_environment
        settings.rate_limit_enabled = self.original_rate_limit
        settings.cancellation_notice_days = self.original_notice_days

    def _owner_headers(self, organization_id: int, slug: str, token: str) -> dict[str, str]:
        with self.SessionLocal() as db:
            db.info["organization_id"] = organization_id
            owner = db.scalar(select(User).where(User.role == UserRole.OWNER))
            self.assertIsNotNone(owner)
            db.add(
                Session(
                    organization_id=organization_id,
                    user_id=owner.id,
                    token_hash=hash_session_token(token),
                    expires_at=datetime.now(UTC).replace(tzinfo=None) + timedelta(hours=1),
                )
            )
            db.commit()
        return {
            "Authorization": f"Bearer {token}",
            "X-Organization-Slug": slug,
        }

    def test_resolution_returns_only_operational_organizations(self) -> None:
        active = self.client.get("/public/organizations/resolve", params={"hostname": "active.example"})
        expired = self.client.get(
            "/public/organizations/resolve", params={"hostname": "expired.example"}
        )

        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.json(), {"slug": "active", "name": "Active Restaurant"})
        self.assertEqual(expired.status_code, 404)
        self.assertEqual(expired.json()["error"], "organization_not_found")

    def test_expired_organization_is_blocked_without_worker(self) -> None:
        requests = (
            self.client.post(
                "/admin/login",
                headers={"X-Organization-Slug": "expired"},
                json={"email": "owner@expired.example", "password": "owner-password"},
            ),
            self.client.post(
                "/login",
                headers={"X-Organization-Slug": "expired"},
                json={"email": "customer@expired.example", "password": "customer-password"},
            ),
            self.client.get("/products", headers={"X-Organization-Slug": "expired"}),
            self.client.get("/site-settings/theme", headers={"X-Organization-Slug": "expired"}),
        )

        for response in requests:
            with self.subTest(path=response.request.url.path):
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()["error"], "organization_not_found")

    def test_session_created_before_expiry_cannot_use_admin_api(self) -> None:
        headers = self._owner_headers(self.expired_id, "expired", "expired-owner-token")
        response = self.client.get("/admin/data-privacy", headers=headers)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "organization_not_found")

    def test_data_access_routes_are_not_registered(self) -> None:
        self.assertFalse(
            any(path.startswith("/data-access") for path in self.app.openapi()["paths"])
        )

    def test_active_owner_can_export_and_daily_selection_rules_still_apply(self) -> None:
        headers = self._owner_headers(self.active_id, "active", "active-export-token")
        with self.SessionLocal() as db:
            db.info["organization_id"] = self.active_id
            customer_id = db.scalar(select(User.id).where(User.role == UserRole.CLIENT))
        self.assertIsNotNone(customer_id)

        first_customer = self.client.post(
            f"/admin/customers/{customer_id}/data-export", headers=headers
        )
        repeated_customer = self.client.post(
            f"/admin/customers/{customer_id}/data-export", headers=headers
        )
        customers_copy = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "customers"}
        )
        repeated_customers_copy = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "customers"}
        )
        full_copy = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "tenant"}
        )
        catalog_copy = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "catalog"}
        )

        self.assertEqual(first_customer.status_code, 202)
        self.assertEqual(first_customer.json()["export_id"], repeated_customer.json()["export_id"])
        self.assertEqual(customers_copy.status_code, 202)
        self.assertEqual(
            customers_copy.json()["export_id"], repeated_customers_copy.json()["export_id"]
        )
        self.assertEqual(full_copy.status_code, 409)
        self.assertEqual(full_copy.json()["error"], "data_export_daily_limit")
        self.assertEqual(catalog_copy.status_code, 202)

    def test_owner_can_cancel_queued_copy_and_delete_ready_private_file(self) -> None:
        headers = self._owner_headers(self.active_id, "active", "active-cancel-token")
        queued = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "catalog"}
        )
        cancelled = self.client.delete(
            f"/admin/data-exports/{queued.json()['export_id']}", headers=headers
        )
        repeated = self.client.post(
            "/admin/data-exports", headers=headers, json={"kind": "catalog"}
        )
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(repeated.status_code, 409)

        with self.SessionLocal() as db:
            db.info["organization_id"] = self.active_id
            customer_id = db.scalar(select(User.id).where(User.role == UserRole.CLIENT))
        ready_request = self.client.post(
            f"/admin/customers/{customer_id}/data-export", headers=headers
        )
        with self.SessionLocal() as db:
            db.info["organization_id"] = self.active_id
            export = db.scalar(
                select(DataExport).where(DataExport.public_id == ready_request.json()["export_id"])
            )
            self.assertIsNotNone(export)
            process_data_export(db, export)
            private_path = Path(export.storage_path)
            self.assertTrue(private_path.is_file())

        deleted = self.client.delete(
            f"/admin/data-exports/{ready_request.json()['export_id']}", headers=headers
        )
        unavailable = self.client.get(
            f"/admin/data-exports/{ready_request.json()['export_id']}/download", headers=headers
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["status"], "cancelled")
        self.assertFalse(private_path.exists())
        self.assertEqual(unavailable.status_code, 410)

    def test_cancel_is_idempotent_and_uses_configured_notice_period(self) -> None:
        first_moment = datetime(2026, 9, 1, 12, 0, 0)
        later_moment = first_moment + timedelta(days=2)
        with self.SessionLocal() as db:
            organization = Organization(name="New", slug="new", email="new@example.com")
            db.add(organization)
            db.commit()
            with patch(
                "modules.auth.services.organization_lifecycle.send_organization_access_notice",
                return_value=True,
            ):
                first = cancel_organization_access(db, organization, now=first_moment)
                repeated = cancel_organization_access(db, organization, now=later_moment)
            self.assertEqual(first, first_moment + timedelta(days=30))
            self.assertEqual(repeated, first)

    def test_restore_is_allowed_only_before_expiry(self) -> None:
        moment = datetime(2026, 9, 1, 12, 0, 0)
        with self.SessionLocal() as db:
            active = db.scalar(
                select(Organization)
                .where(Organization.id == self.active_id)
                .execution_options(skip_organization_scope=True)
            )
            expired = db.scalar(
                select(Organization)
                .where(Organization.id == self.expired_id)
                .execution_options(skip_organization_scope=True)
            )
            active.access_expires_at = moment + timedelta(days=1)
            restore_organization_access(db, active, now=moment)
            self.assertEqual(
                organization_access_state(active, now=moment), OrganizationAccessState.OPERATIONAL
            )
            with self.assertRaisesRegex(ValueError, "expired organization"):
                restore_organization_access(db, expired, now=moment)

    def test_deadline_is_expired_at_the_exact_instant(self) -> None:
        moment = datetime(2026, 9, 1, 12, 0, 0)
        organization = Organization(
            name="Boundary",
            slug="boundary",
            email="boundary@example.com",
            access_expires_at=moment,
        )
        self.assertEqual(
            organization_access_state(organization, now=moment),
            OrganizationAccessState.EXPIRED,
        )

    def test_final_notification_revokes_existing_sessions(self) -> None:
        moment = datetime.now(UTC).replace(tzinfo=None)
        with self.SessionLocal() as db:
            organization = db.scalar(
                select(Organization)
                .where(Organization.id == self.expired_id)
                .execution_options(skip_organization_scope=True)
            )
            organization.access_expires_at = moment
            organization.access_notice_notified_at = moment - timedelta(days=30)
            db.info["organization_id"] = organization.id
            owner = db.scalar(select(User).where(User.role == UserRole.OWNER))
            session = Session(
                organization_id=organization.id,
                user_id=owner.id,
                token_hash=hash_session_token("close-notification-token"),
                expires_at=moment + timedelta(hours=1),
            )
            db.add(session)
            db.commit()
            with patch(
                "modules.auth.services.organization_lifecycle.send_organization_access_notice",
                return_value=True,
            ):
                self.assertGreaterEqual(send_due_access_notifications(db, now=moment), 1)
            db.refresh(session)
            self.assertTrue(session.revoked)
            self.assertEqual(organization.access_closed_notified_at, moment)

    def test_purge_plan_does_not_require_an_export_or_download(self) -> None:
        with self.SessionLocal() as db:
            organization = db.scalar(
                select(Organization)
                .where(Organization.id == self.expired_id)
                .execution_options(skip_organization_scope=True)
            )
            organization.access_notice_notified_at = datetime(2026, 8, 1, 12, 0, 0)
            organization.access_closed_notified_at = datetime(2026, 9, 1, 12, 0, 0)
            db.commit()
            plan = build_purge_plan(db, organization)
            self.assertTrue(plan.eligible)
            self.assertNotIn("completed_tenant_export_required", plan.blockers)

    def test_hosting_plan_marks_expired_domains_as_detached(self) -> None:
        with self.SessionLocal() as db:
            rows = {row["organization_slug"]: row for row in hosting_plan_rows(db)}
        self.assertEqual(rows["active"]["hosting_state"], "storefront")
        self.assertEqual(rows["expired"]["hosting_state"], "detached")


if __name__ == "__main__":
    unittest.main()
