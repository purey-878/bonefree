
import re
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Ingrediente, Produto, ProdutoIngrediente, ProdutoOpcaoCustomizacao
from schemas import ProdutoResponse
from schemas.produto import ProdutoIngredientNutrition
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

router = APIRouter()


def active_product_filter():
    return and_(
        or_(Produto.status == 1, Produto.status.is_(None)),
        Produto.deleted_at.is_(None),
    )


def _is_drink_product(product: Produto) -> bool:
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


def _ingredient_nutrition_response(row: ProdutoIngrediente) -> ProdutoIngredientNutrition | None:
    ingredient = row.ingredient
    if not ingredient:
        return None

    grams = _parse_quantity_to_grams(row.quantity)
    calories_per_gram = float(ingredient.calories_per_gram) if ingredient.calories_per_gram is not None else None
    calories = grams * calories_per_gram if grams is not None and calories_per_gram is not None else 0
    return ProdutoIngredientNutrition(
        ingredient_id=row.ingredient_id,
        name=ingredient.name,
        type=ingredient.type,
        status=int(ingredient.status or 0),
        quantity=row.quantity,
        calories_per_gram=calories_per_gram,
        calorias=round(calories, 2),
    )


def _product_ingredient_nutrition(db: Session, produto_id: int) -> list[ProdutoIngredientNutrition]:
    rows = (
        db.query(ProdutoIngrediente)
        .join(ProdutoIngrediente.ingredient)
        .filter(ProdutoIngrediente.product_id == produto_id)
        .order_by(ProdutoIngrediente.ingredient_id)
        .all()
    )
    return [
        item
        for row in rows
        if (item := _ingredient_nutrition_response(row)) is not None
    ]


@router.get('/', response_model=list[ProdutoResponse])
def list_produtos(db: Session = Depends(get_db)):
    """Get all active products with their images."""
    query = select(Produto).where(active_product_filter()).options(joinedload(Produto.imagens))
    products = db.scalars(query).unique().all()
    inactive_base_ids = inactive_base_product_ids(db, [product.product_id for product in products])
    return [
        ProdutoResponse.from_orm_custom(
            product,
            unavailable_due_to_inactive_base=product.product_id in inactive_base_ids,
            unavailable_reason=INACTIVE_BASE_REASON,
            ingredients=_product_ingredient_nutrition(db, product.product_id),
        )
        for product in products
    ]


@router.get('/{produto_id}/availability-suggestions', response_model=AvailabilitySuggestionResponse)
def get_availability_suggestions(
    produto_id: str,
    quantity: int = Query(1, ge=1),
    stock_threshold: int = Query(DEFAULT_STOCK_THRESHOLD, ge=0),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    parsed_produto_id = parse_product_id(produto_id)
    """Return stock-out substitutes and similar available dishes for a product."""
    product = db.query(Produto).filter(
        and_(Produto.product_id == parsed_produto_id, active_product_filter())
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    available = is_product_available(product, quantity, stock_threshold)
    active_products = db.query(Produto).filter(active_product_filter()).all()

    substitutes = []
    similar_dishes = []
    if not available:
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
        id_produto_display=format_product_id(product.product_id),
        name=product_name(product),
        requested_quantity=quantity,
        stock_threshold=stock_threshold,
        available=available,
        availability_reason=availability_reason(product, quantity, stock_threshold),
        substitutes=[_suggestion_response(item) for item in substitutes],
        similar_dishes=[_suggestion_response(item) for item in similar_dishes],
    )


@router.get('/{produto_id}/customization-options', response_model=ProductCustomizationOptions)
def get_customization_options(
    produto_id: str,
    db: Session = Depends(get_db),
):
    parsed_produto_id = parse_product_id(produto_id)
    """Return item-level customization choices for a product."""
    product = db.query(Produto).filter(
        and_(Produto.product_id == parsed_produto_id, active_product_filter())
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    ingredient_rows = []
    if not _is_drink_product(product):
        ingredient_rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingredient)
            .filter(
                ProdutoIngrediente.product_id == parsed_produto_id,
                ProdutoIngrediente.removable == 1,
                Ingrediente.status == 1,
                Ingrediente.type == "INGREDIENTES_NORMAIS",
            )
            .order_by(Ingrediente.name)
            .all()
        )
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
        ProdutoOpcaoCustomizacao.product_id == parsed_produto_id,
        ProdutoOpcaoCustomizacao.type == "EXTRA",
        ProdutoOpcaoCustomizacao.status == 1,
    )
    has_product_extra_options = db.query(ProdutoOpcaoCustomizacao.option_id).filter(*extra_filters).first() is not None
    extra_rows = (
        db.query(ProdutoOpcaoCustomizacao)
        .filter(
            *extra_filters,
            or_(
                ProdutoOpcaoCustomizacao.ingredient_id.is_(None),
                ProdutoOpcaoCustomizacao.ingredient.has(Ingrediente.status == 1),
            ),
        )
        .order_by(ProdutoOpcaoCustomizacao.name)
        .all()
    )
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


