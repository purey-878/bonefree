from dataclasses import dataclass
from decimal import Decimal
import sys
from pathlib import Path
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from services.substitution import (  # noqa: E402
    availability_reason,
    is_product_available,
    rank_substitutions,
    suggest_similar_dishes,
)


@dataclass
class FakeCategory:
    category_name: str


@dataclass
class FakeProduct:
    product_id: str
    name: str
    product_description: str
    price: Decimal
    stock: int
    category: FakeCategory
    status: int = 1
    deleted_at: object = None
    nutrition: dict | None = None


def product(
    product_id: str,
    name: str,
    description: str,
    category: str,
    price: str,
    stock: int,
    status: int = 1,
    nutrition: dict | None = None,
) -> FakeProduct:
    return FakeProduct(
        product_id=product_id,
        name=name,
        product_description=description,
        price=Decimal(price),
        stock=stock,
        category=FakeCategory(category),
        status=status,
        nutrition=nutrition,
    )


class SubstitutionServiceTests(unittest.TestCase):
    def test_item_in_stock_is_available(self):
        item = product("P1", "Kick Burger", "smoky bbq burger", "Burgers", "10.00", 3)

        self.assertTrue(is_product_available(item, quantity=1, stock_threshold=0))
        self.assertEqual(
            availability_reason(item, quantity=1, stock_threshold=0),
            "O item está disponível.",
        )

    def test_item_out_of_stock_is_unavailable(self):
        item = product("P1", "Kick Burger", "smoky bbq burger", "Burgers", "10.00", 0)

        self.assertFalse(is_product_available(item, quantity=1, stock_threshold=0))
        self.assertEqual(
            availability_reason(item, quantity=1, stock_threshold=0),
            "O item está esgotado.",
        )

    def test_no_substitute_available(self):
        original = product("P1", "Kick Burger", "smoky bbq burger", "Burgers", "10.00", 0)
        candidates = [
            product("P2", "Garden Bowl", "fresh acai fruit", "Bowls", "9.00", 5),
            product("P3", "BBQ Burger", "smoky bbq burger", "Burgers", "10.50", 0),
        ]

        self.assertEqual(rank_substitutions(original, candidates), [])

    def test_multiple_substitutes_ranked_correctly(self):
        original = product(
            "P1",
            "Kick Burger",
            "smoky bbq cheddar burger",
            "Burgers",
            "10.00",
            0,
            nutrition={"calories": 600, "protein": 25},
        )
        best = product(
            "P2",
            "BBQ Burger",
            "smoky bbq cheddar patty",
            "Burgers",
            "10.50",
            8,
            nutrition={"calories": 610, "protein": 24},
        )
        same_category_less_similar = product(
            "P3",
            "Classic Burger",
            "lettuce tomato aioli",
            "Burgers",
            "13.00",
            8,
            nutrition={"calories": 720, "protein": 20},
        )
        shared_tags_other_category = product(
            "P4",
            "BBQ Wrap",
            "smoky bbq tortilla",
            "Wraps",
            "9.50",
            8,
            nutrition={"calories": 520, "protein": 18},
        )

        ranked = rank_substitutions(
            original,
            [shared_tags_other_category, same_category_less_similar, best],
            limit=3,
        )

        self.assertEqual([item.product.product_id for item in ranked], ["P2", "P3", "P4"])
        self.assertGreater(ranked[0].score, ranked[1].score)
        self.assertIn("same category", ranked[0].reason)

    def test_similar_dishes_only_include_available_items(self):
        original = product(
            "P1",
            "Loaded Nachos",
            "corn tortilla salsa guacamole spicy",
            "Starters",
            "8.00",
            0,
        )
        available_similar = product(
            "P2",
            "Baja Taco",
            "corn tortilla salsa spicy slaw",
            "Tacos",
            "8.50",
            4,
        )
        unavailable_similar = product(
            "P3",
            "Nacho Bowl",
            "corn salsa guacamole",
            "Starters",
            "9.00",
            0,
        )
        unrelated = product(
            "P4",
            "Acai Bowl",
            "banana granola berries",
            "Bowls",
            "7.50",
            5,
        )

        ranked = suggest_similar_dishes(
            original,
            [available_similar, unavailable_similar, unrelated],
            limit=5,
        )

        self.assertEqual([item.product.product_id for item in ranked], ["P2"])
        self.assertIn("currently available", ranked[0].reason)


if __name__ == "__main__":
    unittest.main()
