"""Fixed finder HTTP contract and recipe-based ranking on an isolated catalog."""
import unittest
from unittest.mock import patch
from sqlalchemy import select, update
from tests import test_endpoint_smoke as smoke
from core.config import settings
from models import Category, Product, ProductIngredient, Ingredient, ProductPricingOption
from meal_finder_models import MealFinderSettings, ProductMealFinder
from schemas.enums import EntityStatus, IngredientType
from scripts.initialize_meal_finder import initialize


class MealFinderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = smoke.EndpointSmokeTests
        cls.fixture.setUpClass()
        cls.client = cls.fixture.client
        cls.owner = {'Authorization': 'Bearer admin-smoke-token'}
        cls.manager = {'Authorization': 'Bearer manager-smoke-token'}

    @classmethod
    def tearDownClass(cls):
        cls.fixture.tearDownClass()

    def setUp(self):
        self.rate = patch.object(settings, 'rate_limit_enabled', False)
        self.rate.start()
        self.ids = {}
        with self.fixture.Session() as db:
            db.execute(update(Product).values(available=False))
            categories = {}
            for name in ['Pratos Principais','Tacos','Entradas','Extras','Sobremesas','Bebidas','Unknown']:
                row=Category(category_name=name,admin_id=self.fixture.admin_id,status=EntityStatus.ACTIVE)
                db.add(row);db.flush();categories[name]=row.id
            catalog = [
                ('Bonefree Cheeseburger','Beyond Meat, molho BBQ e batata frita.','Pratos Principais'),
                ('Big Poppa','Hambúrguer de feijão preto e queijo fumado.','Pratos Principais'),
                ('Bonefree Pasta','Massa com tomate e queijo creme.','Pratos Principais'),
                ('Chickpeas Tikka Masala','Grão de bico, legumes e leite de côco.','Pratos Principais'),
                ('Burritinho','Feijão preto, pimentos e abacate.','Pratos Principais'),
                ('Baja California','Moving Mountains fritos, coleslaw e maionese de chipotle.','Tacos'),
                ('Lentil Taco','Estufado de lentinhas fumadas com legumes.','Tacos'),
                ('Crispy Cauliflower','Couve-flor crocante e abacate.','Tacos'),
                ('Vegan Momos','Dumplings fritos com Beyond Meat.','Entradas'),
                ('Latino Loaded Nachos','Tortilha chips, guacamole e queijo fumado.','Entradas'),
                ('Soup of the Day','Sopa caseira do dia.','Entradas'),
                ('Fried Onion Rings','Aros de cebola fritos com molho BBQ.','Entradas'),
                ('Fries','Batatas fritas.','Extras'),
                ('Tiramisu','Queijo creme.','Sobremesas'),
                ('Cocktail','BBQ, beans, tofu.','Bebidas'),
                ('Unknown dish','Tofu frito.','Unknown'),
            ]
            for name,description,category in catalog:
                product=Product(name=name,product_description=description,price=12,category_id=categories[category],admin_id=self.fixture.admin_id,status=EntityStatus.ACTIVE,available=True,gluten_free=name=='Chickpeas Tikka Masala')
                db.add(product);db.flush();self.ids[name]=product.id
            db.commit()
        self.assertEqual(self.client.put('/admin/meal-finder/settings',headers=self.owner,json={'enabled':True}).status_code,200)

    def tearDown(self):
        self.rate.stop()

    def recommend(self, course='main', style='creamy', ingredient='legumes', **changes):
        body=dict(version=2,answers=dict(course=course,style=style,ingredient=ingredient),locale='en-GB')
        body.update(changes)
        return self.client.post('/meal-finder/recommendations',json=body)

    def test_fixed_three_questions_and_only_toggle(self):
        config=self.client.get('/meal-finder/config')
        self.assertEqual(config.status_code,200)
        self.assertEqual(config.json()['version'],2)
        self.assertEqual([q['id'] for q in config.json()['questions']],['course','style','ingredient'])
        for question in config.json()['questions']:
            self.assertEqual(set(question['label']),{'pt','en','de'})
        self.assertEqual(self.client.get('/admin/meal-finder/settings',headers=self.manager).json(),{'enabled':True})
        self.assertEqual(self.client.put('/admin/meal-finder/settings',headers=self.owner,json={}).status_code,422)
        for extra in [{'questions':[]},{'intro':{}},{'alternatives':9},{'enabled':'yes'}]:
            response=self.client.put('/admin/meal-finder/settings',headers=self.owner,json={'enabled':True,**extra})
            self.assertEqual(response.status_code,422,response.text)
        for path,method in [('/products','get'),('/products/1','patch'),('/baseline','post'),('/preview','post')]:
            self.assertEqual(getattr(self.client,method)('/admin/meal-finder'+path,headers=self.owner).status_code,404)

    def test_answers_meaningfully_change_the_winner(self):
        for course,style,ingredient,expected in [
            ('main','creamy','legumes','Chickpeas Tikka Masala'),
            ('main','smoky','plant_protein','Bonefree Cheeseburger'),
            ('tacos','smoky','legumes','Lentil Taco'),
            ('tacos','crispy','vegetables','Crispy Cauliflower'),
            ('starter','crispy','plant_protein','Vegan Momos'),
        ]:
            with self.subTest(expected=expected):
                response=self.recommend(course,style,ingredient)
                self.assertEqual(response.status_code,200,response.text)
                self.assertEqual(response.json()['best']['product']['name'],expected)
                self.assertEqual(response.json()['best']['reasons'],['course','style','ingredient'])
                self.assertFalse(response.json()['closest'])

    def test_course_is_hard_constraint_and_other_courses_never_fill_results(self):
        for course,category in [('main','Pratos Principais'),('tacos','Tacos'),('starter','Entradas')]:
            data=self.recommend(course,'any','any').json()
            matches=[data['best'],*data['alternatives']]
            self.assertLessEqual(len(matches),3)
            self.assertTrue(all(m['product']['category']==category for m in matches))
            self.assertEqual(len({m['product']['id'] for m in matches}),len(matches))
            self.assertNotIn('extras',data)
            self.assertNotIn('group_selection',data)
        with self.fixture.Session() as db:
            db.execute(update(Product).where(Product.id.in_([self.ids[n] for n in ['Baja California','Lentil Taco','Crispy Cauliflower']])).values(available=False));db.commit()
        data=self.recommend('tacos').json()
        self.assertIsNone(data['best'])
        self.assertFalse(data['alternatives'])

    def test_stable_ranking_ignores_legacy_config_and_metadata(self):
        before=self.recommend().json()
        with self.fixture.Session() as db:
            row=db.get(MealFinderSettings,1)
            row.config={**row.config,'questions':[],'alternatives':100,'extras_enabled':True}
            db.add(ProductMealFinder(product_id=self.ids['Chickpeas Tikka Masala'],attributes={'enabled':False,'priority':0}))
            db.add(ProductMealFinder(product_id=self.ids['Bonefree Cheeseburger'],attributes={'enabled':True,'priority':10,'tastes':['fresh']}))
            db.commit()
            self.assertFalse(initialize(db))
        self.assertEqual(before,self.recommend().json())
        self.assertEqual(before,self.recommend(locale='de-DE').json())

    def test_inactive_deleted_alcoholic_and_unavailable_portions_excluded(self):
        for mutation in ['inactive','deleted','alcohol','unavailable','portion']:
            with self.subTest(mutation=mutation):
                with self.fixture.Session() as db:
                    p=db.get(Product,self.ids['Chickpeas Tikka Masala'])
                    if mutation=='inactive':p.status=EntityStatus.INACTIVE
                    if mutation=='deleted':
                        from datetime import datetime
                        p.status=EntityStatus.ACTIVE;p.deleted_at=datetime(2026,1,1)
                    if mutation=='alcohol':p.deleted_at=None;p.contains_alcohol=True
                    if mutation=='unavailable':p.contains_alcohol=False;p.available=False
                    if mutation=='portion':
                        p.available=True;db.add(ProductPricingOption(product_id=p.id,kind='portion',label='Bowl',price=18,is_available=False,display_order=0))
                    db.commit()
                data=self.recommend().json()
                self.assertNotIn(self.ids['Chickpeas Tikka Masala'],[m['product']['id'] for m in [data['best'],*data['alternatives']]])

    def test_live_prices_base_availability_and_dietary_constraints(self):
        with self.fixture.Session() as db:
            db.add(ProductPricingOption(product_id=self.ids['Chickpeas Tikka Masala'],kind='portion',label='Bowl',price=18,is_available=True,display_order=0));db.commit()
        data=self.recommend(restrictions=['gluten_free']).json()
        self.assertEqual(data['best']['product']['price'],18)
        self.assertEqual(data['best']['product']['portions'][0]['label'],'Bowl')
        self.assertEqual(data['alternatives'],[])
        with self.fixture.Session() as db:
            ingredient=Ingredient(name='Unavailable base',type=IngredientType.BASE,status=EntityStatus.ACTIVE,available=False)
            db.add(ingredient);db.flush()
            db.add(ProductIngredient(product_id=self.ids['Chickpeas Tikka Masala'],ingredient_id=ingredient.id,quantity='100g'));db.commit()
        self.assertIsNone(self.recommend(restrictions=['gluten_free']).json()['best'])
        self.assertEqual(self.recommend(restrictions=['soy_free']).status_code,422)

    def test_toggle_preserves_history_and_version_and_has_no_preview_bypass(self):
        with self.fixture.Session() as db:
            row=db.get(MealFinderSettings,1);row.config={**row.config,'historical_note':'keep'};db.commit()
        off=self.client.put('/admin/meal-finder/settings',headers=self.manager,json={'enabled':False})
        self.assertEqual(off.json(),{'enabled':False})
        self.assertEqual(self.recommend().status_code,503)
        self.assertFalse(self.client.get('/meal-finder/config').json()['enabled'])
        self.assertEqual(self.client.get('/meal-finder/config').json()['version'],2)
        with self.fixture.Session() as db:
            self.assertEqual(db.get(MealFinderSettings,1).config['historical_note'],'keep')
        self.client.put('/admin/meal-finder/settings',headers=self.owner,json={'enabled':True})
        self.assertEqual(self.recommend().status_code,200)

    def test_validation_authorization_limits_and_cache_headers(self):
        for headers in [{},{'Authorization':'Bearer chef-smoke-token'}]:
            self.assertIn(self.client.get('/admin/meal-finder/settings',headers=headers).status_code,[401,403])
            self.assertIn(self.client.put('/admin/meal-finder/settings',headers=headers,json={'enabled':False}).status_code,[401,403])
        self.assertEqual(self.recommend(version=1).status_code,409)
        self.assertEqual(self.recommend(answers={'course':'dessert','style':'any','ingredient':'any'}).status_code,422)
        self.assertEqual(self.recommend(answers={'course':'main','style':'any'}).status_code,422)
        self.assertEqual(self.recommend(answers={'course':'main','style':'any','ingredient':'any','extra':'dessert'}).status_code,422)
        response=self.client.post('/meal-finder/recommendations',content='x'*9000,headers={'Content-Type':'application/json'})
        self.assertEqual(response.status_code,413)
        for response in [response,self.client.get('/meal-finder/config'),self.client.get('/admin/meal-finder/settings',headers=self.owner),self.recommend()]:
            self.assertIn('no-store',response.headers['Cache-Control'])
