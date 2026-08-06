"""Product/Produto schemas for API validation."""

from pydantic import BaseModel, ConfigDict, Field
from typing import Optional

from services.product_pricing import discounted_product_price, product_discount_percent, product_tags


class ProdutoIngredientNutrition(BaseModel):
    id_ingrediente: int
    nome: str
    tipo: str
    status: int = 1
    quantidade: str | None = None
    calorias_por_grama: float | None = None
    calorias: float = 0


class ProdutoResponse(BaseModel):
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
    total_calorias: float | None = None
    customizavel: bool = False
    tags: list[str] = Field(default_factory=list)
    gluten_free: bool = False
    contains_alcohol: bool = False
    highlighted: bool = False
    available: bool = True
    unavailable_reason: Optional[str] = None
    unavailable_due_to_inactive_base: bool = False
    ingredientes: list[ProdutoIngredientNutrition] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)

    @classmethod
    def from_orm_custom(
        cls,
        p,
        *,
        unavailable_due_to_inactive_base: bool = False,
        unavailable_reason: str | None = None,
        ingredientes: list[ProdutoIngredientNutrition] | None = None,
    ):
        """Custom ORM conversion for Product model."""
        def normalize_image_path(image_path: str | None) -> str | None:
            if not image_path:
                return None
            if image_path.startswith(("http://", "https://", "/assets/", "/menu-images/")):
                return image_path
            if image_path.startswith("menu-images/"):
                return f"/{image_path}"
            return f"/menu-images/{image_path}"

        image_urls = []
        for image in getattr(p, 'imagens', []) or []:
            normalized = normalize_image_path(image.caminho_imagem)
            if normalized and normalized not in image_urls:
                image_urls.append(normalized)

        image_url = image_urls[0] if image_urls else None

        # Fallback: Generate image filename from product name if no image in DB
        if not image_url and p.nome:
    
            filename = p.nome.lower().replace(' ', '').replace('ã', 'a').replace('é', 'e').replace('ç', 'c')
      
            filename = ''.join(c for c in filename if c.isalnum())
            image_url = f"/menu-images/{filename}.webp"
            image_urls = [image_url]

        stock = int(getattr(p, "stock", 0) or 0)
        available = stock > 0 and not unavailable_due_to_inactive_base
        saved_calories = getattr(p, "total_calorias", None)
        ingredient_calories = sum(
            item.calorias
            for item in (ingredientes or [])
            if item.calorias is not None and item.calorias > 0
        )
        saved_calorie_value = float(saved_calories) if saved_calories is not None else None
        total_calorias = (
            saved_calorie_value
            if saved_calorie_value is not None and saved_calorie_value > 0
            else (round(ingredient_calories, 2) if ingredient_calories > 0 else None)
        )

        return cls(
            id=p.id_produto,
            id_display=p.id_produto_display,
            name=p.nome,
            category=p.categoria.nome_categoria if getattr(p, 'categoria', None) else p.id_categoria,
            description=p.descricao_produto,
            image=image_url,
            images=image_urls,
            price=float(discounted_product_price(p)) if p.preco else None,
            original_price=float(p.preco) if p.preco else None,
            discount_percent=float(product_discount_percent(p)),
            stock=stock,
            sold=int(getattr(p, "vendido", 0) or 0),
            total_calorias=total_calorias,
            customizavel=bool(getattr(p, "customizavel", 0)),
            tags=product_tags(p),
            gluten_free=bool(getattr(p, "gluten_free", 0)),
            contains_alcohol=bool(getattr(p, "contains_alcohol", 0)),
            highlighted=bool(getattr(p, "destaque", 0)),
            available=available,
            unavailable_reason=unavailable_reason if not available else None,
            unavailable_due_to_inactive_base=unavailable_due_to_inactive_base,
            ingredientes=ingredientes or [],
        )
