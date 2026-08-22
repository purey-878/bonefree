from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
from io import BytesIO
from pathlib import Path
import re
import tempfile
import unittest
from unittest.mock import patch

from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session as DBSession, sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from core.config import settings
from core.redis import InMemoryRedis
from database import Base, get_db
from models import Category, Coupon, CustomerLoyalty, Ingredient, Invoice, Order, OrderProduct, Payment, Product, ProductCustomizationOption, ProductImage, ProductIngredient, ProductReview, Session, User
from schemas.enums import EntityStatus, IngredientType, PaymentState, ProductCustomizationOptionType, UserRole, UserStatus
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
        cls.manager_token = "manager-smoke-token"
        cls.chef_token = "chef-smoke-token"
        cls.waiter_token = "waiter-smoke-token"

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
            manager = User(name="Smoke", last_name="Manager", email="manager@bonefree.test", password="hash", status=UserStatus.ACTIVE, role=UserRole.MANAGER)
            chef = User(name="Smoke", last_name="Chef", email="chef@bonefree.test", password="hash", status=UserStatus.ACTIVE, role=UserRole.CHEF)
            waiter = User(name="Smoke", last_name="Waiter", email="waiter@bonefree.test", password="hash", status=UserStatus.ACTIVE, role=UserRole.WAITER)
            db.add_all([admin, customer, manager, chef, waiter])
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
                Session(user_id=manager.id, token_hash=hash_session_token(cls.manager_token), expires_at=expires_at, last_seen_at=datetime.utcnow(), revoked=False),
                Session(user_id=chef.id, token_hash=hash_session_token(cls.chef_token), expires_at=expires_at, last_seen_at=datetime.utcnow(), revoked=False),
                Session(user_id=waiter.id, token_hash=hash_session_token(cls.waiter_token), expires_at=expires_at, last_seen_at=datetime.utcnow(), revoked=False),
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
                available=True,
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

    def role_headers(self, token: str):
        return {"Authorization": f"Bearer {token}"}

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

    def test_login_reports_invalid_credentials_for_customer_and_admin(self):
        attempts = (
            ("/login", {"email": "customer@bonefree.test", "password": "WrongPass1!"}),
            ("/admin/login", {"email": "owner@bonefree.test", "password": "WrongPass1!"}),
        )

        for path, payload in attempts:
            with self.subTest(path=path):
                response = self.client.post(path, json=payload)
                self.assertEqual(response.status_code, 401, response.text)
                self.assertEqual(response.json()["error"], "invalid_credentials")
                self.assertEqual(response.json()["message"], "Invalid email or password.")

    def test_counter_checkout_payment_receipt_and_idempotency_workflow(self):
        with self.Session() as db:
            before_product = db.get(Product, self.product_id)
            sold_before = before_product.sold or 0
            available_before = before_product.available

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
        self.assertIsNone(created["order_access_token"])
        self.assertIsNone(created["order_access_expires_at"])
        with self.Session() as db:
            saved_order = db.get(Order, order_id)
            self.assertEqual(saved_order.customer_id, self.customer_id)
            self.assertEqual(saved_order.customer_email, "customer@bonefree.test")
            product = db.get(Product, self.product_id)
            self.assertEqual(product.sold, sold_before + 1)
            self.assertEqual(product.available, available_before)

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

    def test_availability_quick_actions_are_idempotent_and_role_protected(self):
        product_path = f"/admin/products/{self.product_id}/availability"
        for available in (False, False):
            response = self.client.put(product_path, json={"available": available}, headers=self.admin_headers)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["available"], available)

        manager_response = self.client.put(
            product_path,
            json={"available": True},
            headers=self.role_headers(self.manager_token),
        )
        self.assertEqual(manager_response.status_code, 200, manager_response.text)
        for token in (self.chef_token, self.waiter_token):
            forbidden = self.client.put(
                product_path,
                json={"available": False},
                headers=self.role_headers(token),
            )
            self.assertEqual(forbidden.status_code, 403, forbidden.text)

        created = self.client.post(
            "/admin/ingredients",
            json={"name": "Availability smoke ingredient", "type": "normal", "available": True},
            headers=self.admin_headers,
        )
        self.assertEqual(created.status_code, 201, created.text)
        ingredient_id = created.json()["ingredient_id"]
        ingredient_path = f"/admin/ingredients/{ingredient_id}/availability"
        for available in (False, False, True):
            response = self.client.put(
                ingredient_path,
                json={"available": available},
                headers=self.role_headers(self.manager_token),
            )
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["available"], available)
        for token in (self.chef_token, self.waiter_token):
            forbidden = self.client.put(
                ingredient_path,
                json={"available": False},
                headers=self.role_headers(token),
            )
            self.assertEqual(forbidden.status_code, 403, forbidden.text)

    def test_unavailable_cart_items_remain_visible_and_block_checkout(self):
        self.client.delete("/cart/clear", headers=self.customer_headers)
        product_path = f"/admin/products/{self.product_id}/availability"
        self.client.put(product_path, json={"available": True}, headers=self.admin_headers)

        lower = self.client.post(
            "/cart/add",
            json={"product_id": self.product_id, "quantity": 1},
            headers=self.customer_headers,
        )
        upper = self.client.put(
            "/cart/update",
            json={"product_id": self.product_id, "quantity": 99},
            headers=self.customer_headers,
        )
        self.assertEqual(lower.status_code, 200, lower.text)
        self.assertEqual(upper.status_code, 200, upper.text)
        overflow = self.client.post(
            "/cart/add",
            json={"product_id": self.product_id, "quantity": 1},
            headers=self.customer_headers,
        )
        self.assertEqual(overflow.status_code, 422, overflow.text)

        self.client.put(product_path, json={"available": False}, headers=self.admin_headers)
        cart = self.client.get("/cart", headers=self.customer_headers)
        self.assertEqual(cart.status_code, 200, cart.text)
        self.assertEqual(cart.json()["items"][0]["quantity"], 99)
        self.assertFalse(cart.json()["items"][0]["available"])
        blocked = self.client.post(
            "/checkout/orders",
            json=self._checkout_payload(),
            headers=self.customer_headers,
        )
        self.assertEqual(blocked.status_code, 409, blocked.text)

        self.client.delete("/cart/clear", headers=self.customer_headers)
        merged = self.client.post(
            "/cart/merge",
            json={"items": [{"product_id": self.product_id, "quantity": 99}]},
            headers=self.customer_headers,
        )
        self.assertEqual(merged.status_code, 200, merged.text)
        self.assertIn(self.product_id, merged.json()["skipped"])
        self.client.put(product_path, json={"available": True}, headers=self.admin_headers)

    def test_base_and_customization_ingredient_availability_propagates(self):
        with self.Session() as db:
            base = Ingredient(name="Smoke base", type=IngredientType.BASE, status=EntityStatus.ACTIVE, available=True)
            extra = Ingredient(name="Smoke extra", type=IngredientType.EXTRA, status=EntityStatus.ACTIVE, available=True)
            db.add_all([base, extra])
            db.flush()
            db.add(ProductIngredient(
                product_id=self.product_id,
                ingredient_id=base.id,
                included_by_default=True,
                removable=False,
                substitutable=False,
            ))
            option = ProductCustomizationOption(
                product_id=self.product_id,
                ingredient_id=extra.id,
                name=extra.name,
                type=ProductCustomizationOptionType.EXTRA,
                extra_price=Decimal("1.00"),
                max_quantity=2,
                status=EntityStatus.ACTIVE,
            )
            db.add(option)
            db.commit()
            base_id = base.id
            extra_id = extra.id
            option_id = option.id

        base_path = f"/admin/ingredients/{base_id}/availability"
        self.client.put(base_path, json={"available": False}, headers=self.admin_headers)
        public_product = self.client.get(f"/products/{self.product_id}")
        self.assertEqual(public_product.status_code, 200, public_product.text)
        self.assertFalse(public_product.json()["available"])
        self.assertTrue(public_product.json()["unavailable_due_to_unavailable_base"])
        self.client.put(base_path, json={"available": True}, headers=self.admin_headers)

        extra_path = f"/admin/ingredients/{extra_id}/availability"
        self.client.put(extra_path, json={"available": False}, headers=self.admin_headers)
        choices = self.client.get(f"/products/{self.product_id}/customization")
        self.assertEqual(choices.status_code, 200, choices.text)
        exposed_option_ids = {
            option["option_id"]
            for options in choices.json()["options"].values()
            for option in options
        }
        self.assertNotIn(option_id, exposed_option_ids)
        stale = self.client.post(
            "/cart/items/customized",
            json={
                "product_id": self.product_id,
                "quantity": 1,
                "removed_ingredients": [],
                "extras": [{"option_id": option_id, "quantity": 1}],
                "substitutions": [],
            },
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.client.put(extra_path, json={"available": True}, headers=self.admin_headers)

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

    def test_guest_checkout_uses_snapshots_hashed_access_and_server_prices(self):
        with self.Session() as db:
            users_before = db.scalar(select(func.count()).select_from(User))
            coupons_before = db.scalar(select(func.count()).select_from(Coupon))
            loyalty_before = db.scalar(select(func.count()).select_from(CustomerLoyalty))

        payload = self._checkout_payload()
        payload["items"][0]["customization"] = {
            "remove": [],
            "add": [],
            "preferences": [],
            "final_unit_price": "0.01",
        }
        created = self.client.post("/checkout/orders", json=payload)
        self.assertEqual(created.status_code, 201, created.text)
        body = created.json()
        self.assertEqual(Decimal(body["total"]), Decimal("12.50"))
        self.assertTrue(body["order_access_token"])
        self.assertTrue(body["order_access_expires_at"])

        order_id = body["order_id"]
        access_token = body["order_access_token"]
        with self.Session() as db:
            order = db.get(Order, order_id)
            self.assertIsNone(order.customer_id)
            self.assertEqual(order.customer_first_name, "Smoke")
            self.assertEqual(order.customer_last_name, "Customer")
            self.assertEqual(order.customer_email, "customer@bonefree.test")
            self.assertEqual(order.customer_phone, "912345678")
            self.assertEqual(
                order.order_access_token_hash,
                hashlib.sha256(access_token.encode("utf-8")).hexdigest(),
            )
            self.assertNotEqual(order.order_access_token_hash, access_token)
            self.assertEqual(db.scalar(select(func.count()).select_from(User)), users_before)
            self.assertEqual(db.scalar(select(func.count()).select_from(Coupon)), coupons_before)
            self.assertEqual(db.scalar(select(func.count()).select_from(CustomerLoyalty)), loyalty_before)

        missing = self.client.get(f"/checkout/orders/{order_id}")
        wrong = self.client.get(
            f"/checkout/orders/{order_id}",
            headers={"X-Order-Token": "wrong-token"},
        )
        non_owner = self.client.get(
            f"/checkout/orders/{order_id}",
            headers=self.customer_headers,
        )
        allowed = self.client.get(
            f"/checkout/orders/{order_id}",
            headers={"X-Order-Token": access_token},
        )
        self.assertEqual(missing.status_code, 401, missing.text)
        self.assertEqual(missing.json()["error"], "order_access_required")
        self.assertEqual(wrong.status_code, 404, wrong.text)
        self.assertEqual(non_owner.status_code, 404, non_owner.text)
        self.assertEqual(allowed.status_code, 200, allowed.text)
        self.assertEqual(self.client.get("/checkout/orders/history").status_code, 401)
        self.assertEqual(self.client.get("/profile").status_code, 401)

        admin_order = self.client.get(
            f"/admin/orders/{order_id}",
            headers=self.admin_headers,
        )
        customer_admin_attempt = self.client.get(
            f"/admin/orders/{order_id}",
            headers=self.customer_headers,
        )
        self.assertEqual(admin_order.status_code, 200, admin_order.text)
        self.assertEqual(customer_admin_attempt.status_code, 403, customer_admin_attempt.text)
        self.assertIsNone(admin_order.json()["customer_id"])
        self.assertTrue(admin_order.json()["is_guest"])
        self.assertEqual(admin_order.json()["customer_email"], "customer@bonefree.test")
        self.assertEqual(admin_order.json()["customer_name"], "Smoke Customer")
        self.assertEqual(admin_order.json()["customer_phone"], "912345678")

        cancelled = self.client.post(
            f"/checkout/orders/{order_id}/cancel",
            headers={"X-Order-Token": access_token},
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")

    def test_guest_coupon_is_rejected_without_partial_order(self):
        with self.Session() as db:
            orders_before = db.scalar(select(func.count()).select_from(Order))
        payload = self._checkout_payload()
        payload["promo_code"] = "NOT-FOR-GUESTS"

        response = self.client.post("/checkout/orders", json=payload)
        self.assertEqual(response.status_code, 401, response.text)
        self.assertEqual(response.json()["error"], "authentication_required")
        with self.Session() as db:
            self.assertEqual(
                db.scalar(select(func.count()).select_from(Order)),
                orders_before,
            )

    def test_guest_access_rejects_crossed_and_expired_tokens(self):
        first = self.client.post("/checkout/orders", json=self._checkout_payload()).json()
        second = self.client.post("/checkout/orders", json=self._checkout_payload()).json()

        crossed = self.client.get(
            f"/checkout/orders/{first['order_id']}",
            headers={"X-Order-Token": second["order_access_token"]},
        )
        self.assertEqual(crossed.status_code, 404, crossed.text)

        with self.Session() as db:
            order = db.get(Order, first["order_id"])
            order.order_access_expires_at = datetime.utcnow() - timedelta(seconds=1)
            db.commit()

        expired = self.client.get(
            f"/checkout/orders/{first['order_id']}",
            headers={"X-Order-Token": first["order_access_token"]},
        )
        self.assertEqual(expired.status_code, 401, expired.text)
        self.assertEqual(expired.json()["error"], "order_access_expired")

    def test_paid_guest_can_download_receipt_with_order_token(self):
        created = self.client.post("/checkout/orders", json=self._checkout_payload()).json()
        with patch("routers.admin.send_purchase_receipt", return_value=True):
            paid = self.client.post(
                f"/admin/orders/{created['order_id']}/pay-counter",
                headers=self.admin_headers,
            )
        self.assertEqual(paid.status_code, 200, paid.text)
        with self.Session() as db:
            invoice = db.scalar(
                select(Invoice).where(Invoice.order_id == created["order_id"])
            )
            self.assertEqual(invoice.customer_name, "Smoke Customer")

        receipt = self.client.get(
            f"/checkout/orders/{created['order_id']}/receipt.pdf",
            headers={"X-Order-Token": created["order_access_token"]},
        )
        self.assertEqual(receipt.status_code, 200, receipt.text)
        self.assertEqual(receipt.headers["content-type"], "application/pdf")

    def test_guest_order_creation_is_rate_limited_after_ten_requests(self):
        previous_redis = getattr(self.app.state, "redis", None)
        self.app.state.redis = InMemoryRedis()
        try:
            with patch.object(settings, "rate_limit_order_requests", 10):
                responses = [
                    self.client.post("/checkout/orders", json=self._checkout_payload())
                    for _ in range(11)
                ]
        finally:
            if previous_redis is None:
                del self.app.state.redis
            else:
                self.app.state.redis = previous_redis

        self.assertTrue(all(response.status_code == 201 for response in responses[:10]))
        self.assertEqual(responses[10].status_code, 429, responses[10].text)
        self.assertEqual(responses[10].json()["error"], "rate_limit_exceeded")
        self.assertGreaterEqual(int(responses[10].headers["Retry-After"]), 1)

    def test_multipart_upload_and_review_workflow_serialize_successfully(self):
        image_buffer = BytesIO()
        Image.new("RGB", (20, 20), color="red").save(image_buffer, format="PNG")
        upload = self.client.post(
            f"/admin/products/{self.product_id}/image",
            headers=self.admin_headers,
            files={"file": ("smoke.png", image_buffer.getvalue(), "image/png")},
        )
        self.assertEqual(upload.status_code, 200, upload.text)
        self.assertTrue(upload.json()["filename"].endswith("-original.webp"))
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
