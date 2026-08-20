
import re
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session, selectinload
from database import get_db
from schemas.enums import EntityStatus, IngredientType, ProductCustomizationOptionType
from models import Ingredient, Product, ProductIngredient, ProductCustomizationOption
from schemas import ProductResponse
from schemas.product import ProductIngredientNutrition
from schemas.customization import (
    CustomizationIngredientResponse,
    CustomizationOptionResponse,
    ProductCustomizationOptions,
    ProductCustomizationResponse,
)
from schemas.substitution import AvailabilitySuggestionResponse, StockSuggestion
from services.order_customization import COMMON_ADD_OPTIONS, COMMON_PREFERENCES
from services.product_availability import INACTIVE_BASE_REASON, inactive_base_product_ids
from services.product_pricing import discounted_product_price
from services.substitution import (
    DEFAULT_STOCK_THRESHOLD,
    availability_reason,
    is_product_available,
    product_category,
    product_name,
    product_price,
    product_stock,
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
    """Get all active products with their images."""
    query = select(Product).where(active_product_filter()).options(selectinload(Product.images))
    products = db.scalars(query).unique().all()
    product_ids = [product.product_id for product in products]
    inactive_base_ids = inactive_base_product_ids(db, product_ids)
    ingredient_lookup = _product_ingredient_nutrition_lookup(db, product_ids)
    return [
        ProductResponse.from_orm_custom(
            product,
            unavailable_due_to_inactive_base=product.product_id in inactive_base_ids,
            unavailable_reason=INACTIVE_BASE_REASON,
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
    quantity: int = Query(1, ge=1),
    stock_threshold: int = Query(DEFAULT_STOCK_THRESHOLD, ge=0),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    parsed_product_id = parse_product_id(product_id)
    """Return stock-out substitutes and similar available dishes for a product."""
    product = db.scalar(
        select(Product).where(
            and_(Product.product_id == parsed_product_id, active_product_filter())
        ).limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})

    available = is_product_available(product, quantity, stock_threshold)

    substitutes = []
    similar_dishes = []
    if not available:
        active_products = db.scalars(select(Product).where(active_product_filter())).unique().all()
        substitutes = rank_substitutions(
            product,
            active_products,
            quantity=quantity,
            stock_threshold=stock_threshold,
            limit=limit,
        )
        similar_dishes = suggest_similar_dishes(
            product,
            active_products,
            quantity=quantity,
            stock_threshold=stock_threshold,
            limit=limit,
        )

    return AvailabilitySuggestionResponse(
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product_name(product),
        requested_quantity=quantity,
        stock_threshold=stock_threshold,
        available=available,
        availability_reason=availability_reason(product, quantity, stock_threshold),
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
                ProductCustomizationOption.ingredient.has(Ingredient.status == EntityStatus.ACTIVE),
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
        if row.ingredient and row.ingredient.status == EntityStatus.ACTIVE
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
                ProductCustomizationOption.ingredient.has(Ingredient.status == EntityStatus.ACTIVE),
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
    """Get a single active product by ID, including its images."""
    parsed_product_id = parse_product_id(product_id)
    product = db.scalar(
        select(Product)
        .options(selectinload(Product.images))
        .where(and_(Product.product_id == parsed_product_id, active_product_filter()))
        .limit(1)
    )
    if not product:
        raise AppHTTPException(status_code=404, error="product_not_found", message="Product not found.", details={"reason": "request_failed"})
    unavailable = product.product_id in inactive_base_product_ids(db, [product.product_id])
    return ProductResponse.from_orm_custom(
        product,
        unavailable_due_to_inactive_base=unavailable,
        unavailable_reason=INACTIVE_BASE_REASON,
        ingredients=_product_ingredient_nutrition(db, product.product_id),
    )


def _suggestion_response(suggestion) -> StockSuggestion:
    product = suggestion.product
    return StockSuggestion(
        product_id=product.product_id,
        product_display_id=format_product_id(product.product_id),
        name=product_name(product),
        category=product_category(product),
        price=product_price(product),
        stock=product_stock(product),
        score=suggestion.score,
        reason=suggestion.reason,
    )
