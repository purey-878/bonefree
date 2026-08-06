"""Backfill product ingredient quantities and product calorie totals.

The public product detail page derives the calorie breakdown from:
produto_ingrediente.quantidade * ingrediente.calorias_por_grama.
This script fills curated serving quantities for active food products and
recomputes produto.total_calorias from the linked ingredients.
"""

from __future__ import annotations

import re
import sqlite3
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


DB_PATH = Path(__file__).with_name("bonefree_rest_2.db")

INGREDIENT_DEFAULTS: dict[str, tuple[str, Decimal]] = {
    "Americano": ("INGREDIENTES_NORMAIS", Decimal("0.02")),
    "Aperol": ("BEBIDA", Decimal("1.40")),
    "Bitters": ("BEBIDA", Decimal("2.50")),
    "Blue Curação": ("BEBIDA", Decimal("3.20")),
    "Cachaça": ("BEBIDA", Decimal("2.31")),
    "Café Expresso": ("INGREDIENTES_NORMAIS", Decimal("0.02")),
    "Campari": ("BEBIDA", Decimal("2.50")),
    "Cappuccino": ("INGREDIENTES_NORMAIS", Decimal("0.50")),
    "Club Mate": ("INGREDIENTES_NORMAIS", Decimal("0.20")),
    "Esporão Garrafa": ("INGREDIENTES_NORMAIS", Decimal("0.85")),
    "Espumante Cinzano": ("BEBIDA", Decimal("0.75")),
    "Fritz": ("BEBIDA", Decimal("0.42")),
    "Gin": ("BEBIDA", Decimal("2.18")),
    "Ginger Ale": ("INGREDIENTES_NORMAIS", Decimal("0.34")),
    "Ginger Beer": ("BEBIDA", Decimal("0.40")),
    "Grenadina": ("BEBIDA", Decimal("2.68")),
    "Ice Tea": ("INGREDIENTES_NORMAIS", Decimal("0.30")),
    "Iced Latte": ("INGREDIENTES_NORMAIS", Decimal("0.60")),
    "Kombucha": ("INGREDIENTES_NORMAIS", Decimal("0.20")),
    "Licor de laranja": ("BEBIDA", Decimal("3.20")),
    "Martini Rosso": ("BEBIDA", Decimal("1.40")),
    "Rum branco": ("BEBIDA", Decimal("2.31")),
    "Rum de côco": ("BEBIDA", Decimal("2.50")),
    "Rum escuro": ("BEBIDA", Decimal("2.31")),
    "Sangria Jarro 1L": ("INGREDIENTES_NORMAIS", Decimal("0.85")),
    "Shot de expresso": ("BEBIDA", Decimal("0.02")),
    "Sumo de ananás": ("BEBIDA", Decimal("0.53")),
    "Sumo de laranja": ("BEBIDA", Decimal("0.45")),
    "Sumo de limão": ("BEBIDA", Decimal("0.22")),
    "Sumo do Dia": ("INGREDIENTES_NORMAIS", Decimal("0.45")),
    "Tequila": ("BEBIDA", Decimal("2.31")),
    "Tia Maria": ("BEBIDA", Decimal("3.15")),
    "Tortilha de milho": ("BASE", Decimal("2.18")),
    "Tortilha de trigo": ("BASE", Decimal("3.10")),
    "Triple Sec": ("BEBIDA", Decimal("3.20")),
    "Vodka": ("BEBIDA", Decimal("2.31")),
    "Whisky": ("BEBIDA", Decimal("2.50")),
    "Why Not - Refrigerante Artesanal": ("BEBIDA", Decimal("0.42")),
    "Xarope de amêndoas": ("BEBIDA", Decimal("3.00")),
    "Xarope de morango": ("BEBIDA", Decimal("3.00")),
    "Água com gás": ("BEBIDA", Decimal("0")),
    "Água das Pedras": ("INGREDIENTES_NORMAIS", Decimal("0")),
    "Água de Coco": ("INGREDIENTES_NORMAIS", Decimal("0.19")),
}

