from decimal import Decimal
import unittest
from sqlalchemy import select
from tests import test_endpoint_smoke as smoke
from models import Ingredient, Product, ProductIngredient
from services.catalog_nutrition import calorie_total_expression


class CatalogCalorieTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = smoke.EndpointSmokeTests
        cls.fixture.setUpClass()
        cls.client = cls.fixture.client
        cls.ids = {}
        with cls.fixture.Session() as db:
            ingredient = Ingredient(name="Calorie filter ingredient", calories_per_gram=Decimal('2'))
            db.add(ingredient)
            db.flush()
            for name, saved, quantity in [
                ('saved low', 200, '500g'), ('saved high', 700, '10g'),
                ('grams', None, '100 grams'), ('kilograms', None, '0,2 kg'),
                ('unitless', 0, '50'), ('unknown', None, None),
                ('invalid quantity', None, '2 pieces'), ('decimal', None, '.5 Kilograms'),
            ]:
                product = Product(name=f'Calorie fixture {name}', price=10, category_id=cls.fixture.category_id, admin_id=cls.fixture.admin_id, total_calories=saved)
                db.add(product)
                db.flush()
                cls.ids[name] = product.product_id
                if quantity is not None:
                    db.add(ProductIngredient(product_id=product.product_id, ingredient_id=ingredient.ingredient_id, quantity=quantity))
            db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def test_calorie_sort_orders_the_whole_catalog_before_pagination(self):
        params = {'search': 'Calorie fixture', 'sort': 'calories_asc', 'per_page': 3}
        pages = [self.client.get('/products/', params={**params, 'page': page}) for page in range(1, 4)]
        self.assertTrue(all(page.status_code == 200 for page in pages), [page.text for page in pages])
        data = pages[0].json()
        self.assertEqual(data['total'], 8)
        self.assertEqual(data['total_pages'], 3)
        items = [item for page in pages for item in page.json()['items']]
        self.assertEqual([item['total_calories'] for item in items], [100, 200, 200, 400, 700, 1000, None, None])
        self.assertEqual({item['id'] for item in items[-2:]}, {self.ids['unknown'], self.ids['invalid quantity']})
        descending = self.client.get('/products/', params={'search': 'Calorie fixture', 'sort': 'calories_desc'}).json()
        self.assertEqual([item['total_calories'] for item in descending['items']], [1000, 700, 400, 200, 200, 100, None, None])
        unfiltered = self.client.get('/products/', params={'search': 'Calorie fixture'}).json()
        self.assertEqual(unfiltered['facets'], data['facets'])
        self.assertEqual(descending['facets'], data['facets'])

    def test_matches_public_recipe_totals_including_units_and_saved_overrides(self):
        with self.fixture.Session() as db:
            totals = dict(db.execute(select(Product.product_id, calorie_total_expression()).where(Product.product_id.in_(list(self.ids.values())))).all())
        for name, product_id in self.ids.items():
            response = self.client.get(f'/products/{product_id}')
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(totals[product_id], response.json()['total_calories'], name)
        self.assertEqual(totals[self.ids['kilograms']], 400)
        self.assertEqual(totals[self.ids['decimal']], 1000)
        self.assertEqual(totals[self.ids['saved low']], 200)

    def test_calorie_sort_combines_with_existing_price_and_category_filters(self):
        response = self.client.get('/products/', params={'search': 'Calorie fixture', 'sort': 'calories_desc', 'max_price': 9, 'category_id': self.fixture.category_id})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['total'], 0)
