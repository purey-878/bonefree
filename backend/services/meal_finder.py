"""Three fixed questions, fixed matching rules, live catalog prices/availability.

Old configurable questions and product metadata are deliberately not read.
"""
import hashlib
import re
import unicodedata
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from models import Category, Media, Product, ProductMedia
from meal_finder_models import MealFinderSettings
from schemas.enums import EntityStatus
from schemas.meal_finder import Configuration, FinderSettings, Match, RecommendationResult
from schemas.product import ProductResponse
from services.catalog_pricing import starting_price_expression
from services.catalog_translation import localize_products
from services.product_availability import unavailable_base_product_ids
from core.errors import AppHTTPException

QUESTIONNAIRE_VERSION = 2
COURSES = {
    'starter': ('entradas', 'starters'),
    'tacos': ('tacos',),
    'main': ('pratos principais', 'main courses', 'mains'),
}
# These rules describe explicit recipe words, not calories, serving sizes or
# allergy suitability. Normalise source text so ranking is locale-independent.
STYLE_PATTERNS = {
    'crispy': r'\b(?:frit\w*|fried|crispy|crocante\w*|chips|onion rings)\b',
    'creamy': r'\b(?:creme|cremos\w*|cream\w*|leite de coco|coconut milk)\b',
    'smoky': r'\b(?:fumad\w*|smok\w*|bbq|barbecue)\b',
}
INGREDIENT_PATTERNS = {
    'plant_protein': r'\b(?:tofu|beyond(?: meat)?|moving mountains|fakon|plant.based meat)\b',
    'legumes': r'\b(?:feijao|lentilh\w*|lentinh\w*|grao|beans?|lentils?|chickpeas?)\b',
    'vegetables': r'\b(?:legumes|vegetables?|couve.flor|cauliflower|pimentos?|peppers?|abacate|avocado|guacamole)\b',
}


def fail(message, status=422):
    raise AppHTTPException(status_code=status, error='meal_finder_outdated' if status == 409 else 'meal_finder_unavailable', message=message)


def text(pt, en, de):
    return dict(pt=pt, en=en, de=de)


def fixed_questions():
    def option(key, pt, en, de):
        return dict(id=key, label=text(pt, en, de))
    return [
        dict(id='course', label=text('O que te apetece comer?', 'What would you like to eat?', 'Was möchtest du essen?'), options=[
            option('starter', 'Entradas', 'Starters', 'Vorspeisen'),
            option('tacos', 'Tacos', 'Tacos', 'Tacos'),
            option('main', 'Pratos principais', 'Mains', 'Hauptgerichte')]),
        dict(id='style', label=text('Que estilo te apetece?', 'What style sounds good?', 'Welcher Stil gefällt dir?'), options=[
            option('crispy', 'Algo crocante', 'Something crispy', 'Etwas Knuspriges'),
            option('creamy', 'Molhos cremosos', 'Creamy sauces', 'Cremige Saucen'),
            option('smoky', 'Sabores fumados e BBQ', 'Smoky & BBQ flavours', 'Rauchige Aromen und BBQ'),
            option('any', 'Surpreende-me', 'Surprise me', 'Überrasch mich')]),
        dict(id='ingredient', label=text('Que ingredientes preferes?', 'Which ingredients appeal to you?', 'Welche Zutaten magst du?'), options=[
            option('plant_protein', 'Tofu e alternativas vegetais à carne', 'Tofu & plant-based meat', 'Tofu und pflanzliche Fleischalternativen'),
            option('legumes', 'Feijão, grão e lentilhas', 'Beans, chickpeas & lentils', 'Bohnen, Kichererbsen und Linsen'),
            option('vegetables', 'Legumes e abacate', 'Vegetables & avocado', 'Gemüse und Avocado'),
            option('any', 'Sem preferência', 'No preference', 'Keine Präferenz')]),
    ]


def default_settings(_db=None):
    return FinderSettings(enabled=False)


def settings(db):
    row = db.get(MealFinderSettings, 1)
    return FinderSettings(enabled=bool(row and row.config.get('enabled', False)))


def configuration(db):
    return Configuration(version=QUESTIONNAIRE_VERSION, enabled=settings(db).enabled, questions=fixed_questions())


def save_settings(db, data):
    # Insert a singleton if absent, without resetting any historical config.
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    insert = pg_insert if db.bind.dialect.name == 'postgresql' else sqlite_insert
    db.execute(insert(MealFinderSettings).values(id=1, version=1, config={'enabled': False}).on_conflict_do_nothing(index_elements=['id']))
    row = db.scalar(select(MealFinderSettings).where(MealFinderSettings.id == 1).with_for_update())
    row.config = {**row.config, 'enabled': data.enabled}
    db.commit()
    return FinderSettings(enabled=data.enabled)


def source_text(name, description):
    raw = unicodedata.normalize('NFKD', f'{name} {description or ""}').casefold()
    return ''.join(c for c in raw if not unicodedata.combining(c))


def recommendations(db, request):
    if not settings(db).enabled:
        fail('The Meal Finder is temporarily unavailable.', 503)
    if request.version != QUESTIONNAIRE_VERSION:
        fail('The questions changed. Please restart.', 409)
    answer = request.answers
    statement = (select(Product.id, Product.name, Product.product_description)
        .join(Category, Category.id == Product.category_id)
        .where(Product.status == EntityStatus.ACTIVE, Product.deleted_at.is_(None),
               Product.available.is_(True), Product.contains_alcohol.is_(False),
               Category.status == EntityStatus.ACTIVE,
               func.lower(func.trim(Category.category_name)).in_(COURSES[answer.course]),
               starting_price_expression().is_not(None)))
    if 'gluten_free' in request.restrictions:
        statement = statement.where(Product.gluten_free.is_(True))
    rows = db.execute(statement).all()
    unavailable = unavailable_base_product_ids(db, [r.id for r in rows])
    ranked = []
    for row in rows:
        if row.id in unavailable:
            continue
        description = source_text(row.name, row.product_description)
        reasons, score = ['course'], 0
        for key, value, patterns, points in [('style', answer.style, STYLE_PATTERNS, 40), ('ingredient', answer.ingredient, INGREDIENT_PATTERNS, 30)]:
            if value != 'any' and re.search(patterns[value], description):
                reasons.append(key)
                score += points
        # Stable variety within genuine ties: do not always favour the oldest ID.
        tie = hashlib.sha256(f'{answer.course}:{answer.style}:{answer.ingredient}:{row.id}'.encode()).hexdigest()
        ranked.append((score, tie, row.id, reasons))
    ranked.sort(key=lambda r: (-r[0], r[1], r[2]))
    chosen = ranked[:3]
    ids = [r[2] for r in chosen]
    products = db.scalars(select(Product).options(selectinload(Product.media_items).selectinload(ProductMedia.media).selectinload(Media.variants)).where(Product.id.in_(ids))).all() if ids else []
    responses = localize_products(db, products, [ProductResponse.from_orm_custom(p, locale=request.locale) for p in products], request.locale)
    lookup = {p.id: p for p in responses}
    matches = [Match(product=lookup[r[2]], reasons=r[3]) for r in chosen]
    requested = {'course'} | ({'style'} if answer.style != 'any' else set()) | ({'ingredient'} if answer.ingredient != 'any' else set())
    return RecommendationResult(best=matches[0] if matches else None, alternatives=matches[1:], closest=bool(chosen and not requested.issubset(chosen[0][3])))
