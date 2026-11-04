import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import sessionmaker

from database import Base
from models import Category, Ingredient, Product, ProductTranslation, CategoryTranslation, IngredientTranslation, User
from scripts import translate_catalog
from services.catalog_translation_bundle import Bundle, GLOSSARY_PATH, Proposal, import_bundle, propose


class CatalogTranslationBundleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            user = User(name="Owner", email="owner@example.test", password="unused", role="owner", status="active")
            db.add(user)
            db.flush()
            category = Category(category_name="Entradas", category_description="Entradas e petiscos para começar bem", admin_id=user.id)
            ingredient = Ingredient(name="Alface", type="normal")
            db.add_all([category, ingredient])
            db.flush()
            product = Product(name="Batatas Fritas", product_description="Batatas fritas.", category_id=category.id, admin_id=user.id, price=7, available=False, menu_tags="Original", total_calories=100)
            db.add(product)
            db.commit()
            self.product_id = product.id

    def tearDown(self):
        self.engine.dispose()

    def test_proposals_use_source_only_and_keep_names_until_explicitly_applied(self):
        with self.sessions() as db:
            bundle = propose(db)
        product = next(e for e in bundle.entries if e.entity == "product")
        self.assertEqual(product.translations["en-GB"]["description"], "Fries.")
        self.assertEqual(product.translations["de-DE"]["description"], "Pommes frites.")
        self.assertEqual(product.translations["de-DE"]["name"], "Batatas Fritas")
        self.assertEqual(product.proposed_name_en, "Fries")
        self.assertEqual(len(bundle.entries), 3)
        # PostgreSQL rejects overlong text; validate the complete shipped glossary now.
        glossary = json.loads(GLOSSARY_PATH.read_text())
        for entity in ("product", "category", "ingredient"):
            for field, translations in glossary[entity].items():
                for source, pair in translations.items():
                    for value in pair:
                        Proposal(entity=entity, id=1, source={"name": "Name", **({"description": source} if entity != "ingredient" else {})}, translations={"en-GB": {field: value}})

    def test_dry_run_issues_only_selects_and_never_stages_writes(self):
        statements = []
        event.listen(self.engine, "before_cursor_execute", lambda _c, _u, statement, *_a: statements.append(statement))
        with self.sessions() as db:
            bundle = propose(db)
            statements.clear()
            report = import_bundle(db, bundle, apply_product_names=True)
            self.assertGreater(report["created_rows"], 0)
            self.assertEqual(report["renamed_products"], 1)
            self.assertFalse(db.new)
            self.assertFalse(db.dirty)
            self.assertTrue(all(s.lstrip().upper().startswith("SELECT") for s in statements))
            self.assertEqual(len(statements), 6)
            db.commit()  # Even committing a preview must not write.
        with self.sessions() as db:
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 0)
            self.assertEqual(db.scalar(select(Product.name)), "Batatas Fritas")

    def test_import_is_idempotent_and_preserves_source_and_other_fields(self):
        with self.sessions() as db:
            bundle = propose(db)
            import_bundle(db, bundle, apply=True)
            db.commit()
        with self.sessions() as db:
            report = import_bundle(db, bundle, apply=True)
            db.commit()
            self.assertEqual(report["created_rows"], 0)
            self.assertEqual(report["updated_fields"], 0)
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(CategoryTranslation)), 2)
            self.assertEqual(db.scalar(select(func.count()).select_from(IngredientTranslation)), 2)
            product = db.scalar(select(Product))
            self.assertEqual((product.name, product.product_description, product.price, product.available, product.menu_tags, product.total_calories), ("Batatas Fritas", "Batatas fritas.", 7, False, "Original", 100))

    def test_preserves_existing_nonblank_fields_fills_gaps_and_overwrites_only_explicitly(self):
        with self.sessions() as db:
            db.add(ProductTranslation(product_id=self.product_id, locale="en-GB", description="Handwritten", menu_tags="Keep tags"))
            db.commit()
            bundle = propose(db)
            report = import_bundle(db, bundle, apply=True)
            db.commit()
            row = db.scalar(select(ProductTranslation).where(ProductTranslation.locale == "en-GB"))
            self.assertEqual((row.name, row.description, row.menu_tags), ("Batatas Fritas", "Handwritten", "Keep tags"))
            self.assertEqual(report["preserved_fields"], 1)
            import_bundle(db, bundle, apply=True, overwrite=True)
            db.commit()
            self.assertEqual((row.description, row.menu_tags), ("Fries.", "Keep tags"))

    def test_product_names_require_explicit_option_and_conflicting_overrides_require_overwrite(self):
        with self.sessions() as db:
            bundle = propose(db)
            import_bundle(db, bundle, apply=True, apply_product_names=True)
            db.commit()
        with self.sessions() as db:
            self.assertEqual(db.scalar(select(Product.name)), "Fries")
            self.assertEqual(db.scalars(select(ProductTranslation.name)).all(), ["Fries", "Fries"])
            self.assertEqual(import_bundle(db, bundle, apply=True, apply_product_names=True)["updated_fields"], 0)
            db.commit()
            row = db.scalar(select(ProductTranslation).where(ProductTranslation.locale == "de-DE"))
            row.name = "Different name"
            db.commit()
            with self.assertRaisesRegex(ValueError, "existing name override"):
                import_bundle(db, bundle, apply=True, apply_product_names=True)
            db.rollback()
            import_bundle(db, bundle, apply=True, overwrite=True, apply_product_names=True)
            db.commit()
            self.assertEqual(db.scalars(select(ProductTranslation.name)).all(), ["Fries", "Fries"])

    def test_stale_sources_missing_ids_and_duplicate_entries_rejected_without_writes(self):
        with self.sessions() as db:
            bundle = propose(db)
            with self.assertRaises(ValidationError):
                Bundle(entries=[bundle.entries[0], bundle.entries[0]])
            for field, value in (("id", 999), ("source", {"name": "Batatas Fritas", "description": "Old text"})):
                bad = bundle.model_copy(deep=True)
                setattr(bad.entries[0], field, value)
                with self.assertRaisesRegex(ValueError, "Source mismatch"):
                    import_bundle(db, bad, apply=True)
                self.assertFalse(db.new)
                self.assertFalse(db.dirty)
            self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 0)

    def test_invalid_locales_fields_lengths_and_dish_name_translation_rejected(self):
        with self.sessions() as db:
            data = propose(db).model_dump()
        for values in ({"fr-FR": {"name": "No"}}, {"en-GB": {"description": "x" * 256}}, {"en-GB": {"allergen": "none"}}, {"de-DE": {"name": "Pommes frites"}}, {"en-GB": {"menu_tags": "New tags"}}):
            invalid = json.loads(json.dumps(data))
            invalid["entries"][0]["translations"] = values
            with self.assertRaises(ValidationError):
                Bundle.model_validate(invalid)

    def test_unknown_source_text_is_flagged_and_not_invented(self):
        with self.sessions() as db:
            product = db.scalar(select(Product))
            product.product_description = "New dish with unspecified recipe."
            db.commit()
            entry = propose(db).entries[0]
            self.assertIsNone(entry.translations["en-GB"]["description"])
            self.assertTrue(any("Untranslated description" in note for note in entry.notes))

    def test_failed_cli_report_write_rolls_back_the_import(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.json"
            with self.sessions() as db:
                path.write_text(propose(db).model_dump_json())
            with patch.object(translate_catalog, "SessionLocal", self.sessions), patch.object(translate_catalog, "settings", SimpleNamespace(environment="test")), patch("sys.argv", ["translate_catalog", "import", "--file", str(path), "--apply", "--report", str(Path(directory) / "absent" / "report.json")]):
                with self.assertRaisesRegex(SystemExit, "failed"):
                    translate_catalog.main()
            with self.sessions() as db:
                self.assertEqual(db.scalar(select(func.count()).select_from(ProductTranslation)), 0)

    def test_production_apply_requires_explicit_acknowledgement(self):
        with patch.object(translate_catalog, "SessionLocal", self.sessions), patch.object(translate_catalog, "settings", SimpleNamespace(environment="production")), patch("sys.argv", ["translate_catalog", "import", "--file", "/missing.json", "--apply"]):
            with self.assertRaisesRegex(SystemExit, "Production writes require"):
                translate_catalog.main()


if __name__ == "__main__":
    unittest.main()
