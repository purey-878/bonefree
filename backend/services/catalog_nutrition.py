"""Database expression for the calorie total displayed by the public catalog."""
from sqlalchemy import Numeric, case, cast, func, select
from models import Ingredient, Product, ProductIngredient


def calorie_total_expression():
    quantity = func.lower(func.replace(func.trim(func.coalesce(ProductIngredient.quantity, "")), ",", "."))
    valid = quantity.regexp_match(r"^([0-9]+(\.[0-9]+)?|\.[0-9]+)\s*(g|gram|grams|kg|kilogram|kilograms)?$")
    numeric_quantity = quantity
    for unit in ("kilograms", "kilogram", "grams", "gram", "kg", "g"):
        numeric_quantity = func.replace(numeric_quantity, unit, "")
    grams = cast(func.trim(numeric_quantity), Numeric(20, 6)) * case(
        (quantity.like("%kg"), 1000), (quantity.like("%kilogram"), 1000),
        (quantity.like("%kilograms"), 1000), else_=1,
    )
    calories = func.round(grams * Ingredient.calories_per_gram, 2)
    recipe_total = select(func.sum(case((valid & (calories > 0), calories), else_=0))).select_from(
        ProductIngredient
    ).join(Ingredient, Ingredient.ingredient_id == ProductIngredient.ingredient_id).where(
        ProductIngredient.product_id == Product.product_id
    ).correlate(Product).scalar_subquery()
    return case((Product.total_calories > 0, Product.total_calories), else_=func.nullif(func.round(recipe_total, 2), 0))