PRODUCT_INGREDIENT_QUANTITIES: dict[str, dict[str, str]] = {
    "Latino Loaded Nachos": {
        "Tortilha chips": "75g",
        "Queijo fumado derretido": "35g",
        "Guacamole": "45g",
        "Pico de gallo": "45g",
        "Maionese de chipotle": "20g",
        "Cebola frita": "10g",
    },
    "Vegan Momos": {
        "Dumplings fritos": "180g",
        "Beyond Meat": "80g",
        "Batatas fritas doces": "120g",
        "Masalas": "5g",
        "Cebola em pickles": "8g",
        "Cebola roxa": "8g",
        "Coentros": "2g",
    },
    "Superfly - BBQ Wings": {
        "Couve-flor frita": "180g",
        "Molho BBQ": "35g",
    },
    "Fried Onion Rings": {
        "Aros de cebola fritos": "160g",
        "Molho BBQ": "30g",
    },
    "Soup of the Day": {
        "Sopa caseira do dia": "300g",
    },
    "Azeitonas": {
        "Azeitonas": "80g",
    },
    "Chips de Tortilha Simples": {
        "Chips de tortilha": "90g",
    },
    "Batatas Fritas": {
        "Batatas fritas": "150g",
    },
    "Batatas Fritas Doces": {
        "Batatas fritas doces": "150g",
    },
    "Maionese de Chipotle": {
        "Maionese de chipotle": "30g",
    },
    "Maionese de Alho": {
        "Maionese de alho": "30g",
    },
    "Ketchup": {
        "Ketchup": "30g",
    },
    "Molho BBQ": {
        "Molho BBQ": "30g",
    },
    "Bonefree Cheeseburger": {
        "Pão brioche": "70g",
        "Hambúrguer Beyond Meat": "100g",
        "Batatas fritas": "150g",
        "Queijo cheddar": "20g",
        "Fakon": "10g",
        "Molho BBQ": "15g",
        "Alface": "10g",
        "Tomate": "25g",
        "Cebola roxa": "8g",
    },
    "Big Poppa": {
        "Pão de cebola roxa": "70g",
        "Hambúrguer de feijão preto": "90g",
        "Batatas fritas doces": "100g",
        "Batatas fritas": "30g",
        "Queijo fumado derretido": "20g",
        "Maionese de sriracha": "20g",
        "Cebola caramelizada": "15g",
        "Cebola frita": "8g",
        "Alface": "10g",
        "Tomate": "25g",
    },
    "Finger Lickin Chicken Burger": {
        "Pão de cebola roxa": "70g",
        "Tofu marinado frito": "120g",
        "Batatas fritas": "150g",
        "Maionese de alho": "20g",
        "Alface": "10g",
        "Tomate": "25g",
        "Pickles": "15g",
    },
    "Chickpeas Tikka Masala": {
        "Arroz basmati": "180g",
        "Grão de bico": "120g",
        "Legumes": "100g",
        "Leite de côco": "80g",
        "Masalas": "10g",
    },
    "Drop It Like It’s Hot Dog": {
        "Pão de cachorro": "80g",
        "Salsicha Beyond": "80g",
        "Batatas fritas": "150g",
        "Queijo derretido": "30g",
        "Guacamole": "40g",
        "Molho de mostarda": "20g",
        "Cebola frita": "10g",
        "Cebola em pickles": "15g",
    },
    "Burritinho": {
        "Tortilha de trigo": "70g",
        "Feijão preto": "120g",
        "Pimentos assados com cebola": "60g",
        "Pico de gallo": "50g",
        "Abacate": "40g",
        "Maionese de chipotle": "20g",
        "Alface": "20g",
        "Coentros": "3g",
    },
    "Bonefree Pasta": {
        "Massa": "220g",
        "Queijo creme": "50g",
        "Tomate": "100g",
        "Queijo parmesão": "15g",
        "Ervas aromáticas": "3g",
    },
    "Sobremesa do Dia": {
        "Sobremesa do Dia": "120g",
    },
    "Baja California": {
        "Tortilha de milho": "30g",
        "Douradinhos Moving Mountains": "80g",
        "Coleslaw": "35g",
        "Maionese de chipotle": "20g",
        "Pico de gallo": "35g",
        "Cebola roxa": "5g",
        "Coentros": "2g",
    },
    "Lentil Taco": {
        "Tortilha de milho": "30g",
        "Estufado de lentinhas fumadas": "90g",
        "Legumes": "50g",
        "Pickles de cebola roxa": "15g",
        "Coentros": "2g",
    },
    "Crispy Cauliflower": {
        "Tortilha de milho": "30g",
        "Couve-flor crocante": "90g",
        "Coleslaw": "35g",
        "Abacate": "30g",
        "Maionese de sriracha": "20g",
        "Cebola roxa": "5g",
        "Coentros": "2g",
    },
    "Margarita": {
        "Tequila": "50g",
        "Triple Sec": "20g",
        "Sumo de limão": "25g",
    },
    "Moscow Mule": {
        "Vodka": "50g",
        "Ginger Beer": "150g",
        "Lima": "15g",
    },
    "Aperol Spritz": {
        "Aperol": "60g",
        "Espumante Cinzano": "90g",
        "Água com gás": "30g",
    },
    "Why Not - Refrigerante Artesanal": {
        "Why Not - Refrigerante Artesanal": "330g",
    },
    "Fritz": {
        "Fritz": "330g",
    },
    "Mai Tai": {
        "Rum branco": "40g",
        "Rum escuro": "20g",
        "Licor de laranja": "15g",
        "Xarope de amêndoas": "15g",
        "Lima": "25g",
    },
    "Cheeky Strawberry": {
        "Vodka": "50g",
        "Xarope de morango": "25g",
        "Sumo de limão": "25g",
        "Aquafaba": "20g",
    },
    "Blue Hawaiian": {
        "Rum branco": "40g",
        "Rum de côco": "20g",
        "Blue Curação": "20g",
        "Sumo de ananás": "100g",
    },
    "Mojito": {
        "Rum branco": "50g",
        "Lima": "25g",
        "Açúcar": "15g",
        "Água com gás": "100g",
        "Hortelã": "2g",
    },
    "Caipirinha": {
        "Cachaça": "50g",
        "Lima": "50g",
        "Açúcar": "15g",
    },
    "Old Fashioned": {
        "Whisky": "60g",
        "Açúcar": "5g",
        "Bitters": "2g",
    },
    "Negroni": {
        "Campari": "30g",
        "Gin": "30g",
        "Martini Rosso": "30g",
    },
    "Whisky Sour": {
        "Whisky": "50g",
        "Sumo de limão": "25g",
        "Açúcar": "15g",
    },
    "Expresso Martini": {
        "Vodka": "50g",
        "Tia Maria": "30g",
        "Shot de expresso": "30g",
    },
    "Tequila Sunrise": {
        "Tequila": "50g",
        "Sumo de laranja": "100g",
        "Grenadina": "20g",
    },
    "Club Mate": {
        "Club Mate": "330g",
    },
    "Ice Tea": {
        "Ice Tea": "330g",
    },
    "Kombucha": {
        "Kombucha": "330g",
    },
    "Sumo do Dia": {
        "Sumo do Dia": "250g",
    },
    "Ginger Ale": {
        "Ginger Ale": "200g",
    },
    "Água de Coco": {
        "Água de Coco": "330g",
    },
    "Água das Pedras": {
        "Água das Pedras": "250g",
    },
    "Matcha": {
        "Matcha": "5g",
    },
    "Café Expresso": {
        "Café Expresso": "30g",
    },
    "Americano": {
        "Americano": "180g",
    },
    "Iced Latte": {
        "Iced Latte": "250g",
    },
    "Cappuccino": {
        "Cappuccino": "180g",
    },
    "Esporão Garrafa": {
        "Esporão Garrafa": "750g",
    },
    "Sangria Jarro 1L": {
        "Sangria Jarro 1L": "1000g",
    },
}


