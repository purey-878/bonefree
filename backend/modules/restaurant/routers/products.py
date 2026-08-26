
import re
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session, selectinload
from database import get_db
from modules.restaurant.models import EntityStatus, IngredientType, ProductCustomizationOptionType
from modules.restaurant.models import Ingredient, Media, Product, ProductIngredient, ProductCustomizationOption, ProductMedia
from modules.restaurant.schemas.product import ProductResponse
from modules.restaurant.schemas.product import ProductIngredientNutrition
from modules.restaurant.schemas.customization import (
    CustomizationIngredientResponse,
    CustomizationOptionResponse,
    ProductCustomizationOptions,
    ProductCustomizationResponse,
)
from modules.restaurant.schemas.substitution import AvailabilitySuggestionResponse, ProductSuggestion
from modules.restaurant.services.order_customization import COMMON_ADD_OPTIONS, COMMON_PREFERENCES
from modules.restaurant.services.product_availability import (
    effective_product_available,
    product_unavailable_reason,
    unavailable_base_product_ids,
)
from modules.restaurant.services.product_pricing import discounted_product_price
from modules.restaurant.services.substitution import (
    product_category,
    product_name,
    product_price,
    rank_substitutions,
    suggest_similar_dishes,
)
from utils.id_format import format_product_id, parse_product_id
from core.errors import AppHTTPException

router = APIRouter()


def active_product_filter():
    return and_(
        or_(Product.status == EntityStatus.ACTIVE, Product.status.is_(None)),
        Product.deleted_at.is_(None),
    )


def _is_drink_product(product: Product) -> bool:
    category_name = product.category.category_name if product.category else ""
    return "bebida" in category_name.casefold()


def _parse_quantity_to_grams(quantity: str | None) -> float | None:
    value = (quantity or "").strip().replace(",", ".")
    if not value:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?|\.\d+)\s*(g|gram|grams|kg|kilogram|kilograms)?", value, re.IGNORECASE)
    if not match:
        return None
    amount = float(match.group(1))
    unit = (match.group(2) or "g").lower()
    return amount * 1000 if unit.startswith("kg") or unit.startswith("kilogram") else amount


def _ingredient_nutrition_response(row: ProductIngredient) -> ProductIngredientNutrition | None:
    ingredient = row.ingredient
    if not ingredient:
        return None

    grams = _parse_quantity_to_grams(row.quantity)
    calories_per_gram = float(ingredient.calories_per_gram) if ingredient.calories_per_gram is not None else None
    calories = grams * calories_per_gram if grams is not None and calories_per_gram is not None else 0
    return ProductIngredientNutrition(
        ingredient_id=row.ingredient_id,
        name=ingredient.name,
        type=ingredient.type,
        status=ingredient.status or EntityStatus.INACTIVE,
        available=bool(ingredient.available),
        quantity=row.quantity,
        calories_per_gram=calories_per_gram,
        calories=round(calories, 2),
    )


def _product_ingredient_nutrition_lookup(
    db: Session,
    product_ids: list[int],
) -> dict[int, list[ProductIngredientNutrition]]:
    if not product_ids:
        return {}
    rows = db.scalars(
        select(ProductIngredient)
        .join(ProductIngredient.ingredient)
        .where(ProductIngredient.product_id.in_(product_ids))
        .order_by(ProductIngredient.product_id, ProductIngredient.ingredient_id)
    ).all()
    lookup: dict[int, list[ProductIngredientNutrition]] = {
        product_id: [] for product_id in product_ids
    }
    for row in rows:
        item = _ingredient_nutrition_response(row)
        if item is not None:
            lookup[row.product_id].append(item)
    return lookup


def _product_ingredient_nutrition(db: Session, product_id: int) -> list[ProductIngredientNutrition]:
    return _product_ingredient_nutrition_lookup(db, [product_id]).get(product_id, [])


