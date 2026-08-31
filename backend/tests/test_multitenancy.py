from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
from pathlib import Path
import unittest

from fastapi.testclient import TestClient
from starlette.requests import Request
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session as DBSession, selectinload, sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from core.errors import AppHTTPException
from database import Base, get_db
from dependencies import require_organization_feature
from models import (
    Category,
    Order,
    OrderProduct,
    Organization,
    OrganizationDomain,
    OrganizationExperience,
    OrganizationFeatureEntitlement,
    OrganizationProfile,
    Product,
    Session,
    User,
)
from modules.auth.models import OrganizationType, UserRole, UserStatus
from modules.restaurant.models import (
    EntityStatus,
    OrderState,
    PaymentMethod,
    PaymentStatus,
)
from scripts.add_organization_domain import add_organization_domain
from scripts.configure_organization_experience import (
    OrganizationExperienceDocument,
    upsert_organization_experience,
)
from scripts.create_organization import create_organization
from scripts.set_feature_entitlement import set_feature_entitlement
from modules.auth.services.authentication import hash_session_token
from modules.restaurant.services.invoices import ensure_invoice_for_order
from modules.restaurant.services.receipt_email import build_saved_order_receipt_payload, render_receipt_email


class OrganizationScopeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = DBSession(self.engine)
        self.first = Organization(name="First", slug="first", email="first@example.com")
        self.second = Organization(name="Second", slug="second", email="second@example.com")
        self.db.add_all([self.first, self.second])
        self.db.flush()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_loader_scope_filters_collections_relationships_and_aggregates(self):
        self.db.info["organization_id"] = self.first.id
        first_user = User(email="same@example.com", password="hash", role=UserRole.CLIENT, status=UserStatus.ACTIVE)
        self.db.add(first_user)
        self.db.flush()

        self.db.info["organization_id"] = self.second.id
        second_user = User(email="same@example.com", password="hash", role=UserRole.CLIENT, status=UserStatus.ACTIVE)
        self.db.add(second_user)
        self.db.commit()

        self.db.info["organization_id"] = self.first.id
        self.assertEqual(self.db.scalars(select(User)).all(), [first_user])
        self.assertEqual(self.db.scalar(select(func.count()).select_from(User)), 1)
        organization = self.db.scalar(
            select(Organization)
            .where(Organization.id == self.first.id)
            .options(selectinload(Organization.users))
        )
        self.assertEqual([user.id for user in organization.users], [first_user.id])

    def test_before_flush_assigns_and_rejects_organization_id(self):
        self.db.info["organization_id"] = self.first.id
        user = User(email="first@example.com", password="hash", role=UserRole.CLIENT, status=UserStatus.ACTIVE)
        self.db.add(user)
        self.db.flush()
        self.assertEqual(user.organization_id, self.first.id)

        self.db.add(
            User(
                organization_id=self.second.id,
                email="wrong@example.com",
                password="hash",
                role=UserRole.CLIENT,
                status=UserStatus.ACTIVE,
            )
        )
        with self.assertRaisesRegex(RuntimeError, "does not match"):
            self.db.flush()

    def test_unbound_tenant_query_is_rejected(self):
        self.db.info.pop("organization_id", None)
        with self.assertRaisesRegex(RuntimeError, "Organization context is required"):
            self.db.scalars(select(User)).all()

    def test_feature_guard_uses_only_the_bound_organization_entitlement(self):
        self.db.info["organization_id"] = self.first.id
        self.db.add(OrganizationFeatureEntitlement(feature_key="reviews", enabled=True))
        self.db.commit()
        request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
        request.state.organization_id = self.first.id

        self.assertEqual(
            require_organization_feature("reviews")(request=request, db=self.db),
            "reviews",
        )

        self.db.info["organization_id"] = self.second.id
        request.state.organization_id = self.second.id
        with self.assertRaises(AppHTTPException) as raised:
            require_organization_feature("reviews")(request=request, db=self.db)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.error, "organization_feature_not_enabled")


class OrganizationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)
        with cls.Session() as db:
            first = Organization(name="First", slug="first", email="first@example.com")
            second = Organization(name="Second", slug="second", email="second@example.com")
            db.add_all([first, second])
            db.flush()
            cls.first_id = first.id
            cls.second_id = second.id
            db.info["organization_id"] = first.id
            db.add_all([
                OrganizationDomain(domain="first.example", is_primary=True, is_verified=True),
                OrganizationProfile(
                    display_name="First Restaurant",
                    description="First public profile",
                    country="Portugal",
                    currency_code="EUR",
                ),
                OrganizationExperience(
                    schema_version=1,
                    theme_key="base",
                    token_overrides={"primary": "#123456"},
                    assets={"logo": "/first-logo.svg"},
                    navigation=[
                        {"id": "menu", "route_id": "menu", "label": "Menu", "enabled": True}
                    ],
                    pages={
                        "home": {
                            "sections": [
                                {
                                    "id": "products",
                                    "type": "popular_products",
                                    "enabled": True,
                                    "feature_key": "catalog",
                                }
                            ]
                        }
                    },
                    variant_overrides={},
                ),
                OrganizationFeatureEntitlement(feature_key="catalog", enabled=True),
                OrganizationFeatureEntitlement(feature_key="customer_accounts", enabled=True),
                OrganizationFeatureEntitlement(feature_key="ordering", enabled=True),
                OrganizationFeatureEntitlement(feature_key="reviews", enabled=False),
            ])
            user = User(email="user@example.com", password="hash", role=UserRole.CLIENT, status=UserStatus.ACTIVE)
            db.add(user)
            db.flush()
            cls.session_token = "first-session"
            db.add(
                Session(
                    user_id=user.id,
                    token_hash=hash_session_token(cls.session_token),
                    expires_at=datetime.utcnow() + timedelta(hours=1),
                    last_seen_at=datetime.utcnow(),
                    revoked=False,
                )
            )
            guest_token = "first-guest-order"
            order = Order(
                customer_first_name="Guest",
                customer_last_name="One",
                customer_email="guest@example.com",
                order_access_token_hash=hashlib.sha256(guest_token.encode()).hexdigest(),
                order_access_expires_at=datetime.utcnow() + timedelta(hours=1),
                state=OrderState.PENDING,
                payment_method=PaymentMethod.COUNTER,
                payment_status=PaymentStatus.UNPAID,
                subtotal=Decimal("0"),
                vat_percentage=Decimal("13"),
                vat_amount=Decimal("0"),
                total_discount=Decimal("0"),
                total=Decimal("0"),
            )
            db.add(order)
            db.flush()
            cls.order_id = order.id
            cls.guest_token = guest_token
            db.info["organization_id"] = second.id
            db.add_all([
                OrganizationDomain(domain="second.example", is_primary=True, is_verified=True),
                OrganizationProfile(
                    display_name="Second Restaurant",
                    description="Second public profile",
                    country="Portugal",
                    currency_code="EUR",
                ),
                OrganizationExperience(
                    schema_version=1,
                    theme_key="base",
                    token_overrides={"primary": "#654321"},
                    assets={"logo": "/second-logo.svg"},
                    navigation=[
                        {"id": "home", "route_id": "home", "label": "Home", "enabled": True}
                    ],
                    pages={
                        "home": {
                            "sections": [
                                {"id": "hero", "type": "hero", "enabled": True}
                            ]
                        }
                    },
                    variant_overrides={},
                ),
                OrganizationFeatureEntitlement(feature_key="catalog", enabled=True),
                OrganizationFeatureEntitlement(feature_key="customer_accounts", enabled=True),
                OrganizationFeatureEntitlement(feature_key="ordering", enabled=True),
            ])
            second_guest_token = "second-guest-order"
            second_order = Order(
                customer_first_name="Guest",
                customer_last_name="Two",
                customer_email="guest-two@example.com",
                order_access_token_hash=hashlib.sha256(second_guest_token.encode()).hexdigest(),
                order_access_expires_at=datetime.utcnow() + timedelta(hours=1),
                state=OrderState.PENDING,
                payment_method=PaymentMethod.COUNTER,
                payment_status=PaymentStatus.UNPAID,
                subtotal=Decimal("0"),
                vat_percentage=Decimal("13"),
                vat_amount=Decimal("0"),
                total_discount=Decimal("0"),
                total=Decimal("0"),
            )
            db.add(second_order)
            db.flush()
            cls.second_order_id = second_order.id
            cls.second_guest_token = second_guest_token
            db.commit()

        cls.app = create_app(run_startup_tasks=False)

        def override_db():
            with cls.Session() as db:
                yield db

        cls.app.dependency_overrides[get_db] = override_db
        cls.client = TestClient(cls.app, raise_server_exceptions=False)

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        cls.app.dependency_overrides.clear()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()

    def test_domain_resolution_normalizes_url_port_case_and_trailing_dot(self):
        response = self.client.get(
            "/public/organizations/resolve",
            params={"hostname": "HTTPS://FIRST.EXAMPLE.:443/menu"},
            headers={"Origin": "http://bonefree.localhost:5173"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "slug": "first",
                "name": "First",
                "state": "operational",
                "data_access_expires_at": None,
            },
        )
        self.assertEqual(
            response.headers.get("access-control-allow-origin"),
            "http://bonefree.localhost:5173",
        )

    def test_context_errors_are_stable(self):
        missing = self.client.get("/products/")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(missing.json()["error"], "organization_context_required")

        unknown = self.client.get("/products/", headers={"X-Organization-Slug": "missing"})
        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(unknown.json()["error"], "organization_not_found")

        mismatch = self.client.get(
            "/me",
            headers={
                "Authorization": f"Bearer {self.session_token}",
                "X-Organization-Slug": "second",
            },
        )
        self.assertEqual(mismatch.status_code, 403)
        self.assertEqual(mismatch.json()["error"], "organization_context_mismatch")

    def test_public_experience_is_scoped_and_excludes_private_profile_fields(self):
        response = self.client.get(
            "/public/organization-experience",
            headers={"X-Organization-Slug": "first"},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["organization"], {"slug": "first", "name": "First"})
        self.assertEqual(
            payload["capabilities"],
            ["catalog", "customer_accounts", "ordering"],
        )
        self.assertEqual(payload["experience"]["theme"]["key"], "base")
        self.assertEqual(
            payload["experience"]["pages"]["home"]["sections"][0]["feature_key"],
            "catalog",
        )
        self.assertNotIn("tax_id", payload["profile"])
        self.assertNotIn("legal_name", payload["profile"])

        second = self.client.get(
            "/public/organization-experience",
            headers={"X-Organization-Slug": "second"},
        )
        self.assertEqual(second.status_code, 200)
        second_payload = second.json()
        self.assertEqual(second_payload["organization"], {"slug": "second", "name": "Second"})
        self.assertEqual(
            second_payload["capabilities"],
            ["catalog", "customer_accounts", "ordering"],
        )
        self.assertEqual(second_payload["experience"]["theme"]["key"], "base")
        self.assertEqual(second_payload["experience"]["assets"]["logo"], "/second-logo.svg")
        self.assertNotEqual(
            second_payload["experience"]["theme"]["token_overrides"],
            payload["experience"]["theme"]["token_overrides"],
        )

    def test_disabled_feature_is_rejected_before_feature_data_is_loaded(self):
        response = self.client.get(
            "/products/1/reviews",
            headers={"X-Organization-Slug": "first"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"], "organization_feature_not_enabled")
        self.assertEqual(response.json()["params"]["feature_key"], "reviews")

    def test_guest_order_token_cannot_cross_organization(self):
        response = self.client.get(
            f"/checkout/orders/{self.order_id}",
            headers={
                "X-Organization-Slug": "second",
                "X-Order-Token": self.guest_token,
            },
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "order_not_found")

    def test_guest_order_claim_cannot_transfer_an_order_between_organizations(self):
        response = self.client.post(
            "/checkout/orders/claim",
            json={
                "orders": [
                    {
                        "order_id": self.second_order_id,
                        "access_token": self.second_guest_token,
                    }
                ]
            },
            headers={
                "Authorization": f"Bearer {self.session_token}",
                "X-Organization-Slug": "first",
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["claimed_order_ids"], [])
        self.assertEqual(response.json()["rejected_order_ids"], [self.second_order_id])

        with self.Session() as db:
            db.info["organization_id"] = self.second_id
            order = db.scalar(
                select(Order).where(Order.order_id == self.second_order_id)
            )
            self.assertIsNotNone(order)
            self.assertIsNone(order.customer_id)
            self.assertEqual(
                order.order_access_token_hash,
                hashlib.sha256(self.second_guest_token.encode()).hexdigest(),
            )


class OrganizationScriptsAndInvoiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)

    def tearDown(self):
        self.engine.dispose()

    def test_scripts_create_profile_and_switch_primary_domain_atomically(self):
        with DBSession(self.engine) as db:
            organization = create_organization(
                db,
                name="Example Restaurant",
                slug="example",
                organization_type=OrganizationType.RESTAURANT,
                email="hello@example.com",
                legal_name="Example Restaurant, Lda.",
            )
            profile = db.scalar(select(OrganizationProfile))
            self.assertEqual(profile.organization_id, organization.id)
            experience = db.scalar(select(OrganizationExperience))
            self.assertEqual(experience.theme_key, "base")

            upsert_organization_experience(
                db,
                organization_slug="example",
                document=OrganizationExperienceDocument.model_validate({
                    "schema_version": 1,
                    "experience": {
                        "theme": {"key": "bonefree", "mode": "presentation"},
                        "pages": {},
                    },
                }),
            )
            with self.assertRaises(ValueError):
                OrganizationExperienceDocument.model_validate({
                    "schema_version": 0,
                    "experience": {"theme": {"key": "base"}},
                })
            with self.assertRaises(ValueError):
                OrganizationExperienceDocument.model_validate({
                    "schema_version": 1,
                    "experience": {
                        "theme": {
                            "key": "base",
                            "token_overrides": {"unknown_token": "#ffffff"},
                        }
                    },
                })
            with self.assertRaises(ValueError):
                OrganizationExperienceDocument.model_validate({
                    "schema_version": 1,
                    "experience": {
                        "theme": {"key": "base"},
                        "pages": {"unknown_page": {"sections": []}},
                    },
                })
            with self.assertRaises(ValueError):
                OrganizationExperienceDocument.model_validate({
                    "schema_version": 1,
                    "experience": {
                        "theme": {"key": "base"},
                        "pages": {
                            "home": {
                                "sections": [
                                    {"id": "unknown", "type": "unknown_section"}
                                ]
                            }
                        },
                    },
                })
            set_feature_entitlement(
                db,
                organization_slug="example",
                feature_key="reviews",
                enabled=True,
            )
            db.commit()
            self.assertEqual(db.scalar(select(OrganizationExperience.theme_key)), "bonefree")
            self.assertTrue(
                db.scalar(
                    select(OrganizationFeatureEntitlement.enabled).where(
                        OrganizationFeatureEntitlement.feature_key == "reviews"
                    )
                )
            )

            first = add_organization_domain(
                db,
                organization_slug="example",
                domain="https://www.example.com:443/path",
                is_primary=True,
                is_verified=True,
            )
            second = add_organization_domain(
                db,
                organization_slug="example",
                domain="orders.example.com.",
                is_primary=True,
                is_verified=True,
            )
            db.refresh(first)
            self.assertFalse(first.is_primary)
            self.assertTrue(second.is_primary)

    def test_invoice_receipt_keeps_issuer_snapshot_after_profile_change(self):
        with DBSession(self.engine) as db:
            organization = Organization(name="Snapshot", slug="snapshot", email="old@example.com")
            db.add(organization)
            db.flush()
            db.info["organization_id"] = organization.id
            profile = OrganizationProfile(
                display_name="Old Brand",
                legal_name="Old Legal, Lda.",
                tax_id="501964843",
                email="old@example.com",
                phone="912345678",
                address_line_1="Old street 1",
                city="Lisbon",
                postal_code="1000-001",
                country="Portugal",
                logo_url="/old-logo.webp",
                currency_code="EUR",
            )
            db.add_all([
                profile,
                OrganizationDomain(domain="old.example", is_primary=True, is_verified=True),
            ])
            owner = User(email="owner@example.com", password="hash", role=UserRole.OWNER, status=UserStatus.ACTIVE)
            db.add(owner)
            db.flush()
            category = Category(category_name="Mains", created_by_user_id=owner.id, status=EntityStatus.ACTIVE)
            db.add(category)
            db.flush()
            product = Product(
                name="Meal",
                price=Decimal("11.30"),
                available=True,
                category_id=category.id,
                created_by_user_id=owner.id,
                status=EntityStatus.ACTIVE,
                discount_percentage=Decimal("0"),
            )
            db.add(product)
            db.flush()
            order = Order(
                customer_first_name="Guest",
                customer_last_name="Customer",
                customer_email="guest@example.com",
                state=OrderState.CONFIRMED,
                payment_method=PaymentMethod.COUNTER,
                payment_status=PaymentStatus.PAID,
                subtotal=Decimal("11.30"),
                vat_percentage=Decimal("13"),
                vat_amount=Decimal("1.30"),
                total_discount=Decimal("0"),
                total=Decimal("11.30"),
                notes="checkout_payment=counter",
            )
            db.add(order)
            db.flush()
            db.add(
                OrderProduct(
                    order_id=order.id,
                    product_id=product.id,
                    quantity=1,
                    unit_price=Decimal("11.30"),
                    product_name_snapshot="Meal",
                    discount_percentage_snapshot=Decimal("0"),
                    vat_percentage_snapshot=Decimal("13"),
                )
            )
            ensure_invoice_for_order(db, order)
            db.commit()
            db.refresh(order)

            before = build_saved_order_receipt_payload(order)
            before_html = render_receipt_email(before)
            profile.display_name = "New Brand"
            profile.email = "new@example.com"
            profile.address_line_1 = "New street 2"
            db.commit()
            db.refresh(order)

            after = build_saved_order_receipt_payload(order)
            self.assertEqual(before, after)
            self.assertEqual(before_html, render_receipt_email(after))
            self.assertEqual(after["company_name"], "Old Brand")
            self.assertEqual(after["company_email"], "old@example.com")

    def test_receipt_service_has_no_receipt_environment_configuration(self):
        backend_dir = Path(__file__).resolve().parents[1]
        receipt_source = (
            backend_dir / "modules" / "restaurant" / "services" / "receipt_email.py"
        ).read_text(encoding="utf-8")
        config_source = (backend_dir / "core" / "config.py").read_text(encoding="utf-8")
        backend_env = (backend_dir / ".env.example").read_text(encoding="utf-8")
        root_env = (backend_dir.parent / ".env.example").read_text(encoding="utf-8")
        for source in (receipt_source, config_source, backend_env, root_env):
            self.assertNotIn("RECEIPT_", source)
if __name__ == "__main__":
    unittest.main()
