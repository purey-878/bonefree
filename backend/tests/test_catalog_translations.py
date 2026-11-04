from datetime import timedelta
from decimal import Decimal
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import create_app
from core.redis import InMemoryRedis
from database import Base, get_db
from models import Category, Ingredient, Product, ProductIngredient, ProductTranslation, Session, User
from schemas.enums import EntityStatus, IngredientType, UserRole, UserStatus
from services.auth_service import hash_session_token
from utils.datetime_utils import naive_utc_now


class CatalogTranslationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(run_startup_tasks=False, uploads_dir=Path(self.temp.name))
        def override_db():
            with self.sessions() as db:
                yield db
        self.app.dependency_overrides[get_db] = override_db
        self.app.state.redis = InMemoryRedis()
        self.client = TestClient(self.app, raise_server_exceptions=False)
        with self.sessions() as db:
            for role in (UserRole.OWNER, UserRole.MANAGER, UserRole.WAITER, UserRole.CHEF, UserRole.CLIENT):
                user = User(name=role.value, email=f"{role.value}@example.test", password="hash", role=role, status=UserStatus.ACTIVE)
                db.add(user)
                db.flush()
                db.add(Session(user_id=user.id, token_hash=hash_session_token(role.value), expires_at=naive_utc_now() + timedelta(hours=1), last_seen_at=naive_utc_now(), revoked=False))
                if role == UserRole.OWNER:
                    self.owner_id = user.id
            category = Category(category_name="Pratos", category_description="Originais", admin_id=self.owner_id, status=EntityStatus.ACTIVE)
            ingredient = Ingredient(name="Cogumelo", type=IngredientType.NORMAL, available=True, status=EntityStatus.ACTIVE, calories_per_gram=Decimal("2"))
            db.add_all([category, ingredient])
            db.flush()
            self.category_id, self.ingredient_id = category.id, ingredient.id
            self.ids = []
            for name in ("Cogumelos", "Abacate"):
                product = Product(name=name, product_description="Prato portugues", menu_tags="Vegan, Caseiro", price=Decimal("12.50"), available=True, category_id=category.id, admin_id=self.owner_id, sold=0, status=EntityStatus.ACTIVE, customizable=False, featured=False, discount_percentage=0, gluten_free=True, contains_alcohol=False)
                db.add(product)
                db.flush()
                self.ids.append(product.id)
                db.add(ProductIngredient(product_id=product.id, ingredient_id=ingredient.id, included_by_default=True, removable=False, substitutable=False, quantity="10g"))
            db.commit()
        self.product_id = self.ids[0]
        self.path = f"/admin/products/{self.product_id}"

    def tearDown(self):
        self.client.close()
        self.engine.dispose()
        self.temp.cleanup()

    def put(self, path, payload, role="owner"):
        return self.client.put(path, json=payload, headers={"Authorization": f"Bearer {role}"})

    def product(self, locale="pt-PT"):
        response = self.client.get(f"/products/{self.product_id}", params={"locale": locale})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_complete_and_partial_translations_preserve_originals_and_shared_data(self):
        original = self.product()
        response = self.put(self.path, {"translations": {"en-GB": {"name": "Mushrooms", "description": "Fresh mushrooms", "menu_tags": "Homemade, Vegan"}, "de-DE": {"name": "Pilze"}}})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["name"], "Cogumelos")
        self.assertEqual(self.put(f"/admin/categories/{self.category_id}", {"translations": {"en-GB": {"name": "Dishes"}}}).status_code, 200)
        self.assertEqual(self.put(f"/admin/ingredients/{self.ingredient_id}", {"translations": {"en-GB": {"name": "Mushroom"}}}).status_code, 200)
        english = self.product("en-GB")
        self.assertEqual((english["name"], english["description"], english["category"], english["ingredients"][0]["name"]), ("Mushrooms", "Fresh mushrooms", "Dishes", "Mushroom"))
        self.assertEqual(english["tags"], ["Homemade", "Vegan"])
        for field in ("id", "id_display", "category_id", "price", "media", "total_calories", "available", "gluten_free"):
            self.assertEqual(english[field], original[field])
        self.assertEqual(self.product(), original)
        self.assertEqual(self.product("de-DE")["description"], original["description"])
        self.assertEqual(self.client.get("/products/", params={"locale": "en-GB"}).json()["facets"]["categories"][0]["name"], "Dishes")

    def test_omitted_maps_and_locales_are_preserved_and_supplied_locales_replaced_or_deleted(self):
        self.put(self.path, {"translations": {"en-GB": {"name": "Mushrooms"}, "de-DE": {"name": "Pilze"}}})
        response = self.put(self.path, {"name": "Cogumelos frescos"})
        self.assertEqual(response.json()["translations"]["en-GB"]["name"], "Mushrooms")
        response = self.put(self.path, {"translations": {"en-GB": {"description": "  English only  ", "name": "  "}}})
        self.assertEqual(self.product("en-GB")["name"], "Cogumelos frescos")
        self.assertEqual(self.product("en-GB")["description"], "English only")
        self.assertIn("de-DE", response.json()["translations"])
        response = self.put(self.path, {"translations": {"en-GB": None}})
        self.assertNotIn("en-GB", response.json()["translations"])
        self.put(self.path, {"translations": {"de-DE": {"name": "  "}}})
        self.assertEqual(self.product("de-DE")["name"], "Cogumelos frescos")
        with self.sessions() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 0)

    def test_search_sort_and_pagination_use_displayed_text_and_originals(self):
        self.put(self.path, {"translations": {"en-GB": {"name": "Apple mushrooms", "description": "Woodland dish"}, "de-DE": {"name": "Pilze"}}})
        self.put(f"/admin/products/{self.ids[1]}", {"translations": {"en-GB": {"name": "Zesty avocado"}}})
        first = self.client.get("/products/", params={"locale": "en-GB", "sort": "name_asc", "per_page": 1}).json()
        second = self.client.get("/products/", params={"locale": "en-GB", "sort": "name_asc", "per_page": 1, "page": 2}).json()
        self.assertEqual((first["items"][0]["id"], second["items"][0]["id"]), tuple(self.ids))
        self.assertEqual((first["total"], first["total_pages"]), (2, 2))
        for search in ("mushrooms", "woodland", "Cogumelos", "portugues"):
            result = self.client.get("/products/", params={"locale": "en-GB", "search": search, "per_page": 1}).json()
            self.assertGreater(result["total"], 0)
            self.assertEqual(result["facets"]["total_products"], 2)
        self.assertEqual(self.client.get("/products/", params={"locale": "de-DE", "search": "mushrooms"}).json()["total"], 0)
        self.assertEqual(self.client.get("/products/", params={"locale": "en-GB", "search": "avocado", "max_price": 10}).json()["total"], 0)

    def test_invalid_locale_and_translation_validation_prevent_mutations(self):
        for path in ("/products/", f"/products/{self.product_id}"):
            self.assertEqual(self.client.get(path, params={"locale": "fr-FR"}).status_code, 422)
        for translations in ({"pt-PT": {"name": "No"}}, {"fr-FR": {"name": "No"}}, {"en-GB": {"name": "X" * 151}}, {"en-GB": {"unexpected": "No"}}):
            response = self.put(self.path, {"name": "Must not save", "translations": translations})
            self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.product()["name"], "Cogumelos")
        self.assertEqual(self.put(f"/admin/categories/{self.category_id}", {"translations": {"en-GB": {"name": "X" * 101}}}).status_code, 422)
        self.assertEqual(self.put(f"/admin/ingredients/{self.ingredient_id}", {"translations": {"en-GB": {"name": "X" * 121}}}).status_code, 422)

    def test_permissions_and_failed_save_rollback(self):
        for path in (self.path, f"/admin/categories/{self.category_id}", f"/admin/ingredients/{self.ingredient_id}"):
            for role in ("waiter", "chef", "client"):
                self.assertEqual(self.put(path, {"translations": {"en-GB": {"name": "Blocked"}}}, role).status_code, 403)
            response = self.put(path, {"translations": {"en-GB": {"name": "Allowed"}}}, "manager")
            self.assertEqual(response.status_code, 200, response.text)
        with patch("routers.admin.update_translations", side_effect=RuntimeError("Simulated save failure")):
            response = self.put(self.path, {"name": "Must roll back", "translations": {"en-GB": {"name": "Must not save"}}})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(self.product()["name"], "Cogumelos")
        self.assertEqual(self.product("en-GB")["name"], "Allowed")

    def test_translation_queries_are_bounded_as_page_size_grows(self):
        with self.sessions() as db:
            for index in range(12):
                product = Product(name=f"Produto {index}", product_description="Original", price=1, category_id=self.category_id, admin_id=self.owner_id, status=EntityStatus.ACTIVE)
                db.add(product)
                db.flush()
                db.add(ProductTranslation(product_id=product.id, locale="en-GB", name=f"Dish {index}"))
            db.commit()
        statements = []
        def record(_conn, _cursor, statement, _params, _context, _many):
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)
        event.listen(self.engine, "before_cursor_execute", record)
        try:
            for path, headers in (("/products/", {}), ("/admin/products", {"Authorization": "Bearer owner"})):
                counts = []
                for size in (1, 100):
                    statements.clear()
                    response = self.client.get(path, params={"locale": "en-GB", "per_page": size}, headers=headers)
                    self.assertEqual(response.status_code, 200, response.text)
                    counts.append(len(statements))
                self.assertLessEqual(counts[1], counts[0] + 2)
                self.assertLess(counts[1], 20)
        finally:
            event.remove(self.engine, "before_cursor_execute", record)

    def test_create_and_preserve_category_and_ingredient_translations(self):
        headers = {"Authorization": "Bearer owner"}
        category = self.client.post("/admin/categories", json={"category_name": "Bebidas", "translations": {"en-GB": {"name": "Drinks"}}}, headers=headers)
        self.assertEqual(category.status_code, 201, category.text)
        response = self.put(f'/admin/categories/{category.json()["category_id"]}', {"category_description": "Original description"})
        self.assertEqual(response.json()["translations"]["en-GB"]["name"], "Drinks")
        ingredient = self.client.post("/admin/ingredients", json={"name": "Lima", "translations": {"de-DE": {"name": "Limette"}}}, headers=headers)
        self.assertEqual(ingredient.status_code, 201, ingredient.text)
        ingredient_id = ingredient.json()["ingredient_id"]
        response = self.put(f"/admin/ingredients/{ingredient_id}", {"available": False})
        self.assertEqual(response.json()["translations"]["de-DE"]["name"], "Limette")
        self.assertEqual(response.json()["name"], "Lima")
        self.assertEqual(self.put(f"/admin/ingredients/{ingredient_id}", {"translations": {"de-DE": None}}).json()["translations"], {})
