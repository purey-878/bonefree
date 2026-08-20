from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session as DBSession, sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from database import Base, get_db
from models import Category, Invoice, Order, OrderProduct, Payment, Product, ProductImage, ProductReview, Session, User
from schemas.enums import EntityStatus, PaymentState, UserRole, UserStatus
from services.auth_service import hash_password, hash_session_token


class EndpointSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(cls.engine)
        cls.Session = sessionmaker(bind=cls.engine)
        cls.temp_directory = tempfile.TemporaryDirectory()
        temp_root = Path(cls.temp_directory.name)

        cls.app = create_app(
            run_startup_tasks=False,
            public_assets_dir=temp_root / "assets",
            uploads_dir=temp_root / "uploads",
        )

        def override_db():
            db = cls.Session()
            try:
                yield db
            finally:
                db.close()

        cls.app.dependency_overrides[get_db] = override_db
        cls.client = TestClient(cls.app, raise_server_exceptions=False)
        cls.customer_token = "customer-smoke-token"
        cls.admin_token = "admin-smoke-token"

        with cls.Session() as db:
            admin = User(
                name="Smoke",
                last_name="Owner",
                email="owner@bonefree.test",
                password=hash_password("StrongPass1!"),
                status=UserStatus.ACTIVE,
                role=UserRole.OWNER,
            )
            customer = User(
                name="Smoke",
                last_name="Customer",
                email="customer@bonefree.test",
                password=hash_password("StrongPass1!"),
                phone="912345678",
                status=UserStatus.ACTIVE,
                role=UserRole.CLIENT,
            )
            db.add_all([admin, customer])
            db.flush()
            cls.admin_id = admin.id
            cls.customer_id = customer.id

            expires_at = datetime.utcnow() + timedelta(hours=2)
            db.add_all([
                Session(
                    user_id=customer.id,
                    token_hash=hash_session_token(cls.customer_token),
                    expires_at=expires_at,
                    last_seen_at=datetime.utcnow(),
                    revoked=False,
                ),
                Session(
                    user_id=admin.id,
                    token_hash=hash_session_token(cls.admin_token),
                    expires_at=expires_at,
                    last_seen_at=datetime.utcnow(),
                    revoked=False,
                ),
            ])
            category = Category(
                category_name="Smoke category",
                category_description="Endpoint smoke fixture",
                admin_id=admin.id,
                status=EntityStatus.ACTIVE,
            )
            db.add(category)
            db.flush()
            product = Product(
                name="Smoke product",
                product_description="Endpoint smoke fixture",
                price=Decimal("12.50"),
                stock=100,
                sold=0,
                category_id=category.id,
                admin_id=admin.id,
                status=EntityStatus.ACTIVE,
                discount_percentage=Decimal("0"),
                customizable=True,
                featured=False,
                gluten_free=False,
                contains_alcohol=False,
            )
            db.add(product)
            db.commit()
            cls.product_id = product.id

        import routers.admin as admin_router

        cls.original_upload_dir = admin_router.UPLOAD_DIR
        cls.original_legacy_upload_dir = admin_router.LEGACY_UPLOAD_DIR
        admin_router.UPLOAD_DIR = temp_root / "uploads" / "images"
        admin_router.LEGACY_UPLOAD_DIR = temp_root / "legacy-images"
        admin_router.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        admin_router.LEGACY_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        import routers.admin as admin_router

        admin_router.UPLOAD_DIR = cls.original_upload_dir
        admin_router.LEGACY_UPLOAD_DIR = cls.original_legacy_upload_dir
        cls.client.close()
        cls.app.dependency_overrides.clear()
        Base.metadata.drop_all(cls.engine)
        cls.engine.dispose()
        cls.temp_directory.cleanup()

    @property
    def customer_headers(self):
        return {"Authorization": f"Bearer {self.customer_token}"}

    @property
    def admin_headers(self):
        return {"Authorization": f"Bearer {self.admin_token}"}

    def _checkout_payload(self, payment_method: str = "counter") -> dict:
        return {
            "customer": {
                "first_name": "Smoke",
                "last_name": "Customer",
                "email": "customer@bonefree.test",
                "phone": "912345678",
            },
            "fulfillment_method": "pickup",
            "payment_method": payment_method,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }

    def _create_order(self) -> dict:
        response = self.client.post(
            "/checkout/orders",
            json=self._checkout_payload(),
            headers=self.customer_headers,
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_every_operation_handles_anonymous_or_malformed_input_without_500(self):
        covered_operation_ids = set()
        for route in self.app.routes:
            if not isinstance(route, APIRoute):
                continue
            method = sorted((route.methods or {"GET"}) - {"HEAD", "OPTIONS"})[0]
            path = re.sub(r"\{[^}]+\}", "1", route.path)
            kwargs = {}
            if method in {"POST", "PUT", "PATCH"}:
                kwargs["json"] = {}
            with self.subTest(operation_id=route.operation_id, method=method, path=path):
                response = self.client.request(method, path, **kwargs)
                self.assertNotEqual(response.status_code, 500, response.text)
            covered_operation_ids.add(route.operation_id)

        expected_operation_ids = {
            route.operation_id for route in self.app.routes if isinstance(route, APIRoute)
        }
        self.assertEqual(covered_operation_ids, expected_operation_ids)

    def test_cors_preflight_is_safe_for_every_route_path(self):
        paths = {
            re.sub(r"\{[^}]+\}", "1", route.path)
            for route in self.app.routes
            if isinstance(route, APIRoute)
        }
        for path in paths:
            with self.subTest(path=path):
                response = self.client.options(
                    path,
                    headers={
                        "Origin": "http://localhost:5173",
                        "Access-Control-Request-Method": "POST",
                    },
                )
                self.assertEqual(response.status_code, 200, response.text)

    def test_counter_checkout_payment_receipt_and_idempotency_workflow(self):
        for unsupported_method in ("cash", "card", "mbway", "qr_pay"):
            with self.subTest(unsupported_method=unsupported_method):
                response = self.client.post(
                    "/checkout/orders",
                    json=self._checkout_payload(unsupported_method),
                    headers=self.customer_headers,
                )
                self.assertEqual(response.status_code, 422, response.text)

        created = self._create_order()
        order_id = created["order_id"]
        self.assertEqual(created["status"], "pending")
        self.assertEqual(created["payment_status"], "unpaid")
        self.assertEqual(created["payment_method"], "counter")

        receipt_before_payment = self.client.get(
            f"/checkout/orders/{order_id}/receipt.pdf",
            headers=self.customer_headers,
        )
        self.assertEqual(receipt_before_payment.status_code, 409, receipt_before_payment.text)

        advance_unpaid = self.client.patch(
            f"/admin/orders/{order_id}/status",
            json={"state": "confirmed"},
            headers=self.admin_headers,
        )
        self.assertEqual(advance_unpaid.status_code, 409, advance_unpaid.text)

        with patch("routers.admin.send_purchase_receipt", return_value=True) as send_receipt:
            paid = self.client.post(
                f"/admin/orders/{order_id}/pay-counter",
                headers=self.admin_headers,
            )
            repeated = self.client.post(
                f"/admin/orders/{order_id}/pay-counter",
                headers=self.admin_headers,
            )

        self.assertEqual(paid.status_code, 200, paid.text)
        self.assertEqual(repeated.status_code, 200, repeated.text)
        self.assertEqual(paid.json()["order"]["payment_status"], "paid")
        self.assertEqual(paid.json()["order"]["state"], "confirmed")
        self.assertEqual(send_receipt.call_count, 1)

        with self.Session() as db:
            payment = db.scalar(select(Payment).where(Payment.order_id == order_id))
            self.assertEqual(payment.state, PaymentState.APPROVED)
            self.assertIsNotNone(payment.paid_at)
            self.assertEqual(
                db.scalar(select(func.count()).select_from(Invoice).where(Invoice.order_id == order_id)),
                1,
            )

        receipt = self.client.get(
            f"/checkout/orders/{order_id}/receipt.pdf",
            headers=self.customer_headers,
        )
        self.assertEqual(receipt.status_code, 200, receipt.text)
        self.assertEqual(receipt.headers["content-type"], "application/pdf")
        self.assertIn("attachment;", receipt.headers["content-disposition"])

        cancel_paid = self.client.post(
            f"/checkout/orders/{order_id}/cancel",
            headers=self.customer_headers,
        )
        self.assertEqual(cancel_paid.status_code, 409, cancel_paid.text)

    def test_unpaid_order_can_be_cancelled_but_not_paid_afterwards(self):
        created = self._create_order()
        order_id = created["order_id"]
        cancelled = self.client.post(
            f"/checkout/orders/{order_id}/cancel",
            headers=self.customer_headers,
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")

        pay_cancelled = self.client.post(
            f"/admin/orders/{order_id}/pay-counter",
            headers=self.admin_headers,
        )
        self.assertEqual(pay_cancelled.status_code, 409, pay_cancelled.text)

    def test_multipart_upload_and_review_workflow_serialize_successfully(self):
        upload = self.client.post(
            f"/admin/products/{self.product_id}/image",
            headers=self.admin_headers,
            files={"file": ("smoke.png", b"not-a-real-image", "image/png")},
        )
        self.assertEqual(upload.status_code, 200, upload.text)
        with self.Session() as db:
            image = db.scalar(select(ProductImage).where(ProductImage.product_id == self.product_id))
            self.assertIsNotNone(image)

        created = self._create_order()
        order_id = created["order_id"]
        with patch("routers.admin.send_purchase_receipt", return_value=True):
            paid = self.client.post(
                f"/admin/orders/{order_id}/pay-counter",
                headers=self.admin_headers,
            )
        self.assertEqual(paid.status_code, 200, paid.text)

        with self.Session() as db:
            order_item_id = db.scalar(
                select(OrderProduct.order_product_id).where(OrderProduct.order_id == order_id)
            )

        review = self.client.post(
            f"/products/{self.product_id}/reviews",
            json={
                "order_product_id": order_item_id,
                "rating": 5,
                "title": "Smoke review",
                "comment": "Endpoint response is serializable.",
            },
            headers=self.customer_headers,
        )
        self.assertEqual(review.status_code, 201, review.text)
        review_id = review.json()["review_id"]

        reply = self.client.post(
            f"/admin/reviews/{review_id}/reply",
            json={"text": "Thank you."},
            headers=self.admin_headers,
        )
        reaction = self.client.post(
            f"/admin/reviews/{review_id}/reaction",
            json={"type": "heart"},
            headers=self.admin_headers,
        )
        self.assertEqual(reply.status_code, 201, reply.text)
        self.assertEqual(reaction.status_code, 200, reaction.text)
        with self.Session() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductReview)), 1)


if __name__ == "__main__":
    unittest.main()
