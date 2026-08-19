"""Product/Product schemas for API validation."""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

from services.product_pricing import discounted_product_price, product_discount_percent, product_tags


class ProductIngredientNutrition(BaseModel):
    ingredient_id: int
    name: str
    type: str
    status: int = 1
    quantity: str | None = None
    calories_per_gram: float | None = None
    calorias: float = 0


class ProductResponse(BaseModel):
    """Response model for a product."""
    id: int
    id_display: str
    category: str
    name: str
    description: str | None
    image: str | None
    images: list[str] = Field(default_factory=list)
    price: float | None
    original_price: float | None = None
    discount_percent: float = 0
    stock: int
    sold: int = 0
    total_calories: float | None = None
    customizable: bool = False
    tags: list[str] = Field(default_factory=list)
    gluten_free: bool = False
    contains_alcohol: bool = False
    highlighted: bool = False
    available: bool = True
    unavailable_reason: Optional[str] = None
    unavailable_due_to_inactive_base: bool = False
    ingredients: list[ProductIngredientNutrition] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(
        cls,
        p,
        *,
        unavailable_due_to_inactive_base: bool = False,
        unavailable_reason: str | None = None,
        ingredients: list[ProductIngredientNutrition] | None = None,
    ):
        """Custom ORM conversion for Product model."""
        def normalize_image_path(image_path: str | None) -> str | None:
            if not image_path:
                return None
            if image_path.startswith(("http://", "https://", "/assets/", "/uploads/", "/menu-images/")):
                return image_path
            if image_path.startswith("menu-images/"):
                return f"/{image_path}"
            return f"/menu-images/{image_path}"

        image_urls = []
        for image in getattr(p, 'images', []) or []:
            normalized = normalize_image_path(image.image_path)
            if normalized and normalized not in image_urls:
                image_urls.append(normalized)

        image_url = image_urls[0] if image_urls else None

        # Fallback: Generate image filename from product name if no image in DB
        if not image_url and p.name:
    
            filename = p.name.lower().replace(' ', '').replace('ã', 'a').replace('é', 'e').replace('ç', 'c')
      
            filename = ''.join(c for c in filename if c.isalnum())
            image_url = f"/menu-images/{filename}.webp"
            image_urls = [image_url]

        stock = int(getattr(p, "stock", 0) or 0)
        available = stock > 0 and not unavailable_due_to_inactive_base
        saved_calories = getattr(p, "total_calories", None)
        ingredient_calories = sum(
            item.calorias
            for item in (ingredients or [])
            if item.calorias is not None and item.calorias > 0
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
            name=p.name,
            category=p.category.category_name if getattr(p, 'category', None) else p.category_id,
            description=p.product_description,
            image=image_url,
            images=image_urls,
            price=float(discounted_product_price(p)) if p.price else None,
            original_price=float(p.price) if p.price else None,
            discount_percent=float(product_discount_percent(p)),
            stock=stock,
            sold=int(getattr(p, "sold", 0) or 0),
            total_calories=total_calories,
            customizable=bool(getattr(p, "customizable", 0)),
            tags=product_tags(p),
            gluten_free=bool(getattr(p, "gluten_free", 0)),
            contains_alcohol=bool(getattr(p, "contains_alcohol", 0)),
            highlighted=bool(getattr(p, "featured", 0)),
            available=available,
            unavailable_reason=unavailable_reason if not available else None,
            unavailable_due_to_inactive_base=unavailable_due_to_inactive_base,
            ingredients=ingredients or [],
        )
