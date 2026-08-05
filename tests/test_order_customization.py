from dataclasses import dataclass
from pathlib import Path
import sys
import unittest


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from schemas.customization import ItemCustomization  # noqa: E402
from services.order_customization import (  # noqa: E402
    customization_from_json,
    customization_summary,
    customization_to_json,
    product_customization_options,
)


@dataclass
class FakeCategory:
    nome_categoria: str


@dataclass
class FakeProduct:
    nome: str
    descricao_produto: str
    categoria: FakeCategory
    id_categoria: str = "CAT1"


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
            nome="Loaded Nachos",
            descricao_produto="Corn tortilla with salsa guacamole jalapenos",
            categoria=FakeCategory("Starters"),
        )

        options = product_customization_options(product)

        self.assertIn("Salsa", options["remove"])
        self.assertIn("Molho extra", options["add"])
        self.assertIn("Molho à parte", options["preferences"])


if __name__ == "__main__":
    unittest.main()