@router.get('/', response_model=list[ProductResponse], operation_id="products_list_products")
def list_products(db: Session = Depends(get_db)):
    """Get all active products with their media."""
    query = select(Product).where(active_product_filter()).options(
        selectinload(Product.media_items)
        .selectinload(ProductMedia.media)
        .selectinload(Media.variants)
    )
    products = db.scalars(query).unique().all()
    product_ids = [product.product_id for product in products]
    unavailable_base_ids = unavailable_base_product_ids(db, product_ids)
    ingredient_lookup = _product_ingredient_nutrition_lookup(db, product_ids)
    return [
        ProductResponse.from_orm_custom(
            product,
            unavailable_due_to_unavailable_base=product.product_id in unavailable_base_ids,
            unavailable_reason=product_unavailable_reason(product, unavailable_base_ids),
            ingredients=ingredient_lookup.get(product.product_id, []),
        )
        for product in products
    ]


@router.get(
    '/{product_id}/availability-suggestions',
    response_model=AvailabilitySuggestionResponse,
    operation_id="products_get_availability_suggestions",
)
def get_availability_suggestions(
    product_id: str,
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    """Return substitutes and similar available dishes for an unavailable product."""
    product = db.scalar(
        select(Product).where(
            and_(Product.product_id == parsed_product_id, active_product_filter())
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    active_products = db.scalars(select(Product).where(active_product_filter())).unique().all()
    unavailable_base_ids = unavailable_base_product_ids(
        db,
        [candidate.product_id for candidate in active_products],
    )
    available = effective_product_available(product, unavailable_base_ids)

    substitutes = []
    similar_dishes = []
    if not available:
        available_products = [
            candidate
            for candidate in active_products
            if effective_product_available(candidate, unavailable_base_ids)
        ]
        substitutes = rank_substitutions(
            product,
            available_products,
            limit=limit,
        )
        similar_dishes = suggest_similar_dishes(
            product,
            available_products,
            limit=limit,
        )

    return AvailabilitySuggestionResponse(
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product_name(product),
        available=available,
        availability_reason=(
            product_unavailable_reason(product, unavailable_base_ids)
            or "The item is available."
        ),
        substitutes=[_suggestion_response(item) for item in substitutes],
        similar_dishes=[_suggestion_response(item) for item in similar_dishes],
    )


@router.get(
    '/{product_id}/customization-options',
    response_model=ProductCustomizationOptions,
    operation_id="products_get_customization_options",
)
def get_customization_options(
    product_id: str,
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    """Return item-level customization choices for a product."""
    product = db.scalar(
        select(Product).where(
            and_(Product.product_id == parsed_product_id, active_product_filter())
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    ingredient_rows = []
    if not _is_drink_product(product):
        ingredient_rows = db.scalars(
            select(ProductIngredient)
            .join(ProductIngredient.ingredient)
            .where(
                ProductIngredient.product_id == parsed_product_id,
                ProductIngredient.removable == 1,
                Ingredient.status == EntityStatus.ACTIVE,
                Ingredient.available.is_(True),
                Ingredient.type == IngredientType.NORMAL,
            )
            .order_by(Ingredient.name)
        ).all()
    remove_options = []
    seen_remove = set()
    for row in ingredient_rows:
        if not row.ingredient:
            continue
        name = row.ingredient.name.strip()
        key = name.casefold()
        if name and key not in seen_remove:
            seen_remove.add(key)
            remove_options.append(name)

    extra_filters = (
        ProductCustomizationOption.product_id == parsed_product_id,
        ProductCustomizationOption.type == ProductCustomizationOptionType.EXTRA,
        ProductCustomizationOption.status == EntityStatus.ACTIVE,
    )
    has_product_extra_options = bool(db.scalar(select(exists().where(*extra_filters))))
    extra_rows = db.scalars(
        select(ProductCustomizationOption)
        .where(
            *extra_filters,
            or_(
                ProductCustomizationOption.ingredient_id.is_(None),
                ProductCustomizationOption.ingredient.has(
                    (Ingredient.status == EntityStatus.ACTIVE)
                    & Ingredient.available.is_(True)
                ),
            ),
        )
        .order_by(ProductCustomizationOption.name)
    ).all()
    add_options = []
    seen_add = set()
    for option in extra_rows:
        name = option.name.strip()
        key = name.casefold()
        if name and key not in seen_add:
            seen_add.add(key)
            add_options.append(name)

    return ProductCustomizationOptions(
        remove=remove_options,
        add=add_options if has_product_extra_options else list(COMMON_ADD_OPTIONS),
        preferences=list(COMMON_PREFERENCES),
    )


@router.get(
    '/{product_id}/customization',
    response_model=ProductCustomizationResponse,
    operation_id="products_get_product_customization",
)
def get_product_customization(
    product_id: str,
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    """Return database-backed customization options for a product."""
    product = db.scalar(
        select(Product).where(
            and_(Product.product_id == parsed_product_id, active_product_filter())
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    ingredient_rows = []
    if not _is_drink_product(product):
        ingredient_rows = db.scalars(
            select(ProductIngredient)
            .join(ProductIngredient.ingredient)
            .where(ProductIngredient.product_id == parsed_product_id, Ingredient.type != IngredientType.DRINK)
            .order_by(ProductIngredient.ingredient_id)
        ).all()
    ingredients = [
        CustomizationIngredientResponse(
            ingredient_id=row.ingredient_id,
            name=row.ingredient.name,
            type=row.ingredient.type,
            removable=bool(row.removable) and row.ingredient.type == IngredientType.NORMAL,
            substitutable=bool(row.substitutable),
            included_by_default=bool(row.included_by_default),
        )
        for row in ingredient_rows
        if (
            row.ingredient
            and row.ingredient.status == EntityStatus.ACTIVE
            and row.ingredient.available
        )
    ]

    grouped_options = {
        ProductCustomizationOptionType.EXTRA: [],
        ProductCustomizationOptionType.ADD: [],
        ProductCustomizationOptionType.SUBSTITUTE_SAUCE: [],
    }
    options = db.scalars(
        select(ProductCustomizationOption)
        .where(
            ProductCustomizationOption.product_id == parsed_product_id,
            ProductCustomizationOption.status == EntityStatus.ACTIVE,
            ProductCustomizationOption.type.in_(tuple(grouped_options.keys())),
            or_(
                ProductCustomizationOption.ingredient_id.is_(None),
                ProductCustomizationOption.ingredient.has(
                    (Ingredient.status == EntityStatus.ACTIVE)
                    & Ingredient.available.is_(True)
                ),
            ),
        )
        .order_by(ProductCustomizationOption.type, ProductCustomizationOption.name)
    ).all()
    for option in options:
        grouped_options[option.type].append(
            CustomizationOptionResponse(
                option_id=option.option_id,
                ingredient_id=option.ingredient_id,
                name=option.name,
                type=option.type,
                extra_price=option.extra_price,
                max_quantity=option.max_quantity,
            )
        )

    return ProductCustomizationResponse(
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product.name,
        customizable=bool(product.customizable),
        base_price=discounted_product_price(product),
        ingredients=ingredients,
        removable_ingredients=[item for item in ingredients if item.removable],
        substitutable_ingredients=[item for item in ingredients if item.substitutable],
        options=grouped_options,
    )


@router.get('/{product_id}', response_model=ProductResponse, operation_id="products_get_product")
def get_product(product_id: str, db: Session = Depends(get_db)):
    """Get a single active product by ID, including its media."""
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product)
        .options(
            selectinload(Product.media_items)
            .selectinload(ProductMedia.media)
            .selectinload(Media.variants)
        )
        .where(and_(Product.product_id == parsed_product_id, active_product_filter()))
        .limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    unavailable_base_ids = unavailable_base_product_ids(db, [product.product_id])
    return ProductResponse.from_orm_custom(
        product,
        unavailable_due_to_unavailable_base=product.product_id in unavailable_base_ids,
        unavailable_reason=product_unavailable_reason(product, unavailable_base_ids),
        ingredients=_product_ingredient_nutrition(db, product.product_id),
    )


def _suggestion_response(suggestion) -> ProductSuggestion:
    product = suggestion.product
    return ProductSuggestion(
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product_name(product),
        category=product_category(product),
        price=product_price(product),
        score=suggestion.score,
        reason=suggestion.reason,
    )
