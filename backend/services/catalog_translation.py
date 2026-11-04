"""Batch catalog translation reads and transactional updates."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import CategoryTranslation, IngredientTranslation, ProductTranslation

TRANSLATION_FIELDS = {
    ProductTranslation: ("product_id", ("name", "description", "menu_tags")),
    CategoryTranslation: ("category_id", ("name", "description")),
    IngredientTranslation: ("ingredient_id", ("name",)),
}


def translation_maps(db: Session, model, entity_ids, locale: str | None = None) -> dict:
    """Return entity -> locale -> fields, without loading parent ORM graphs."""
    ids = set(entity_ids)
    if not ids or locale == "pt-PT":
        return {}
    foreign_key, fields = TRANSLATION_FIELDS[model]
    identifier = getattr(model, foreign_key)
    statement = select(identifier, model.locale, *(getattr(model, field) for field in fields)).where(identifier.in_(ids))
    if locale is not None:
        statement = statement.where(model.locale == locale)
    result: dict = {}
    for entity_id, language, *values in db.execute(statement).all():
        result.setdefault(entity_id, {})[language] = {field: (value.strip() or None if isinstance(value, str) else value) for field, value in zip(fields, values)}
    return result


def update_translations(db: Session, model, entity_id: int, changes) -> None:
    """Replace only supplied locales; parent route owns flush/commit/rollback."""
    if not changes:
        return
    foreign_key, fields = TRANSLATION_FIELDS[model]
    existing = {
        row.locale: row for row in db.scalars(
            select(model).where(getattr(model, foreign_key) == entity_id, model.locale.in_(changes))
        ).all()
    }
    for locale, payload in changes.items():
        values = payload.model_dump() if payload is not None else {}
        row = existing.get(locale)
        if not any(values.values()):
            if row is not None:
                db.delete(row)
            continue
        if row is None:
            row = model(**{foreign_key: entity_id, "locale": locale})
            db.add(row)
        for field in fields:
            setattr(row, field, values.get(field))


def localized_text(model, foreign_key, parent_id, field, original, locale: str):
    """A correlated scalar expression usable in filtering, grouping and ordering."""
    if locale == "pt-PT":
        return original
    override = select(getattr(model, field)).where(
        getattr(model, foreign_key) == parent_id, model.locale == locale
    ).correlate_except(model).scalar_subquery()
    return func.coalesce(func.nullif(func.trim(override), ""), original)


def localize_products(db: Session, products, responses, locale: str):
    """Localize response copies, never the persistent Portuguese ORM attributes."""
    if locale == "pt-PT" or not products:
        return responses
    product_text = translation_maps(db, ProductTranslation, [item.product_id for item in products], locale)
    category_text = translation_maps(db, CategoryTranslation, [item.category_id for item in products], locale)
    ingredient_ids = {ingredient.ingredient_id for response in responses for ingredient in response.ingredients}
    ingredient_text = translation_maps(db, IngredientTranslation, ingredient_ids, locale)
    localized = []
    for product, response in zip(products, responses):
        text = product_text.get(product.product_id, {}).get(locale, {})
        category = category_text.get(product.category_id, {}).get(locale, {})
        updates = {field: text[field] for field in ("name", "description") if text.get(field)}
        if text.get("menu_tags"):
            updates["tags"] = list(dict.fromkeys(tag.strip() for tag in text["menu_tags"].split(",") if tag.strip()))
        if category.get("name"):
            updates["category"] = category["name"]
        updates["ingredients"] = [
            ingredient.model_copy(update={"name": ingredient_text.get(ingredient.ingredient_id, {}).get(locale, {}).get("name") or ingredient.name})
            for ingredient in response.ingredients
        ]
        localized.append(response.model_copy(update=updates))
    return localized