@router.get('/{produto_id}/customization', response_model=ProductCustomizationResponse)
def get_produto_customizacao(
    produto_id: str,
    db: Session = Depends(get_db),
):
    parsed_produto_id = parse_product_id(produto_id)
    """Return database-backed customization options for a product."""
    product = db.query(Produto).filter(
        and_(Produto.product_id == parsed_produto_id, active_product_filter())
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    ingredientes_rows = []
    if not _is_drink_product(product):
        ingredientes_rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingredient)
            .filter(ProdutoIngrediente.product_id == parsed_produto_id, Ingrediente.type != "BEBIDA")
            .order_by(ProdutoIngrediente.ingredient_id)
            .all()
        )
    ingredients = [
        CustomizationIngredientResponse(
            ingredient_id=row.ingredient_id,
            name=row.ingredient.name,
            type=row.ingredient.type,
            removable=bool(row.removable) and row.ingredient.type == "INGREDIENTES_NORMAIS",
            substitutable=bool(row.substitutable),
            included_by_default=bool(row.included_by_default),
        )
        for row in ingredientes_rows
        if row.ingredient and row.ingredient.status == 1
    ]

    grouped_options = {
        "EXTRA": [],
        "ADICIONAR": [],
        "SUBSTITUIR_MOLHO": [],
        "SUBSTITUIR_ACOMPANHAMENTO": [],
    }
    options = (
        db.query(ProdutoOpcaoCustomizacao)
        .filter(
            ProdutoOpcaoCustomizacao.product_id == parsed_produto_id,
            ProdutoOpcaoCustomizacao.status == 1,
            ProdutoOpcaoCustomizacao.type.in_(tuple(grouped_options.keys())),
            or_(
                ProdutoOpcaoCustomizacao.ingredient_id.is_(None),
                ProdutoOpcaoCustomizacao.ingredient.has(Ingrediente.status == 1),
            ),
        )
        .order_by(ProdutoOpcaoCustomizacao.type, ProdutoOpcaoCustomizacao.name)
        .all()
    )
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
        id_produto_display=format_product_id(product.product_id),
        name=product.name,
        customizable=bool(product.customizable),
        preco_base=discounted_product_price(product),
        ingredients=ingredients,
        ingredientes_removiveis=[item for item in ingredients if item.removable],
        ingredientes_substituiveis=[item for item in ingredients if item.substitutable],
        opcoes=grouped_options,
    )


@router.get('/{produto_id}', response_model=ProdutoResponse)
def get_produto(produto_id: str, db: Session = Depends(get_db)):
    """Get a single active product by ID, including its images."""
    parsed_produto_id = parse_product_id(produto_id)
    product = db.query(Produto).options(joinedload(Produto.imagens)).filter(
        and_(Produto.product_id == parsed_produto_id, active_product_filter())
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    unavailable = product.product_id in inactive_base_product_ids(db, [product.product_id])
    return ProdutoResponse.from_orm_custom(
        product,
        unavailable_due_to_inactive_base=unavailable,
        unavailable_reason=INACTIVE_BASE_REASON,
        ingredients=_product_ingredient_nutrition(db, product.product_id),
    )


def _suggestion_response(suggestion) -> StockSuggestion:
    product = suggestion.product
    return StockSuggestion(
        product_id=product.product_id,
        id_produto_display=format_product_id(product.product_id),
        name=product_name(product),
        category=product_category(product),
        price=product_price(product),
        stock=product_stock(product),
        score=suggestion.score,
        reason=suggestion.reason,
    )
