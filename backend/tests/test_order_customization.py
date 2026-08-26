from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from pydantic import ValidationError


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from models import CartProduct, CartProductCustomization  # noqa: E402
from modules.restaurant.routers.cart import _add_customized_item_impl, _trusted_guest_customization  # noqa: E402
from modules.restaurant.schemas.customization import CustomizedCartItemRequest, ItemCustomization  # noqa: E402
from modules.restaurant.models import CartCustomizationAction  # noqa: E402
from modules.restaurant.services.order_customization import (  # noqa: E402
    customization_from_json,
    customization_summary,
    customization_to_json,
    product_customization_options,
)


@dataclass
class FakeCategory:
    category_name: str


@dataclass
class FakeProduct:
    name: str
    product_description: str
    category: FakeCategory
    category_id: str = "CAT1"


class FakeSession:
    def __init__(self):
        self.added = []

    def add(self, instance):
        if isinstance(instance, CartProduct) and instance.cart_product_id is None:
            instance.cart_product_id = 101
        self.added.append(instance)

    def flush(self):
        return None

    def commit(self):
        return None

    def refresh(self, _instance):
        return None


class OrderCustomizationTests(unittest.TestCase):
    def test_customization_payload_round_trips_stably(self):
        customization = ItemCustomization(
            remove=["Onion", "onion", ""],
            add=["Extra sauce"],
            preferences=["Cut in half"],
            note="  no sesame  ",
        )

        encoded = customization_to_json(customization)
        decoded = customization_from_json(encoded)

        self.assertEqual(decoded.remove, ["Onion"])
        self.assertEqual(decoded.add, ["Extra sauce"])
        self.assertEqual(decoded.preferences, ["Cut in half"])
        self.assertEqual(decoded.note, "no sesame")

    def test_empty_customization_is_not_stored(self):
        self.assertIsNone(customization_to_json(ItemCustomization()))

    def test_customization_summary_is_readable(self):
        summary = customization_summary({
            "remove": ["Onion"],
            "add": ["Extra sauce"],
            "preferences": [],
            "note": "no sesame",
        })

        self.assertEqual(summary, "Remover: Cebola | Adicionar: Molho extra | Nota: no sesame")

    def test_product_customization_options_use_product_text(self):
        product = FakeProduct(
            name="Loaded Nachos",
            product_description="Corn tortilla with salsa guacamole jalapenos",
            category=FakeCategory("Starters"),
        )

        options = product_customization_options(product)

        self.assertIn("Salsa", options["remove"])
        self.assertIn("Molho extra", options["add"])
        self.assertIn("Molho à parte", options["preferences"])

    def test_customized_cart_request_accepts_notes_and_enforces_length(self):
        body = CustomizedCartItemRequest(product_id=1, notes="  no sesame  ")
        self.assertEqual(body.notes, "  no sesame  ")

        with self.assertRaises(ValidationError):
            CustomizedCartItemRequest(product_id=1, notes="x" * 256)

    def test_guest_customization_forwards_notes_to_validation(self):
        db = FakeSession()
        product = SimpleNamespace(product_id=1, customizable=True, price=Decimal("10"), discount_percentage=0)
        customization = ItemCustomization(removed_ingredients=[4], note="no sesame")
        trusted = ItemCustomization(removed_ingredients=[4], note="no sesame", final_unit_price=Decimal("10"))

        with patch(
            "modules.restaurant.routers.cart._validate_and_build_customization",
            return_value=(trusted, Decimal("10"), []),
        ) as validate:
            result, rows = _trusted_guest_customization(db, product, 2, customization)

        forwarded_body = validate.call_args.args[2]
        self.assertEqual(forwarded_body.notes, "no sesame")
        self.assertEqual(result, trusted)
        self.assertEqual(rows, [])

    def test_customized_cart_item_persists_notes(self):
        db = FakeSession()
        product = SimpleNamespace(product_id=1, customizable=True, price=Decimal("10"), discount_percentage=0, available=True)
        customer = SimpleNamespace(id=7)
        cart = SimpleNamespace(cart_id=9)
        body = CustomizedCartItemRequest(product_id=1, notes="no sesame")
        customization = ItemCustomization(note="no sesame", final_unit_price=Decimal("10"))
        customization_rows = [{
            "ingredient_id": None,
            "option_id": None,
            "action": CartCustomizationAction.REMOVE_INGREDIENT,
            "quantity": 1,
            "extra_price": Decimal("0"),
        }]

        with (
            patch("modules.restaurant.routers.cart._get_product_or_404", return_value=product),
            patch("modules.restaurant.routers.cart._ensure_product_orderable"),
            patch("modules.restaurant.routers.cart._ensure_quantity_limit"),
            patch(
                "modules.restaurant.routers.cart._validate_and_build_customization",
                return_value=(customization, Decimal("10"), customization_rows),
            ),
            patch("modules.restaurant.routers.cart._get_or_create_cart", return_value=cart),
            patch("modules.restaurant.routers.cart._find_cart_line", return_value=None),
            patch("modules.restaurant.routers.cart._build_cart_out", return_value="cart-response"),
        ):
            response = _add_customized_item_impl(body, db, customer)

        persisted = next(item for item in db.added if isinstance(item, CartProductCustomization))
        self.assertEqual(persisted.notes, "no sesame")
        self.assertEqual(response, "cart-response")


if __name__ == "__main__":
    unittest.main()
