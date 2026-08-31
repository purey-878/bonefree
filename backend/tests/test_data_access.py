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
from modules.auth.models import (
    DataExport,
    Organization,
    OrganizationDomain,
    Session,
    SessionMode,
    User,
    UserRole,
)
from modules.auth.services.authentication import hash_password, hash_session_token
from modules.auth.services.organization_lifecycle import (
    OrganizationAccessState,
    cancel_organization_access,
    data_access_expires_at,
    freeze_organization_now,
    hosting_plan_rows,
    organization_access_state,
    restore_organization_access,
)
from modules.restaurant.services.data_exports import process_data_export


class DataAccessTests(unittest.TestCase):
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
        self.original_data_access_days = settings.data_access_window_days
        settings.data_exports_dir = Path(self.temporary_directory.name) / "exports"
        settings.environment = "test"
        settings.rate_limit_enabled = False
        settings.cancellation_notice_days = 30
        settings.data_access_window_days = 30

        app = create_app(
            run_startup_tasks=False,
            public_assets_dir=Path(self.temporary_directory.name) / "assets",
            uploads_dir=Path(self.temporary_directory.name) / "uploads",
        )

        def override_db():
            with self.SessionLocal() as db:
                yield db

        app.dependency_overrides[get_db] = override_db
        self.client = TestClient(app)
        now = datetime.now(UTC).replace(tzinfo=None)

        with self.SessionLocal() as db:
            self.active = Organization(
                name="Active Restaurant",
                slug="active",
                email="owner@active.example",
                access_expires_at=now + timedelta(days=10),
            )
            self.frozen = Organization(
                name="Frozen Restaurant",
                slug="frozen",
                email="owner@frozen.example",
                access_expires_at=now - timedelta(days=1),
            )
            self.unsupported = Organization(
                name="Unsupported Restaurant",
                slug="unsupported",
                email="owner@unsupported.example",
                access_expires_at=now - timedelta(days=31),
            )
            self.second_frozen = Organization(
                name="Second Frozen Restaurant",
                slug="second-frozen",
                email="owner@second-frozen.example",
                access_expires_at=now - timedelta(days=1),
            )
            db.add_all([self.active, self.frozen, self.unsupported, self.second_frozen])
            db.flush()

            for organization, hostname in (
                (self.active, "active.example"),
                (self.frozen, "frozen.example"),
                (self.unsupported, "unsupported.example"),
                (self.second_frozen, "second-frozen.example"),
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
            db.info["organization_id"] = self.frozen.id
            db.add_all(
                [
                    User(
                        organization_id=self.frozen.id,
                        name="Manager",
                        email="manager@frozen.example",
                        password=hash_password("manager-password"),
                        role=UserRole.MANAGER,
                    ),
                    User(
                        organization_id=self.frozen.id,
                        name="Customer",
                        email="customer@frozen.example",
                        password=hash_password("customer-password"),
                        role=UserRole.CLIENT,
                    ),
                ]
            )
            db.commit()
            self.active_id = self.active.id
            self.frozen_id = self.frozen.id
            self.unsupported_id = self.unsupported.id
            self.second_frozen_id = self.second_frozen.id

    def tearDown(self) -> None:
        self.client.close()
        self.engine.dispose()
        self.temporary_directory.cleanup()
        settings.data_exports_dir = self.original_exports_dir
        settings.environment = self.original_environment
        settings.rate_limit_enabled = self.original_rate_limit
        settings.cancellation_notice_days = self.original_notice_days
        settings.data_access_window_days = self.original_data_access_days

    def _data_access_headers(self, organization_id: int, hostname: str, token: str) -> dict[str, str]:
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
                    mode=SessionMode.DATA_ACCESS,
                )
            )
            db.commit()
        return {
            "Authorization": f"Bearer {token}",
            "X-Organization-Hostname": hostname,
            "Origin": f"https://{hostname}",
        }

    def test_resolution_derives_operational_frozen_and_unsupported_states(self) -> None:
        active = self.client.get("/public/organizations/resolve", params={"hostname": "active.example"})
        frozen = self.client.get("/public/organizations/resolve", params={"hostname": "frozen.example"})
        unsupported = self.client.get(
            "/public/organizations/resolve", params={"hostname": "unsupported.example"}
        )

        self.assertEqual(active.status_code, 200)
        self.assertEqual(active.json()["state"], "operational")
        self.assertIsNone(active.json()["data_access_expires_at"])
        self.assertEqual(frozen.status_code, 200)
        self.assertEqual(frozen.json()["state"], "frozen")
        self.assertIsNotNone(frozen.json()["data_access_expires_at"])
        self.assertEqual(unsupported.status_code, 404)

    def test_operational_dependencies_block_frozen_organization_without_worker(self) -> None:
        requests = (
            self.client.post(
                "/admin/login",
                headers={"X-Organization-Slug": "frozen"},
                json={"email": "owner@frozen.example", "password": "owner-password"},
            ),
            self.client.post(
                "/login",
                headers={"X-Organization-Slug": "frozen"},
                json={"email": "customer@frozen.example", "password": "customer-password"},
            ),
            self.client.get(
                "/products",
                headers={"X-Organization-Slug": "frozen"},
            ),
            self.client.get(
                "/site-settings/theme",
                headers={"X-Organization-Slug": "frozen"},
            ),
        )

        for response in requests:
            with self.subTest(path=response.request.url.path):
                self.assertEqual(response.status_code, 404)
                self.assertEqual(response.json()["error"], "organization_not_found")

    def test_owner_password_and_otp_create_data_access_session(self) -> None:
        with (
            patch("modules.auth.routers.data_access.secrets.randbelow", return_value=123456),
            patch("modules.auth.routers.data_access.send_data_access_otp_email", return_value=True),
        ):
            challenge = self.client.post(
                "/data-access/auth/request-code",
                headers={"Origin": "https://frozen.example"},
                json={
                    "hostname": "frozen.example",
                    "email": "owner@frozen.example",
                    "password": "owner-password",
                },
            )
        self.assertEqual(challenge.status_code, 200)
        verified = self.client.post(
            "/data-access/auth/verify-code",
            headers={"Origin": "https://frozen.example"},
            json={
                "hostname": "frozen.example",
                "challenge_id": challenge.json()["challenge_id"],
                "code": "123456",
            },
        )
        self.assertEqual(verified.status_code, 200)
        self.assertEqual(verified.json()["owner"]["email"], "owner@frozen.example")
        self.assertIn("data_access_expires_at", verified.json())

    def test_manager_and_mismatched_origin_cannot_request_data_access(self) -> None:
        mismatched = self.client.post(
            "/data-access/auth/request-code",
            headers={"Origin": "https://second-frozen.example"},
            json={
                "hostname": "frozen.example",
                "email": "owner@frozen.example",
                "password": "owner-password",
            },
        )
        manager = self.client.post(
            "/data-access/auth/request-code",
            headers={"Origin": "https://frozen.example"},
            json={
                "hostname": "frozen.example",
                "email": "manager@frozen.example",
                "password": "manager-password",
            },
        )
        self.assertEqual(mismatched.status_code, 403)
        self.assertEqual(manager.status_code, 401)

    def test_data_access_session_is_bound_to_hostname_and_tenant(self) -> None:
        headers = self._data_access_headers(self.frozen_id, "frozen.example", "frozen-token")
        accepted = self.client.get("/data-access/customers", headers=headers)
        privacy = self.client.get("/data-access/data-privacy", headers=headers)
        wrong_hostname = self.client.get(
            "/data-access/customers",
            headers={**headers, "X-Organization-Hostname": "second-frozen.example"},
        )
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(len(accepted.json()["items"]), 1)
        self.assertEqual(privacy.status_code, 200)
        self.assertIsNotNone(privacy.json()["operational_access_expires_at"])
        self.assertIsNotNone(privacy.json()["data_access_expires_at"])
        self.assertEqual(wrong_hostname.status_code, 403)

    def test_export_requests_are_deduplicated_and_apply_the_daily_selection_rules(self) -> None:
        headers = self._data_access_headers(self.frozen_id, "frozen.example", "export-token")
        with self.SessionLocal() as db:
            db.info["organization_id"] = self.frozen_id
            customer_id = db.scalar(select(User.id).where(User.role == UserRole.CLIENT))
        self.assertIsNotNone(customer_id)

        first_customer = self.client.post(
            f"/data-access/customers/{customer_id}/data-export",
            headers=headers,
        )
        repeated_customer = self.client.post(
            f"/data-access/customers/{customer_id}/data-export",
            headers=headers,
        )
        customers_copy = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "customers"},
        )
        repeated_customers_copy = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "customers"},
        )
        full_copy = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "tenant"},
        )
        catalog_copy = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "catalog"},
        )

        self.assertEqual(first_customer.status_code, 202)
        self.assertEqual(repeated_customer.status_code, 202)
        self.assertEqual(first_customer.json()["export_id"], repeated_customer.json()["export_id"])
        self.assertEqual(customers_copy.status_code, 202)
        self.assertEqual(customers_copy.json()["export_id"], repeated_customers_copy.json()["export_id"])
        self.assertEqual(full_copy.status_code, 409)
        self.assertEqual(full_copy.json()["error"], "data_export_daily_limit")
        self.assertEqual(catalog_copy.status_code, 202)

    def test_owner_can_cancel_queued_copy_and_delete_ready_private_file(self) -> None:
        headers = self._data_access_headers(self.frozen_id, "frozen.example", "cancel-export-token")

        queued = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "catalog"},
        )
        cancelled = self.client.delete(
            f"/data-access/data-exports/{queued.json()['export_id']}",
            headers=headers,
        )
        repeated = self.client.post(
            "/data-access/data-exports",
            headers=headers,
            json={"kind": "catalog"},
        )
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertFalse(cancelled.json()["can_download"])
        self.assertEqual(repeated.status_code, 409)

        with self.SessionLocal() as db:
            db.info["organization_id"] = self.frozen_id
            customer_id = db.scalar(select(User.id).where(User.role == UserRole.CLIENT))
        ready_request = self.client.post(
            f"/data-access/customers/{customer_id}/data-export",
            headers=headers,
        )
        with self.SessionLocal() as db:
            db.info["organization_id"] = self.frozen_id
            export = db.scalar(
                select(DataExport).where(DataExport.public_id == ready_request.json()["export_id"])
            )
            self.assertIsNotNone(export)
            process_data_export(db, export)
            private_path = Path(export.storage_path)
            self.assertTrue(private_path.is_file())

        deleted = self.client.delete(
            f"/data-access/data-exports/{ready_request.json()['export_id']}",
            headers=headers,
        )
        unavailable = self.client.get(
            f"/data-access/data-exports/{ready_request.json()['export_id']}/download",
            headers=headers,
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json()["status"], "cancelled")
        self.assertFalse(private_path.exists())
        self.assertEqual(unavailable.status_code, 410)

    def test_cancel_is_idempotent_and_uses_configured_notice_period(self) -> None:
        settings.cancellation_notice_days = 45
        first_moment = datetime(2026, 8, 31, 12, 0, 0)
        later_moment = first_moment + timedelta(days=2)
        with self.SessionLocal() as db:
            organization = Organization(name="New", slug="new", email="new@example.com")
            db.add(organization)
            db.commit()
            with patch(
                "modules.auth.services.organization_lifecycle.send_data_access_notice",
                return_value=True,
            ):
                first = cancel_organization_access(db, organization, now=first_moment)
                repeated = cancel_organization_access(db, organization, now=later_moment)
            self.assertEqual(first, first_moment + timedelta(days=45))
            self.assertEqual(repeated, first)

    def test_freeze_restore_and_data_window_use_configured_period(self) -> None:
        settings.data_access_window_days = 20
        moment = datetime(2026, 8, 31, 12, 0, 0)
        with self.SessionLocal() as db:
            organization = db.scalar(
                select(Organization)
                .where(Organization.id == self.active_id)
                .execution_options(skip_organization_scope=True)
            )
            with patch(
                "modules.auth.services.organization_lifecycle.send_data_access_notice",
                return_value=True,
            ):
                freeze_organization_now(db, organization, now=moment)
            self.assertEqual(organization_access_state(organization, now=moment), OrganizationAccessState.FROZEN)
            self.assertEqual(data_access_expires_at(organization), moment + timedelta(days=20))
            restore_organization_access(db, organization)
            self.assertEqual(organization_access_state(organization), OrganizationAccessState.OPERATIONAL)

    def test_hosting_plan_marks_frozen_and_unsupported_domains(self) -> None:
        with self.SessionLocal() as db:
            rows = {row["organization_slug"]: row for row in hosting_plan_rows(db)}
        self.assertEqual(rows["active"]["hosting_state"], "storefront")
        self.assertEqual(rows["frozen"]["hosting_state"], "frozen")
        self.assertEqual(rows["unsupported"]["hosting_state"], "detached")


if __name__ == "__main__":
    unittest.main()
