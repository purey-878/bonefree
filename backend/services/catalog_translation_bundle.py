"""Review bundles and transactional imports for existing catalog translation tables."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import bindparam, select
from sqlalchemy.orm import Session

from models import Category, CategoryTranslation, Ingredient, IngredientTranslation, Product, ProductTranslation
from services.catalog_translation import translation_maps
from schemas.catalog_translation import CategoryTranslationText, IngredientTranslationText, ProductTranslationText, TranslationLocale

LOCALES = ("en-GB", "de-DE")
SPECS = {
    "product": (Product, Product.product_id, {"name": Product.name, "description": Product.product_description}, ProductTranslation, ProductTranslationText),
    "category": (Category, Category.category_id, {"name": Category.category_name, "description": Category.category_description}, CategoryTranslation, CategoryTranslationText),
    "ingredient": (Ingredient, Ingredient.ingredient_id, {"name": Ingredient.name}, IngredientTranslation, IngredientTranslationText),
}
GLOSSARY_PATH = Path(__file__).resolve().parents[1] / "seeds" / "translations" / "glossary.json"


class Proposal(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    entity: Literal["product", "category", "ingredient"]
    id: int = Field(gt=0)
    source: dict[str, str | None]
    translations: dict[TranslationLocale, dict[str, str | None]]
    existing_translations: dict[TranslationLocale, dict[str, str | None]] = Field(default_factory=dict)
    proposed_name_en: str | None = Field(None, max_length=150)
    notes: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_text(self):
        fields = set(SPECS[self.entity][2])
        if set(self.source) != fields or not self.source.get("name"):
            raise ValueError("Source fields must match the entity and include its name.")
        schema = SPECS[self.entity][4]
        for locale, values in self.translations.items():
            normalized = schema.model_validate(values).model_dump(exclude_unset=True)
            if self.entity == "product":
                if set(values) - {"name", "description"}:
                    raise ValueError("Product menu tags are outside this import.")
                if normalized.get("name") not in (None, self.source["name"]):
                    raise ValueError("Dish names must remain unchanged in each locale; use proposed_name_en instead.")
            self.translations[locale] = normalized
        if self.proposed_name_en is not None:
            if self.entity != "product" or not self.proposed_name_en.strip():
                raise ValueError("Only products can have a nonblank proposed English name.")
            self.proposed_name_en = self.proposed_name_en.strip()
        return self


class Bundle(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1] = 1
    source_locale: Literal["pt-PT"] = "pt-PT"
    entries: list[Proposal]

    @model_validator(mode="after")
    def unique_entities(self):
        keys = [(item.entity, item.id) for item in self.entries]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate entity IDs in review bundle.")
        return self


def sources(db: Session, entity: str, ids=None, lock=False) -> dict[int, dict]:
    _model, identifier, fields, _translation, _schema = SPECS[entity]
    statement = select(identifier, *fields.values()).order_by(identifier)
    if ids is not None:
        statement = statement.where(identifier.in_(ids))
    if lock and db.bind.dialect.name == "postgresql":
        statement = statement.with_for_update()
    return {row[0]: dict(zip(fields, row[1:])) for row in db.execute(statement).all()}


def propose(db: Session, glossary_path: Path = GLOSSARY_PATH) -> Bundle:
    """Offline, deterministic proposals; unknown text is left for human review."""
    glossary = json.loads(glossary_path.read_text(encoding="utf-8"))
    entries = []
    for entity in SPECS:
        catalog_sources = sources(db, entity)
        saved = translation_maps(db, SPECS[entity][3], catalog_sources)
        for identifier, source in catalog_sources.items():
            notes = []
            translations = {locale: {} for locale in LOCALES}
            for field, value in source.items():
                if entity == "product" and field == "name":
                    for locale in LOCALES:
                        translations[locale][field] = value
                    continue
                pair = glossary[entity].get(field, {}).get(value) if value else None
                for index, locale in enumerate(LOCALES):
                    translations[locale][field] = pair[index] if pair else None
                if value and not pair:
                    notes.append(f"Untranslated {field}: requires manual review; no text invented.")
            notes.extend(glossary.get("notes", {}).get(source["name"], []))
            entries.append(Proposal(entity=entity, id=identifier, source=source, translations=translations,
                                    existing_translations=saved.get(identifier, {}),
                                    proposed_name_en=glossary.get("product_names", {}).get(source["name"]) if entity == "product" else None,
                                    notes=notes))
    return Bundle(entries=entries)


def import_bundle(db: Session, bundle: Bundle, *, apply=False, overwrite=False, apply_product_names=False) -> dict:
    """Validate and preview; only apply=True stages writes. Caller owns the transaction.

    The caller must roll back after previews and after failures. PostgreSQL locks
    serialize catalog imports, preventing duplicate rows from concurrent runs.
    """
    bundle = Bundle.model_validate(bundle.model_dump())
    if apply and db.bind.dialect.name == "postgresql":
        # Lock only the three translation tables, in a fixed order. No catalog reset.
        from sqlalchemy import text
        db.execute(text("LOCK TABLE category_translation, ingredient_translation, product_translation IN SHARE ROW EXCLUSIVE MODE"))
    current, existing = {}, {}
    for entity, spec in SPECS.items():
        ids = [item.id for item in bundle.entries if item.entity == entity]
        current[entity] = sources(db, entity, ids, lock=apply)
        translation = spec[3]
        fk = getattr(translation, f"{entity}_id")
        existing[entity] = {(getattr(row, f"{entity}_id"), row.locale): row for row in db.scalars(select(translation).where(fk.in_(ids))).all()}
    # Validate every source before staging any write; rejects stale/wrong-database files.
    for entry in bundle.entries:
        actual = current[entry.entity].get(entry.id)
        expected = dict(entry.source)
        if apply_product_names and entry.proposed_name_en and actual and actual["name"] == entry.proposed_name_en:
            expected["name"] = entry.proposed_name_en
        if actual != expected:
            raise ValueError(f"Source mismatch for {entry.entity} {entry.id}; export and review a fresh bundle.")
        if apply_product_names and entry.entity == "product" and not overwrite:
            canonical = entry.proposed_name_en or entry.source["name"]
            for locale in LOCALES:
                row = existing["product"].get((entry.id, locale))
                if row is not None and row.name and row.name.strip() != canonical:
                    raise ValueError(f"Product {entry.id} has an existing name override; review and use --overwrite to enforce its canonical name.")
    report = {"created_rows": 0, "updated_fields": 0, "preserved_fields": 0, "renamed_products": 0, "changes": []}
    renames, additions, assignments = [], [], []
    for entry in bundle.entries:
        translation = SPECS[entry.entity][3]
        proposed = {locale: dict(values) for locale, values in entry.translations.items()}
        if entry.entity == "product" and apply_product_names:
            canonical = entry.proposed_name_en or entry.source["name"]
            for locale in LOCALES:
                proposed.setdefault(locale, {})["name"] = canonical
            if current["product"][entry.id]["name"] != canonical:
                renames.append({"target_id": entry.id, "canonical_name": canonical})
                report["changes"].append({"entity": "product", "id": entry.id, "field": "name", "before": current["product"][entry.id]["name"], "after": canonical})
        for locale, values in proposed.items():
            row = existing[entry.entity].get((entry.id, locale))
            for field, value in values.items():
                if not value:  # Blank proposals never delete existing content.
                    continue
                before = getattr(row, field) if row is not None else None
                if before == value:
                    continue
                if before and before.strip() and not overwrite:
                    report["preserved_fields"] += 1
                    continue
                if row is None:
                    row = translation(**{f"{entry.entity}_id": entry.id, "locale": locale})
                    additions.append(row)
                    existing[entry.entity][entry.id, locale] = row
                    report["created_rows"] += 1
                assignments.append((row, field, value))
                report["updated_fields"] += 1
                report["changes"].append({"entity": entry.entity, "id": entry.id, "locale": locale, "field": field, "before": before, "after": value})
    if apply:
        db.add_all(additions)
        for row, field, value in assignments:
            setattr(row, field, value)
    if apply and renames:
        table = Product.__table__
        db.execute(table.update().where(table.c.id == bindparam("target_id")).values(name=bindparam("canonical_name")), renames)
    report["renamed_products"] = len(renames)
    if apply:
        db.flush()
    return report
