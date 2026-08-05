
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


def _is_drink_product(produto: Produto) -> bool:
    category_name = produto.categoria.nome_categoria if produto.categoria else ""
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
    ingredient = row.ingrediente
    if not ingredient:
        return None

    grams = _parse_quantity_to_grams(row.quantidade)
    calories_per_gram = float(ingredient.calorias_por_grama) if ingredient.calorias_por_grama is not None else None
    calories = grams * calories_per_gram if grams is not None and calories_per_gram is not None else 0
    return ProdutoIngredientNutrition(
        id_ingrediente=row.id_ingrediente,
        nome=ingredient.nome,
        tipo=ingredient.tipo,
        status=int(ingredient.status or 0),
        quantidade=row.quantidade,
        calorias_por_grama=calories_per_gram,
        calorias=round(calories, 2),
    )


def _product_ingredient_nutrition(db: Session, produto_id: int) -> list[ProdutoIngredientNutrition]:
    rows = (
        db.query(ProdutoIngrediente)
        .join(ProdutoIngrediente.ingrediente)
        .filter(ProdutoIngrediente.id_produto == produto_id)
        .order_by(ProdutoIngrediente.id_ingrediente)
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
    produtos = db.scalars(query).unique().all()
    inactive_base_ids = inactive_base_product_ids(db, [produto.id_produto for produto in produtos])
    return [
        ProdutoResponse.from_orm_custom(
            produto,
            unavailable_due_to_inactive_base=produto.id_produto in inactive_base_ids,
            unavailable_reason=INACTIVE_BASE_REASON,
            ingredientes=_product_ingredient_nutrition(db, produto.id_produto),
        )
        for produto in produtos
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
    produto = db.query(Produto).filter(
        and_(Produto.id_produto == parsed_produto_id, active_product_filter())
    ).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    available = is_product_available(produto, quantity, stock_threshold)
    active_products = db.query(Produto).filter(active_product_filter()).all()

    substitutes = []
    similar_dishes = []
    if not available:
        substitutes = rank_substitutions(
            produto,
            active_products,
            quantity=quantity,
            stock_threshold=stock_threshold,
            limit=limit,
        )
        similar_dishes = suggest_similar_dishes(
            produto,
            active_products,
            quantity=quantity,
            stock_threshold=stock_threshold,
            limit=limit,
        )

    return AvailabilitySuggestionResponse(
        id_produto=produto.id_produto,
        id_produto_display=format_product_id(produto.id_produto),
        nome=product_name(produto),
        requested_quantity=quantity,
        stock_threshold=stock_threshold,
        available=available,
        availability_reason=availability_reason(produto, quantity, stock_threshold),
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
    produto = db.query(Produto).filter(
        and_(Produto.id_produto == parsed_produto_id, active_product_filter())
    ).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    ingredient_rows = []
    if not _is_drink_product(produto):
        ingredient_rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingrediente)
            .filter(
                ProdutoIngrediente.id_produto == parsed_produto_id,
                ProdutoIngrediente.removivel == 1,
                Ingrediente.status == 1,
                Ingrediente.tipo == "INGREDIENTES_NORMAIS",
            )
            .order_by(Ingrediente.nome)
            .all()
        )
    remove_options = []
    seen_remove = set()
    for row in ingredient_rows:
        if not row.ingrediente:
            continue
        name = row.ingrediente.nome.strip()
        key = name.casefold()
        if name and key not in seen_remove:
            seen_remove.add(key)
            remove_options.append(name)

    extra_filters = (
        ProdutoOpcaoCustomizacao.id_produto == parsed_produto_id,
        ProdutoOpcaoCustomizacao.tipo == "EXTRA",
        ProdutoOpcaoCustomizacao.status == 1,
    )
    has_product_extra_options = db.query(ProdutoOpcaoCustomizacao.id_opcao).filter(*extra_filters).first() is not None
    extra_rows = (
        db.query(ProdutoOpcaoCustomizacao)
        .filter(
            *extra_filters,
            or_(
                ProdutoOpcaoCustomizacao.id_ingrediente.is_(None),
                ProdutoOpcaoCustomizacao.ingrediente.has(Ingrediente.status == 1),
            ),
        )
        .order_by(ProdutoOpcaoCustomizacao.nome)
        .all()
    )
    add_options = []
    seen_add = set()
    for option in extra_rows:
        name = option.nome.strip()
        key = name.casefold()
        if name and key not in seen_add:
            seen_add.add(key)
            add_options.append(name)

    return ProductCustomizationOptions(
        remove=remove_options,
        add=add_options if has_product_extra_options else list(COMMON_ADD_OPTIONS),
        preferences=list(COMMON_PREFERENCES),
    )


@router.get('/{produto_id}/customizacao', response_model=ProductCustomizationResponse)
def get_produto_customizacao(
    produto_id: str,
    db: Session = Depends(get_db),
):
    parsed_produto_id = parse_product_id(produto_id)
    """Return database-backed customization options for a product."""
    produto = db.query(Produto).filter(
        and_(Produto.id_produto == parsed_produto_id, active_product_filter())
    ).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")

    ingredientes_rows = []
    if not _is_drink_product(produto):
        ingredientes_rows = (
            db.query(ProdutoIngrediente)
            .join(ProdutoIngrediente.ingrediente)
            .filter(ProdutoIngrediente.id_produto == parsed_produto_id, Ingrediente.tipo != "BEBIDA")
            .order_by(ProdutoIngrediente.id_ingrediente)
            .all()
        )
    ingredientes = [
        CustomizationIngredientResponse(
            id_ingrediente=row.id_ingrediente,
            nome=row.ingrediente.nome,
            tipo=row.ingrediente.tipo,
            removivel=bool(row.removivel) and row.ingrediente.tipo == "INGREDIENTES_NORMAIS",
            substituivel=bool(row.substituivel),
            incluido_por_defeito=bool(row.incluido_por_defeito),
        )
        for row in ingredientes_rows
        if row.ingrediente and row.ingrediente.status == 1
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
            ProdutoOpcaoCustomizacao.id_produto == parsed_produto_id,
            ProdutoOpcaoCustomizacao.status == 1,
            ProdutoOpcaoCustomizacao.tipo.in_(tuple(grouped_options.keys())),
            or_(
                ProdutoOpcaoCustomizacao.id_ingrediente.is_(None),
                ProdutoOpcaoCustomizacao.ingrediente.has(Ingrediente.status == 1),
            ),
        )
        .order_by(ProdutoOpcaoCustomizacao.tipo, ProdutoOpcaoCustomizacao.nome)
        .all()
    )
    for option in options:
        grouped_options[option.tipo].append(
            CustomizationOptionResponse(
                id_opcao=option.id_opcao,
                id_ingrediente=option.id_ingrediente,
                nome=option.nome,
                tipo=option.tipo,
                preco_extra=option.preco_extra,
                max_quantidade=option.max_quantidade,
            )
        )

    return ProductCustomizationResponse(
        id_produto=produto.id_produto,
        id_produto_display=format_product_id(produto.id_produto),
        nome=produto.nome,
        customizavel=bool(produto.customizavel),
        preco_base=discounted_product_price(produto),
        ingredientes=ingredientes,
        ingredientes_removiveis=[item for item in ingredientes if item.removivel],
        ingredientes_substituiveis=[item for item in ingredientes if item.substituivel],
        opcoes=grouped_options,
    )


@router.get('/{produto_id}', response_model=ProdutoResponse)
def get_produto(produto_id: str, db: Session = Depends(get_db)):
    """Get a single active product by ID, including its images."""
    parsed_produto_id = parse_product_id(produto_id)
    produto = db.query(Produto).options(joinedload(Produto.imagens)).filter(
        and_(Produto.id_produto == parsed_produto_id, active_product_filter())
    ).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado.")
    unavailable = produto.id_produto in inactive_base_product_ids(db, [produto.id_produto])
    return ProdutoResponse.from_orm_custom(
        produto,
        unavailable_due_to_inactive_base=unavailable,
        unavailable_reason=INACTIVE_BASE_REASON,
        ingredientes=_product_ingredient_nutrition(db, produto.id_produto),
    )


def _suggestion_response(suggestion) -> StockSuggestion:
    product = suggestion.product
    return StockSuggestion(
        id_produto=product.id_produto,
        id_produto_display=format_product_id(product.id_produto),
        nome=product_name(product),
        categoria=product_category(product),
        preco=product_price(product),
        stock=product_stock(product),
        score=suggestion.score,
        reason=suggestion.reason,
    )
