"""Product/Product schemas for API validation."""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

from schemas.enums import EntityStatus, IngredientType
from schemas.media import ProductMediaResponse
from schemas.pagination import PaginatedResponse
from services.product_media import product_media_responses
from services.product_pricing import discounted_product_price, product_discount_percent, product_tags


class ProductIngredientNutrition(BaseModel):
    ingredient_id: int
    name: str
    type: IngredientType
    status: EntityStatus = EntityStatus.ACTIVE
    available: bool = True
    quantity: str | None = None
    calories_per_gram: float | None = None
    calories: float = 0


class ProductResponse(BaseModel):
    """Response model for a product."""
    id: int
    id_display: str
    category_id: int
    category: str
    name: str
    description: str | None
    media: list[ProductMediaResponse] = Field(default_factory=list)
    price: float | None
    original_price: float | None = None
    discount_percent: float = 0
    sold: int = 0
    total_calories: float | None = None
    customizable: bool = False
    tags: list[str] = Field(default_factory=list)
    gluten_free: bool = False
    contains_alcohol: bool = False
    highlighted: bool = False
    available: bool = True
    unavailable_reason: Optional[str] = None
    unavailable_due_to_unavailable_base: bool = False
    ingredients: list[ProductIngredientNutrition] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(
        cls,
        p,
        *,
        unavailable_due_to_unavailable_base: bool = False,
        unavailable_reason: str | None = None,
        ingredients: list[ProductIngredientNutrition] | None = None,
    ):
        """Custom ORM conversion for Product model."""
        available = bool(getattr(p, "available", False)) and not unavailable_due_to_unavailable_base
        saved_calories = getattr(p, "total_calories", None)
        ingredient_calories = sum(
            item.calories
            for item in (ingredients or [])
            if item.calories is not None and item.calories > 0
        )
        saved_calorie_value = float(saved_calories) if saved_calories is not None else None
        total_calories = (
            saved_calorie_value
            if saved_calorie_value is not None and saved_calorie_value > 0
            else (round(ingredient_calories, 2) if ingredient_calories > 0 else None)
        )

        return cls(
            id=p.product_id,
            id_display=p.product_display_id,
            category_id=p.category_id,
            name=p.name,
            category=p.category.category_name if getattr(p, 'category', None) else p.category_id,
            description=p.product_description,
            media=product_media_responses(p),
            price=float(discounted_product_price(p)) if p.price else None,
            original_price=float(p.price) if p.price else None,
            discount_percent=float(product_discount_percent(p)),
            sold=int(getattr(p, "sold", 0) or 0),
            total_calories=total_calories,
            customizable=bool(getattr(p, "customizable", 0)),
            tags=product_tags(p),
            gluten_free=bool(getattr(p, "gluten_free", 0)),
            contains_alcohol=bool(getattr(p, "contains_alcohol", 0)),
            highlighted=bool(getattr(p, "featured", 0)),
            available=available,
            unavailable_reason=unavailable_reason if not available else None,
            unavailable_due_to_unavailable_base=unavailable_due_to_unavailable_base,
            ingredients=ingredients or [],
        )


class ProductCategoryFacet(BaseModel):
    category_id: int
    category_display_id: str
    name: str
    count: int = Field(ge=0)


class ProductCatalogFacets(BaseModel):
    total_products: int = Field(ge=0)
    max_price: float = Field(ge=0)
    categories: list[ProductCategoryFacet] = Field(default_factory=list)


class ProductPageResponse(PaginatedResponse[ProductResponse]):
    facets: ProductCatalogFacets
