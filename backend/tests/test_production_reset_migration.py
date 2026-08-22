from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session

from models import (
    Cart,
    Category,
    Coupon,
    CustomerLoyalty,
    Invoice,
    Order,
    OrderProduct,
    Payment,
    Product,
    ProductReview,
    ReviewReaction,
    ReviewReply,
    SiteSetting,
    User,
)
from schemas.enums import (
    CouponType,
    EntityStatus,
    OrderState,
    PaymentMethod,
    PaymentState,
    PaymentStatus,
    ReviewReactionType,
    ReviewStatus,
    SiteSettingKey,
    UserRole,
    UserStatus,
)


BACKEND = Path(__file__).resolve().parents[1]
RESET_REVISION = "c4a8f2e1d9b7"
HEAD_REVISION = "b6d8f0a2c4e7"
PRE_RESET_REVISION = "9b2f4d1a7c8e"
CLEARED_TABLES = (
    "review_reactions",
    "review_replies",
    "product_review",
    "invoice",
    "payment",
    "order_product",
    "customer_order",
    "coupon",
    "customer_loyalty",
)


class ProductionResetMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temp_directory.name) / "legacy.db"
        self.database_url = f"sqlite:///{self.database_path.as_posix()}"

    def tearDown(self):
        self.temp_directory.cleanup()

    def _upgrade(
        self,
        revision: str,
        *,
        check: bool = True,
        database_url: str | None = None,
    ) -> subprocess.CompletedProcess:
        environment = os.environ.copy()
        environment.update({
            "ENVIRONMENT": "test",
            "AUTO_APPLY_MIGRATIONS": "false",
            "DATABASE_URL": database_url or self.database_url,
        })
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", revision],
            cwd=BACKEND,
            env=environment,
            check=False,
            capture_output=True,
            text=True,
        )
        if check and result.returncode:
            self.fail(
                f"Alembic upgrade to {revision} failed.\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        return result

    def _create_pre_reset_database(self, *, email_collision: bool = False) -> None:
        self._upgrade(PRE_RESET_REVISION)
        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            product_columns = {column["name"] for column in inspect(connection).get_columns("product")}
            if "available" in product_columns:
                connection.execute(text("ALTER TABLE product DROP COLUMN available"))
            if "stock" not in product_columns:
                connection.execute(text("ALTER TABLE product ADD COLUMN stock INTEGER NOT NULL DEFAULT 0"))
            ingredient_columns = {column["name"] for column in inspect(connection).get_columns("ingredient")}
            if "available" in ingredient_columns:
                connection.execute(text("ALTER TABLE ingredient DROP COLUMN available"))
        now = datetime.utcnow()
        with Session(engine) as db:
            admin_roles = [
                UserRole.OWNER,
                UserRole.MANAGER,
                UserRole.WAITER,
                UserRole.CHEF,
                UserRole.MANAGER,
                UserRole.WAITER,
                UserRole.CHEF,
            ]
            admins = [
                User(
                    name=f"Admin {index}",
                    last_name="Legacy",
                    email=f"admin{index}@prey.pt",
                    password="hashed",
                    status=UserStatus.ACTIVE,
                    role=role,
                )
                for index, role in enumerate(admin_roles, start=1)
            ]
            customer = User(
                name="Preserved",
                last_name="Customer",
                email="customer@example.com",
                password="hashed",
                status=UserStatus.ACTIVE,
                role=UserRole.CLIENT,
            )
            db.add_all([*admins, customer])
            if email_collision:
                db.add(User(
                    name="Collision",
                    last_name="Admin",
                    email="admin1@bonefree.pt",
                    password="hashed",
                    status=UserStatus.ACTIVE,
                    role=UserRole.MANAGER,
                ))
            db.flush()

            category = Category(
                category_name="Preserved category",
                category_description="Not transactional",
                admin_id=admins[0].id,
                status=EntityStatus.ACTIVE,
            )
            db.add(category)
            db.flush()
            product_result = db.execute(text(
                "INSERT INTO product "
                "(name, product_description, price, stock, sold, category_id, admin_id, status, "
                "discount_percentual, customizable, featured, gluten_free, contains_alcohol, created_at, updated_at) "
                "VALUES (:name, :description, :price, :stock, :sold, :category_id, :admin_id, :status, "
                ":discount, :customizable, :featured, :gluten_free, :contains_alcohol, :now, :now)"
            ), {
                "name": "Preserved product",
                "description": "Not transactional",
                "price": 10.0,
                "stock": 42,
                "sold": 17,
                "category_id": category.id,
                "admin_id": admins[0].id,
                "status": EntityStatus.ACTIVE.value,
                "discount": 0.0,
                "customizable": True,
                "featured": False,
                "gluten_free": False,
                "contains_alcohol": False,
                "now": now,
            })
            product_id = product_result.lastrowid
            db.execute(text(
                "INSERT INTO product "
                "(name, product_description, price, stock, sold, category_id, admin_id, status, "
                "discount_percentual, customizable, featured, gluten_free, contains_alcohol, created_at, updated_at) "
                "VALUES ('Unavailable legacy product', 'Not transactional', 8, 0, 3, :category_id, :admin_id, "
                ":status, 0, 1, 0, 0, 0, :now, :now)"
            ), {
                "category_id": category.id,
                "admin_id": admins[0].id,
                "status": EntityStatus.ACTIVE.value,
                "now": now,
            })
            db.execute(text(
                "INSERT INTO ingredient (name, type, status, created_at, updated_at) VALUES "
                "('Active ingredient', 'normal', 'active', :now, :now), "
                "('Inactive ingredient', 'normal', 'inactive', :now, :now)"
            ), {"now": now})
            db.add(Cart(customer_id=customer.id))
            db.add(SiteSetting(
                key=SiteSettingKey.COMPANY_DETAILS,
                value=json.dumps({
                    "brand_name": "PREY",
                    "description": "Prey restaurant",
                    "address": "Prey, Lisbon",
                    "phone": "+351 210 000 000",
                }),
            ))

            order = Order(
                customer_id=customer.id,
                admin_id=admins[0].id,
                ordered_at=now,
                state=OrderState.CONFIRMED,
                payment_method=PaymentMethod.COUNTER,
                payment_status=PaymentStatus.PAID,
                subtotal=Decimal("10.00"),
                vat_percentage=Decimal("13.00"),
                vat_amount=Decimal("1.15"),
                total_discount=Decimal("0"),
                total=Decimal("10.00"),
                notes="PREY simulated order",
            )
            db.add(order)
            db.flush()
            order_item = OrderProduct(
                order_id=order.id,
                product_id=product_id,
                quantity=1,
                unit_price=Decimal("10.00"),
                product_name_snapshot="Preserved product",
                discount_percentage_snapshot=Decimal("0"),
                vat_percentage_snapshot=Decimal("13.00"),
            )
            db.add(order_item)
            db.flush()
            payment = Payment(
                order_id=order.id,
                method=PaymentMethod.COUNTER,
                state=PaymentState.APPROVED,
                value=Decimal("10.00"),
                transaction_reference="PREY-SIMULATED",
                paid_at=now,
                confirmed_by_admin_id=admins[0].id,
            )
            db.add(payment)
            db.add(Invoice(
                order_id=order.id,
                invoice_number="FR TEST/000001",
                customer_name="Preserved Customer",
                subtotal=Decimal("10.00"),
                vat_percentage=Decimal("13.00"),
                vat_amount=Decimal("1.15"),
                total=Decimal("10.00"),
                issued_at=now,
            ))
            review = ProductReview(
                product_id=product_id,
                customer_id=customer.id,
                order_product_id=order_item.id,
                rating=5,
                title="Simulation",
                comment="Delete this review",
                status=ReviewStatus.APPROVED,
            )
            db.add(review)
            db.flush()
            db.add(ReviewReply(review_id=review.id, admin_id=admins[0].id, text="Simulation reply"))
            db.add(ReviewReaction(
                review_id=review.id,
                admin_id=admins[0].id,
                type=ReviewReactionType.HEART,
            ))
            db.add(Coupon(
                customer_id=customer.id,
                code="PREY-SIMULATED",
                type=CouponType.FIXED_VALUE,
                value=Decimal("5.00"),
                minimum_order_value=Decimal("10.00"),
                used=False,
            ))
            db.add(CustomerLoyalty(
                customer_id=customer.id,
                orders_above_50=2,
                total_coupons_earned=1,
            ))
            db.commit()

        with engine.begin() as connection:
            connection.execute(text(
                "CREATE TABLE refund ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "order_id INTEGER, payment_id INTEGER, admin_id INTEGER, "
                "value NUMERIC(10, 2), status VARCHAR(30), reason VARCHAR(50), "
                "notes VARCHAR(500), method VARCHAR(30), receipt_number VARCHAR(100), "
                "refunded_at DATETIME, created_at DATETIME, updated_at DATETIME)"
            ))
            connection.execute(
                text(
                    "INSERT INTO refund "
                    "(order_id, payment_id, admin_id, value, status, reason, method, "
                    "receipt_number, refunded_at, created_at, updated_at) "
                    "VALUES (1, 1, 1, 10, 'approved', 'other', 'counter', "
                    "'PREY-REFUND', :now, :now, :now)"
                ),
                {"now": now},
            )
        engine.dispose()

    def test_reset_preserves_catalog_and_maps_legacy_availability(self):
        self._create_pre_reset_database()
        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            before = {
                "users": connection.scalar(text('SELECT COUNT(*) FROM "user"')),
                "categories": connection.scalar(text("SELECT COUNT(*) FROM category")),
                "products": connection.scalar(text("SELECT COUNT(*) FROM product")),
                "carts": connection.scalar(text("SELECT COUNT(*) FROM cart")),
                "stock": connection.scalar(text("SELECT stock FROM product WHERE id = 1")),
            }
        engine.dispose()

        self._upgrade("head")
        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), HEAD_REVISION)
            tables = set(inspect(connection).get_table_names())
            self.assertNotIn("refund", tables)
            for table_name in CLEARED_TABLES:
                self.assertEqual(
                    connection.scalar(text(f'SELECT COUNT(*) FROM "{table_name}"')),
                    0,
                    table_name,
                )

            self.assertEqual(connection.scalar(text('SELECT COUNT(*) FROM "user"')), before["users"])
            self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM category")), before["categories"])
            self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM product")), before["products"])
            self.assertEqual(connection.scalar(text("SELECT COUNT(*) FROM cart")), before["carts"])
            product_columns = {column["name"] for column in inspect(connection).get_columns("product")}
            self.assertNotIn("stock", product_columns)
            self.assertIn("available", product_columns)
            self.assertTrue(connection.scalar(text("SELECT available FROM product WHERE id = 1")))
            self.assertFalse(connection.scalar(text("SELECT available FROM product WHERE id = 2")))
            ingredient_availability = connection.execute(text(
                "SELECT name, available FROM ingredient ORDER BY name"
            )).all()
            self.assertEqual(ingredient_availability, [("Active ingredient", 1), ("Inactive ingredient", 0)])
            self.assertEqual(connection.scalar(text("SELECT sold FROM product WHERE id = 1")), 0)

            details = json.loads(connection.scalar(text(
                "SELECT value FROM site_setting WHERE CAST(key AS VARCHAR) = 'company_details'"
            )))
            self.assertEqual(details["brand_name"], "BONEFREE")
            self.assertNotIn("Prey", details["description"])
            self.assertNotIn("Prey", details["address"])
            self.assertEqual(details["phone"], "+351 210 000 000")
            admin_emails = connection.execute(text(
                'SELECT email FROM "user" WHERE CAST(role AS VARCHAR) != \'client\''
            )).scalars().all()
            self.assertEqual(len(admin_emails), 7)
            self.assertTrue(all(email.endswith("@bonefree.pt") for email in admin_emails))

            snapshot = {
                "version": connection.scalar(text("SELECT version_num FROM alembic_version")),
                "available": connection.scalar(text("SELECT available FROM product WHERE id = 1")),
                "sold": connection.scalar(text("SELECT sold FROM product WHERE id = 1")),
                "company": connection.scalar(text(
                    "SELECT value FROM site_setting WHERE CAST(key AS VARCHAR) = 'company_details'"
                )),
            }
        engine.dispose()

        self._upgrade("head")
        engine = create_engine(self.database_url)
        with Session(engine) as db:
            after = {
                "version": db.scalar(text("SELECT version_num FROM alembic_version")),
                "available": db.scalar(select(Product.available).where(Product.id == 1)),
                "sold": db.scalar(select(Product.sold).where(Product.id == 1)),
                "company": db.scalar(text(
                    "SELECT value FROM site_setting WHERE CAST(key AS VARCHAR) = 'company_details'"
                )),
            }
            self.assertEqual(after, snapshot)

            customer_id = db.scalar(select(User.id).where(User.role == UserRole.CLIENT))
            order = Order(
                customer_id=customer_id,
                state=OrderState.PENDING,
                payment_method=PaymentMethod.COUNTER,
                payment_status=PaymentStatus.UNPAID,
                subtotal=Decimal("10.00"),
                vat_percentage=Decimal("13.00"),
                vat_amount=Decimal("1.15"),
                total_discount=Decimal("0"),
                total=Decimal("10.00"),
            )
            db.add(order)
            db.flush()
            self.assertEqual(order.id, 1)
            item = OrderProduct(
                order_id=order.id,
                product_id=1,
                quantity=1,
                unit_price=Decimal("10.00"),
                product_name_snapshot="Preserved product",
                discount_percentage_snapshot=Decimal("0"),
                vat_percentage_snapshot=Decimal("13.00"),
            )
            db.add(item)
            db.flush()
            invoice = Invoice(
                order_id=order.id,
                invoice_number="FR TEST/000001",
                subtotal=Decimal("10.00"),
                vat_percentage=Decimal("13.00"),
                vat_amount=Decimal("1.15"),
                total=Decimal("10.00"),
            )
            review = ProductReview(
                product_id=1,
                customer_id=customer_id,
                order_product_id=item.id,
                rating=5,
                status=ReviewStatus.APPROVED,
            )
            db.add_all([invoice, review])
            db.flush()
            self.assertEqual(invoice.id, 1)
            self.assertEqual(review.id, 1)

        engine.dispose()

    def test_email_collision_aborts_before_brand_or_email_changes(self):
        self._create_pre_reset_database(email_collision=True)
        result = self._upgrade("head", check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("already exists", result.stderr)

        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            version = connection.scalar(text("SELECT version_num FROM alembic_version"))
            self.assertEqual(version, PRE_RESET_REVISION)
            email = connection.scalar(text('SELECT email FROM "user" WHERE email = \'admin1@prey.pt\''))
            self.assertEqual(email, "admin1@prey.pt")
        engine.dispose()

    def test_availability_revision_preserves_sold_values(self):
        self._create_pre_reset_database()
        self._upgrade(RESET_REVISION)
        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            connection.execute(text("UPDATE product SET sold = 23 WHERE id = 1"))
        engine.dispose()

        self._upgrade("head")
        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT sold FROM product WHERE id = 1")), 23)
            self.assertTrue(connection.scalar(text("SELECT available FROM product WHERE id = 1")))
        engine.dispose()

    def test_availability_revision_repairs_a_partial_legacy_schema(self):
        self._create_pre_reset_database()
        self._upgrade(RESET_REVISION)
        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE product ADD COLUMN available BOOLEAN"))
            connection.execute(text("ALTER TABLE ingredient ADD COLUMN available BOOLEAN"))
        engine.dispose()

        self._upgrade("head")
        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            product_columns = {column["name"]: column for column in inspect(connection).get_columns("product")}
            ingredient_columns = {column["name"]: column for column in inspect(connection).get_columns("ingredient")}
            self.assertNotIn("stock", product_columns)
            self.assertFalse(product_columns["available"]["nullable"])
            self.assertFalse(ingredient_columns["available"]["nullable"])
            self.assertEqual(
                connection.execute(text("SELECT id, available FROM product ORDER BY id")).all(),
                [(1, 1), (2, 0)],
            )
        engine.dispose()

    def test_clean_sqlite_install_reaches_head_without_refund_table(self):
        self._upgrade("head")
        self._upgrade("head")
        engine = create_engine(self.database_url)
        with engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT version_num FROM alembic_version")), HEAD_REVISION)
            self.assertNotIn("refund", inspect(connection).get_table_names())
        engine.dispose()

    def test_guest_order_revision_backfills_snapshots_and_is_idempotent(self):
        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            connection.execute(text(
                'CREATE TABLE "user" ('
                "id INTEGER PRIMARY KEY, name VARCHAR(100), last_name VARCHAR(100), "
                "email VARCHAR(150), phone VARCHAR(20), tax_id VARCHAR(20))"
            ))
            connection.execute(text(
                "CREATE TABLE customer_order ("
                "id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, "
                'FOREIGN KEY(customer_id) REFERENCES "user" (id))'
            ))
            connection.execute(text(
                "CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"
            ))
            connection.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:revision)"),
                {"revision": "d7e3a1b9c5f2"},
            )
            connection.execute(text(
                'INSERT INTO "user" (id, name, last_name, email, phone, tax_id) '
                "VALUES (1, 'Legacy', 'Customer', 'legacy@example.com', "+
                "'+351912345678', '245716534')"
            ))
            connection.execute(text(
                "INSERT INTO customer_order (id, customer_id) VALUES (7, 1)"
            ))
        engine.dispose()

        self._upgrade("head")
        self._upgrade("head")

        engine = create_engine(self.database_url)
        with engine.begin() as connection:
            columns = {
                column["name"]: column
                for column in inspect(connection).get_columns("customer_order")
            }
            self.assertTrue(columns["customer_id"]["nullable"])
            for column_name in (
                "customer_first_name",
                "customer_last_name",
                "customer_email",
                "customer_phone",
                "customer_tax_id",
                "order_access_token_hash",
                "order_access_expires_at",
            ):
                self.assertIn(column_name, columns)

            snapshot = connection.execute(text(
                "SELECT customer_first_name, customer_last_name, customer_email, "
                "customer_phone, customer_tax_id FROM customer_order WHERE id = 7"
            )).one()
            self.assertEqual(
                snapshot,
                (
                    "Legacy",
                    "Customer",
                    "legacy@example.com",
                    "+351912345678",
                    "245716534",
                ),
            )
            connection.execute(text(
                "INSERT INTO customer_order (id, customer_id, customer_first_name, "
                "customer_last_name, customer_email, customer_phone, "
                "order_access_token_hash) VALUES "
                "(8, NULL, 'Guest', 'Customer', 'guest@example.com', "+
                "'+351911111111', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')"
            ))
            self.assertEqual(
                connection.scalar(text("SELECT COUNT(*) FROM customer_order")),
                2,
            )
            self.assertEqual(
                connection.scalar(text("SELECT version_num FROM alembic_version")),
                HEAD_REVISION,
            )
        engine.dispose()

    @unittest.skipUnless(
        os.environ.get("TEST_POSTGRES_DATABASE_URL"),
        "TEST_POSTGRES_DATABASE_URL is required for the PostgreSQL migration test",
    )
    def test_clean_postgresql_install_reaches_head_without_refund_structures(self):
        database_url = os.environ["TEST_POSTGRES_DATABASE_URL"]
        engine = create_engine(database_url)

        with engine.connect() as connection:
            self.assertEqual(connection.scalar(text("SELECT current_database()")), "bonefree_test")
            self.assertIn(engine.url.host, {"localhost", "127.0.0.1", "postgres"})

        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
        engine.dispose()

        self._upgrade("head", database_url=database_url)
        self._upgrade("head", database_url=database_url)

        engine = create_engine(database_url)
        with engine.connect() as connection:
            self.assertEqual(
                connection.scalar(text("SELECT version_num FROM alembic_version")),
                HEAD_REVISION,
            )
            self.assertNotIn("refund", inspect(connection).get_table_names())

            enum_rows = connection.execute(text(
                "SELECT pg_type.typname, pg_enum.enumlabel "
                "FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE pg_type.typname IN "
                "('orderstate', 'paymentstatus', 'paymentstate')"
            )).all()
            labels_by_enum: dict[str, set[str]] = {}
            for enum_name, label in enum_rows:
                labels_by_enum.setdefault(enum_name, set()).add(label)
            self.assertEqual(
                labels_by_enum["orderstate"],
                {"pending", "confirmed", "in_preparation", "ready", "delivered", "cancelled"},
            )
            self.assertEqual(labels_by_enum["paymentstatus"], {"unpaid", "paid"})
            self.assertEqual(labels_by_enum["paymentstate"], {"pending", "approved", "rejected"})
            self.assertEqual(
                connection.scalar(text(
                    "SELECT COUNT(*) FROM pg_type "
                    "WHERE typname IN ('refundstatus', 'refundreason', 'refundmethod')"
                )),
                0,
            )
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
