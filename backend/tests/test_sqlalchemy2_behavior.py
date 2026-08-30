from decimal import Decimal
from datetime import datetime, timedelta
import unittest

from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session

from database import Base
from models import (
    Cart,
    CartProduct,
    CartProductCustomization,
    Category,
    Ingredient,
    Media,
    MediaVariant,
    Order,
    OrderProduct,
    Organization,
    Product,
    ProductIngredient,
    ProductMedia,
    ProductReview,
    User,
)
from modules.restaurant.routers._shared import (
    _build_dashboard_sales_graphs,
    _unavailable_product_rows,
    _popular_product_rows,
    _product_sales_aggregate_rows,
    _sales_aggregate_rows,
)
from modules.restaurant.routers.cart import _delete_cart_items, _find_cart_line, _get_product_or_404
from modules.restaurant.routers.checkout import _new_coupon_code
from modules.restaurant.routers.products import get_product, list_products
from modules.restaurant.routers.reviews import get_product_review_stats
from modules.auth.models import UserRole, UserStatus
from modules.restaurant.models import (
    CartCustomizationAction,
    EntityStatus,
    IngredientType,
    MediaOwnerType,
    MediaVariantKind,
    OrderState,
    PaymentMethod,
    PaymentStatus,
    ReviewStatus,
)
from modules.restaurant.services.product_availability import unavailable_base_product_ids
from modules.restaurant.services.site_settings import get_site_theme_settings, save_site_theme
from modules.restaurant.schemas.site_settings import SiteThemeSettings