def parse_quantity_to_grams(quantity: str) -> Decimal:
    match = re.fullmatch(r"(\d+(?:\.\d+)?|\.\d+)\s*(g|kg)?", quantity.strip().lower())
    if not match:
        raise ValueError(f"Unsupported quantity: {quantity!r}")
    amount = Decimal(match.group(1))
    unit = match.group(2) or "g"
    return amount * Decimal("1000") if unit == "kg" else amount


def get_or_create_ingredient(
    cur: sqlite3.Cursor,
    name: str,
    fallback_type: str = "INGREDIENTES_NORMAIS",
    fallback_calories: Decimal | None = None,
) -> tuple[int, str, Decimal]:
    row = cur.execute(
        "select id_ingrediente, tipo, calorias_por_grama from ingrediente where lower(nome) = lower(?)",
        (name,),
    ).fetchone()
    if row is None:
        if fallback_calories is None:
            raise ValueError(f"Ingredient {name!r} does not exist and has no calorie default.")
        cur.execute(
            "insert into ingrediente (nome, tipo, status, calorias_por_grama) values (?, ?, 1, ?)",
            (name, fallback_type, str(fallback_calories)),
        )
        return cur.lastrowid, fallback_type, fallback_calories

    ingredient_id = int(row["id_ingrediente"])
    ingredient_type = row["tipo"]
    calories = row["calorias_por_grama"]
    if calories is None:
        if fallback_calories is None:
            raise ValueError(f"Ingredient {name!r} is missing calorias_por_grama.")
        cur.execute(
            "update ingrediente set calorias_por_grama = ? where id_ingrediente = ?",
            (str(fallback_calories), ingredient_id),
        )
        calories = fallback_calories

    return ingredient_id, ingredient_type, Decimal(str(calories))


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    updated_products = 0
    updated_links = 0
    inserted_links = 0

    for product_name, quantities in PRODUCT_INGREDIENT_QUANTITIES.items():
        product = cur.execute(
            """
            select p.id_produto
            from produto p
            where p.nome = ?
              and coalesce(p.status, 1) = 1
              and p.deleted_at is null
            """,
            (product_name,),
        ).fetchone()
        if product is None:
            raise ValueError(f"Active food product {product_name!r} was not found.")

        product_id = int(product["id_produto"])
        total = Decimal("0")

        for ingredient_name, quantity in quantities.items():
            default = INGREDIENT_DEFAULTS.get(ingredient_name)
            ingredient_id, ingredient_type, calories_per_gram = get_or_create_ingredient(
                cur,
                ingredient_name,
                fallback_type=default[0] if default else "INGREDIENTES_NORMAIS",
                fallback_calories=default[1] if default else None,
            )
            grams = parse_quantity_to_grams(quantity)
            total += grams * calories_per_gram

            existing = cur.execute(
                "select 1 from produto_ingrediente where id_produto = ? and id_ingrediente = ?",
                (product_id, ingredient_id),
            ).fetchone()
            if existing:
                cur.execute(
                    """
                    update produto_ingrediente
                    set quantidade = ?
                    where id_produto = ? and id_ingrediente = ?
                    """,
                    (quantity, product_id, ingredient_id),
                )
                updated_links += 1
            else:
                cur.execute(
                    """
                    insert into produto_ingrediente (
                        id_produto, id_ingrediente, incluido_por_defeito, removivel, substituivel, quantidade
                    ) values (?, ?, 1, ?, 0, ?)
                    """,
                    (product_id, ingredient_id, 1 if ingredient_type == "INGREDIENTES_NORMAIS" else 0, quantity),
                )
                inserted_links += 1

        total = total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        cur.execute(
            "update produto set total_calorias = ? where id_produto = ?",
            (str(total), product_id),
        )
        updated_products += 1

    con.commit()
    con.close()
    print(
        f"updated_products={updated_products} updated_links={updated_links} "
        f"inserted_links={inserted_links}"
    )


if __name__ == "__main__":
    main()
