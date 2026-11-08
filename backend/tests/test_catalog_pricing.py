from decimal import Decimal
import unittest
from sqlalchemy import func, select
from tests import test_endpoint_smoke as smoke
from models import Product, ProductPricingOption, ProductCustomizationOption


class CatalogPricingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = smoke.EndpointSmokeTests
        cls.fixture.setUpClass()
        cls.client = cls.fixture.client
        cls.headers = {'Authorization': 'Bearer admin-smoke-token'}

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def create(self, **options):
        response = self.client.post('/admin/products', headers=self.headers, json={
            'name': 'Pricing fixture', 'price': 9.5, 'category_id': self.fixture.category_id, **options,
        })
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def update(self, item, **changes):
        return self.client.put(f'/admin/products/{item["product_id"]}', headers=self.headers, json=changes)

    def public(self, item, locale='pt-PT'):
        response = self.client.get(f'/products/{item["product_id"]}', params={'locale': locale})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_batch_option_loading_has_no_per_product_query_growth(self):
        from sqlalchemy import event
        def add():
            self.create(name="Option batch fixture", portions=[{"label": "3 peças", "price": 8.5, "translations": {"en-GB": {"name": "3 pieces"}}}])
        def measure():
            statements = []
            def record(_connection, _cursor, statement, _parameters, _context, _executemany):
                if statement.lstrip().upper().startswith("SELECT"):
                    statements.append(statement)
            event.listen(self.fixture.engine, "before_cursor_execute", record)
            try:
                result = self.client.get('/products/', params={"search": "Option batch fixture", "per_page": 20, "locale": "en-GB"})
                self.assertEqual(result.status_code, 200, result.text)
                return len(statements), result.json()
            finally:
                event.remove(self.fixture.engine, "before_cursor_execute", record)
        add()
        small, _ = measure()
        for _ in range(10):
            add()
        large, page = measure()
        self.assertEqual(len(page["items"]), 11)
        self.assertTrue(all(item["portions"][0]["label"] == "3 pieces" for item in page["items"]))
        self.assertLessEqual(large, small + 1)
        self.assertLessEqual(large, 11)

    def test_create_portions_extras_and_decimal_accuracy(self):
        item = self.create(portions=[{'label': '3 peças', 'price': '8.50'}, {'label': '6 peças', 'price': '15.00'}], extras=[
            {'label': 'Batata-doce', 'price_delta': '1.00', 'type': 'replacement'},
            {'label': 'Queijo', 'price_delta': '1.50', 'type': 'addon'}, {'label': 'Molho', 'price_delta': 0},
        ])
        self.assertEqual(item['price'], 9.5)
        data = self.public(item)
        self.assertEqual(data['effective_starting_price'], 8.5)
        self.assertEqual(data['price'], 8.5)
        self.assertEqual([x['type'] for x in data['extras']], ['replacement', 'addon', 'addon'])
        with self.fixture.Session() as db:
            values = db.scalars(select(ProductPricingOption.price).where(ProductPricingOption.product_id == item['product_id']).order_by(ProductPricingOption.id)).all()
            self.assertEqual(values, list(map(Decimal, ['8.50', '15.00', '1.00', '1.50', '0.00'])))

    def test_edit_delete_reorder_portions_and_extras_preserving_ids(self):
        item = self.create(portions=[{'label': 'Small', 'price': 8.5}, {'label': 'Large', 'price': 15}], extras=[{'label': 'Cheese', 'price_delta': 1.5}, {'label': 'Sauce', 'price_delta': 0.75}])
        small, large = item['portions']; cheese, sauce = item['extras']
        result = self.update(item, portions=[{**large, 'price': '14.99', 'display_order': 0}, {**small, 'display_order': 1}], extras=[{**sauce, 'display_order': 0}, {**cheese, 'type': 'replacement', 'display_order': 1}])
        self.assertEqual(result.status_code, 200, result.text)
        data = result.json()
        self.assertEqual([x['id'] for x in data['portions']], [large['id'], small['id']])
        self.assertEqual(data['portions'][0]['price'], 14.99)
        self.assertEqual([x['id'] for x in data['extras']], [sauce['id'], cheese['id']])
        self.assertEqual(data['extras'][1]['type'], 'replacement')
        self.assertEqual(self.update(item, portions=[{**small, 'display_order': 0}], extras=[]).status_code, 200)
        self.assertEqual(len(self.public(item)['portions']), 1)
        self.assertEqual(self.public(item)['extras'], [])
        self.assertEqual(self.update(item, portions=[]).status_code, 200)
        self.assertEqual(self.public(item)['price'], 9.5)

    def test_unavailable_portions_and_zero_price(self):
        item = self.create(portions=[{'label': 'Small', 'price': 1, 'is_available': False}, {'label': 'Large', 'price': 15}])
        self.assertEqual(self.public(item)['price'], 15)
        result = self.update(item, portions=[{**x, 'is_available': False} for x in item['portions']])
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()['effective_available'])
        data = self.public(item)
        self.assertFalse(data['available']); self.assertIsNone(data['price'])
        self.assertIn('portions', data['unavailable_reason'])
        self.assertEqual(len(data['portions']), 2)
        self.assertEqual(self.update(item, portions=[{'label': 'Free', 'price': 0}]).status_code, 200)
        self.assertEqual(self.public(item)['price'], 0)

    def test_legacy_discount_and_omitted_options(self):
        item = self.create(price=10, discount_percentage=20)
        self.assertEqual(self.public(item)['price'], 8)
        self.assertEqual(self.update(item, portions=[{'label': 'Serving', 'price': 9}], extras=[{'label': 'Extra', 'price_delta': 99}]).status_code, 200)
        self.assertEqual(self.public(item)['price'], 9)
        self.assertEqual(self.update(item, name='Renamed').json()['portions'][0]['price'], 9)

    def test_filters_sort_facets_pagination(self):
        cheap = self.create(name='Price sorting fixture', price=99, portions=[{'label': 'Three', 'price': 8.5}])
        expensive = self.create(name='Price sorting fixture', price=2, portions=[{'label': 'Unavailable', 'price': 1, 'is_available': False}, {'label': 'Available', 'price': 18}])
        params = {'search': 'Price sorting fixture', 'sort': 'price_asc', 'per_page': 1}
        first = self.client.get('/products/', params=params).json()
        second = self.client.get('/products/', params={**params, 'page': 2}).json()
        self.assertEqual(first['total'], 2)
        self.assertEqual(first['items'][0]['id'], cheap['product_id'])
        self.assertEqual(second['items'][0]['id'], expensive['product_id'])
        descending = self.client.get('/products/', params={**params, 'sort': 'price_desc'}).json()
        self.assertEqual(descending['items'][0]['id'], expensive['product_id'])
        filtered = self.client.get('/products/', params={**params, 'min_price': 8, 'max_price': 9}).json()
        self.assertEqual(filtered['total'], 1)
        self.assertEqual(filtered['items'][0]['id'], cheap['product_id'])
        admin_filtered = self.client.get('/admin/products', headers=self.headers, params={"name": "Price sorting fixture", "min_price": 8, "max_price": 9}).json()
        self.assertEqual(admin_filtered["total"], 1)
        self.assertEqual(admin_filtered["items"][0]["product_id"], cheap["product_id"])
        with self.fixture.Session() as db:
            from services.catalog_pricing import starting_price_expression
            expected = db.scalar(select(func.max(starting_price_expression())).where(Product.status == 'active', Product.deleted_at.is_(None)))
        self.assertEqual(first['facets']['max_price'], float(expected))

    def test_translation_fallback_and_clear(self):
        item = self.create(portions=[{'label': '3 peças', 'price': 8.5, 'translations': {'en-GB': {'name': '3 pieces'}}}], extras=[{'label': 'Batata-doce', 'price_delta': 1, 'type': 'replacement', 'translations': {'de-DE': {'name': 'Süßkartoffel'}}}])
        self.assertEqual(self.public(item, 'en-GB')['portions'][0]['label'], '3 pieces')
        self.assertEqual(self.public(item, 'de-DE')['portions'][0]['label'], '3 peças')
        self.assertEqual(self.public(item, 'de-DE')['extras'][0]['label'], 'Süßkartoffel')
        self.assertEqual(self.update(item, portions=[{**item['portions'][0], 'translations': {'en-GB': None}}]).status_code, 200)
        self.assertEqual(self.public(item, 'en-GB')['portions'][0]['label'], '3 peças')

    def test_validation_rejects_malformed_options_without_partial_writes(self):
        item = self.create(portions=[{'label': 'Original', 'price': 10}])
        invalid = [
            {'portions': [{'label': ' ', 'price': 1}]}, {'portions': [{'label': 'A', 'price': -1}]},
            {'portions': [{'label': 'A', 'price': '1.001'}]}, {'portions': [{'label': 'A', 'price': 'NaN'}]},
            {'portions': [{'label': 'A', 'price': 1, 'display_order': -1}]},
            {'portions': [{'label': 'A', 'price': 1}, {'label': 'a', 'price': 2}]},
            {'portions': [{'label': 'A', 'price': 1, 'display_order': 0}, {'label': 'B', 'price': 2, 'display_order': 0}]},
            {'extras': [{'label': 'Sauce', 'price_delta': 1, 'type': 'purchase'}]}, {'extras': [{'label': 'Sauce', 'price_delta': -1}]},
            {'portions': [{'label': 'A', 'price': 1, 'unexpected': True}]},
            {'portions': [{'label': 'A', 'price': 1, 'translations': {'fr-FR': {'name': 'Trois'}}}]},
        ]
        for options in invalid:
            with self.subTest(options=options):
                result = self.update(item, name='Must roll back', **options)
                self.assertEqual(result.status_code, 422, result.text)
                self.assertEqual(self.public(item)['name'], item['name'])
                self.assertEqual(self.public(item)['portions'][0]['label'], 'Original')

    def test_foreign_ids_and_role_guards(self):
        other = self.create(portions=[{'label': 'Other', 'price': 2}])
        item = self.create(extras=[{'label': 'Existing', 'price_delta': 1}])
        result = self.update(item, name='Must roll back', portions=[{'id': other['portions'][0]['id'], 'label': 'Wrong owner', 'price': 3}], extras=[])
        self.assertEqual(result.status_code, 422, result.text)
        self.assertEqual(self.public(item)['name'], item['name'])
        self.assertEqual(len(self.public(item)['extras']), 1)
        for token in ('customer-smoke-token', 'chef-smoke-token', 'waiter-smoke-token'):
            response = self.client.put(f'/admin/products/{item["product_id"]}', headers={'Authorization': f'Bearer {token}'}, json={'portions': []})
            self.assertEqual(response.status_code, 403)

    def test_no_legacy_purchase_options_created(self):
        with self.fixture.Session() as db:
            before = db.scalars(select(ProductCustomizationOption.id)).all()
        self.create(portions=[{'label': 'Serving', 'price': 0}], extras=[{'label': 'Sauce', 'price_delta': 0}])
        with self.fixture.Session() as db:
            self.assertEqual(db.scalars(select(ProductCustomizationOption.id)).all(), before)