class SqlAlchemy2BehaviorTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        organization = Organization(name="Bonefree", slug="bonefree", email="hello@bonefree.test")
        self.db.add(organization)
        self.db.flush()
        self.db.info["organization_id"] = organization.id

        self.admin = User(
            name="Admin",
            last_name="User",
            email="admin@example.com",
            password="hash",
            role=UserRole.OWNER,
            status=UserStatus.ACTIVE,
        )
        self.customer = User(
            name="Customer",
            last_name="One",
            email="customer@example.com",
            password="hash",
            role=UserRole.CLIENT,
            status=UserStatus.ACTIVE,
        )
        self.second_customer = User(
            name="Customer",
            last_name="Two",
            email="customer2@example.com",
            password="hash",
            role=UserRole.CLIENT,
            status=UserStatus.ACTIVE,
        )
        self.db.add_all([self.admin, self.customer, self.second_customer])
        self.db.flush()

        category = Category(
            category_name="Mains",
            created_by_user_id=self.admin.id,
            status=EntityStatus.ACTIVE,
        )
        self.db.add(category)
        self.db.flush()

        self.product = Product(
            name="Test product",
            product_description="Test description",
            price=Decimal("12.00"),
            available=True,
            category_id=category.id,
            created_by_user_id=self.admin.id,
            status=EntityStatus.ACTIVE,
            discount_percentage=Decimal("10"),
        )
        self.db.add(self.product)
        self.db.flush()
        self._add_product_media(self.product, "test")

        ingredient = Ingredient(
            name="Inactive base",
            type=IngredientType.BASE,
            status=EntityStatus.INACTIVE,
        )
        self.db.add(ingredient)
        self.db.flush()
        self.db.add(ProductIngredient(
            product_id=self.product.id,
            ingredient_id=ingredient.id,
            included_by_default=True,
            removable=False,
            substitutable=False,
        ))

        self.db.add_all([
            ProductReview(
                product_id=self.product.id,
                customer_id=self.customer.id,
                rating=4,
                status=ReviewStatus.APPROVED,
            ),
            ProductReview(
                product_id=self.product.id,
                customer_id=self.second_customer.id,
                rating=2,
                status=ReviewStatus.APPROVED,
            ),
        ])

        cart = Cart(customer_id=self.customer.id)
        self.db.add(cart)
        self.db.flush()
        cart_item = CartProduct(cart_id=cart.id, product_id=self.product.id, quantity=1)
        self.db.add(cart_item)
        self.db.flush()
        self.db.add(CartProductCustomization(
            cart_product_id=cart_item.id,
            action=CartCustomizationAction.REMOVE_INGREDIENT,
            quantity=1,
            extra_price=Decimal("0"),
            notes="no sesame",
        ))
        self.db.commit()
        self.cart_id = cart.id

    def _add_product_media(self, product: Product, stem: str) -> None:
        media = Media(
            owner_type=MediaOwnerType.PRODUCT,
            original_filename=f"{stem}.webp",
            content_type="image/webp",
            storage_key=f"products/{stem}-original.webp",
            public_url=f"/uploads/products/{stem}-original.webp",
            width=100,
            height=100,
            size_bytes=100,
            variants=[
                MediaVariant(
                    kind=kind,
                    storage_key=f"products/{stem}-{kind.value}.webp",
                    public_url=f"/uploads/products/{stem}-{kind.value}.webp",
                    content_type="image/webp",
                    width=100,
                    height=100,
                    size_bytes=100,
                )
                for kind in (
                    MediaVariantKind.THUMB,
                    MediaVariantKind.CARD,
                    MediaVariantKind.DETAIL,
                )
            ],
        )
        self.db.add(media)
        self.db.add(ProductMedia(
            product=product,
            media=media,
            sort_order=0,
            alt_text=product.name,
            is_primary=True,
        ))

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_single_collection_aggregate_and_eager_load_results(self):
        selected_product = _get_product_or_404(self.db, self.product.id)
        self.assertEqual(selected_product.id, self.product.id)

        cart_item = _find_cart_line(self.db, self.cart_id, self.product.id, None)
        self.assertIsNotNone(cart_item)

        self.assertEqual(
            unavailable_base_product_ids(self.db, [self.product.id]),
            {self.product.id},
        )

        response = get_product(str(self.product.id), self.db)
        self.assertEqual(response.id, self.product.id)
        self.assertEqual(response.media[0].original_url, "/uploads/products/test-original.webp")
        self.assertEqual(response.media[0].variants[1].kind, MediaVariantKind.CARD)

        stats = get_product_review_stats(str(self.product.id), self.db)
        self.assertEqual(stats.total_reviews, 2)
        self.assertEqual(stats.average_rating, 3.0)

    def test_exists_setting_upsert_and_bulk_delete_results(self):
        code = _new_coupon_code(
            self.db,
            self.customer,
            discount_type="fixed_value",
            discount_value=Decimal("5"),
        )
        self.assertTrue(code.startswith(f"BONEFREE5-{self.customer.id}-"))

        settings = SiteThemeSettings(theme_id="christmas")
        save_site_theme(self.db, settings)
        self.assertEqual(get_site_theme_settings(self.db).theme_id, "christmas")

        _delete_cart_items(self.db, self.cart_id)
        remaining_items = self.db.scalar(select(func.count()).select_from(CartProduct))
        remaining_customizations = self.db.scalar(
            select(func.count()).select_from(CartProductCustomization)
        )
        self.assertEqual(remaining_items, 0)
        self.assertEqual(remaining_customizations, 0)

    def test_product_uses_english_attribute_for_legacy_column(self):
        column = Product.discount_percentage.property.columns[0]
        self.assertEqual(column.name, "discount_percentual")
        self.assertEqual(self.product.discount_percentage, Decimal("10"))

    def test_collection_relationships_avoid_joined_row_multiplication(self):
        self.assertEqual(Product.media_items.property.lazy, "selectin")
        self.assertEqual(Order.items.property.lazy, "selectin")

    def test_product_listing_uses_constant_query_count(self):
        second_product = Product(
            name="Second product",
            product_description="Another description",
            price=Decimal("8.00"),
            available=False,
            category_id=self.product.category_id,
            created_by_user_id=self.admin.id,
            status=EntityStatus.ACTIVE,
            discount_percentage=Decimal("0"),
        )
        self.db.add(second_product)
        self.db.flush()
        self._add_product_media(second_product, "second")
        self.db.commit()
        self.db.expire_all()

        statements = []

        def record_statement(_connection, _cursor, statement, _parameters, _context, _executemany):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(self.engine, "before_cursor_execute", record_statement)
        try:
            response = list_products(
                page=1,
                per_page=20,
                search=None,
                category_id=None,
                min_price=None,
                max_price=None,
                special="all",
                sort="default",
                product_ids=None,
                db=self.db,
            )
        finally:
            event.remove(self.engine, "before_cursor_execute", record_statement)

        self.assertEqual(len(response.items), 2)
        # The page now includes its filtered count and global catalogue facets,
        # while media and ingredient relationships remain batch-loaded.
        self.assertLessEqual(len(statements), 9)
        self.assertEqual(len(_unavailable_product_rows(self.db, 2)), 2)
        self.assertEqual(len(_popular_product_rows(self.db, 2)), 2)

    def test_sales_aggregates_preserve_totals_without_loading_orm_graphs(self):
        ordered_at = datetime.utcnow().replace(microsecond=0)
        order = Order(
            customer_id=self.customer.id,
            ordered_at=ordered_at,
            state=OrderState.CONFIRMED,
            payment_method=PaymentMethod.COUNTER,
            payment_status=PaymentStatus.PAID,
            subtotal=Decimal("30.00"),
            total=Decimal("30.00"),
        )
        self.db.add(order)
        self.db.flush()
        self.db.add_all([
            OrderProduct(
                order_id=order.id,
                product_id=self.product.id,
                quantity=1,
                unit_price=Decimal("10.00"),
                product_name_snapshot=self.product.name,
            ),
            OrderProduct(
                order_id=order.id,
                product_id=self.product.id,
                quantity=2,
                unit_price=Decimal("5.00"),
                product_name_snapshot=self.product.name,
            ),
        ])
        self.db.commit()

        start = ordered_at - timedelta(hours=1)
        end = ordered_at + timedelta(hours=1)
        day_key = ordered_at.strftime("%Y-%m-%d")
        self.assertEqual(
            _sales_aggregate_rows(self.db, start, end, "day"),
            [(day_key, 30.0, 3, 1)],
        )
        self.assertEqual(
            _product_sales_aggregate_rows(self.db, start, end, "day", self.product.id),
            [(day_key, 20.0, 3, 2, 1)],
        )
        dashboard = _build_dashboard_sales_graphs(self.db)
        hour_key = ordered_at.strftime("%Y-%m-%d %H:00")
        hour = next(point for point in dashboard.by_hour if point.period == hour_key)
        self.assertEqual((hour.total_sales, hour.quantity_sold, hour.order_count), (30.0, 3, 1))


if __name__ == "__main__":
    unittest.main()
