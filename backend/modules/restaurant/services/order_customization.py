"""Helpers for storing and displaying item-level order customizations."""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any

from modules.restaurant.schemas.customization import ItemCustomization


COMMON_ADD_OPTIONS = (
    "Molho extra",
    "Queijo vegan extra",
    "Pickles extra",
    "Jalapeños extra",
    "Salada extra",
    "Cebola crocante extra",
)

COMMON_PREFERENCES = (
    "Pouco molho",
    "Molho à parte",
    "Mais picante",
    "Sem picante",
    "Cortado ao meio",
)

LEGACY_CUSTOMIZATION_LABELS = {
    "remove": "Remover",
    "add": "Adicionar",
    "preferences": "Preferências",
    "note": "Nota",
}

LEGACY_CUSTOMIZATION_VALUES = {
    "extra sauce": "Molho extra",
    "extra vegan cheese": "Queijo vegan extra",
    "extra pickles": "Pickles extra",
    "extra jalapenos": "Jalapeños extra",
    "extra jalapeños": "Jalapeños extra",
    "extra salad": "Salada extra",
    "extra crispy onions": "Cebola crocante extra",
    "light sauce": "Pouco molho",
    "sauce on the side": "Molho à parte",
    "extra spicy": "Mais picante",
    "no spice": "Sem picante",
    "cut in half": "Cortado ao meio",
    "pickles": "Pickles",
    "onion": "Cebola",
    "tomato": "Tomate",
    "lettuce": "Alface",
    "sauce": "Molho",
    "slaw": "Couve marinada",
    "coriander": "Coentros",
    "spice": "Picante",
    "berries": "Frutos vermelhos",
    "seeds": "Sementes",
    "syrup": "Calda",
}

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "bowl",
    "burger",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "das",
    "e",
    "fresh",
    "from",
    "in",
    "made",
    "na",
    "no",
    "of",
    "on",
    "or",
    "para",
    "the",
    "to",
    "vegan",
    "with",
}


def customization_to_json(customization: ItemCustomization | dict[str, Any] | None) -> str | None:
    normalized = normalize_customization(customization)
    if not normalized:
        return None

    return json.dumps(normalized, ensure_ascii=True, sort_keys=True, separators=(",", ":"))


def customization_from_json(value: str | None) -> ItemCustomization | None:
    if not value:
        return None

    try:
        decoded = json.loads(value)
    except (TypeError, ValueError):
        return None

    normalized = normalize_customization(decoded)
    return ItemCustomization(**normalized) if normalized else None


def normalize_customization(customization: ItemCustomization | dict[str, Any] | None) -> dict[str, Any]:
    if customization is None:
        return {}

    model = customization if isinstance(customization, ItemCustomization) else ItemCustomization(**customization)
    normalized = model.model_dump(mode="json")
    normalized["remove"] = _clean_list(normalized.get("remove", []))
    normalized["add"] = _clean_list(normalized.get("add", []))
    normalized["preferences"] = _clean_list(normalized.get("preferences", []))
    normalized["note"] = (normalized.get("note") or "").strip() or None
    normalized["removed_ingredients"] = sorted({
        int(item) for item in normalized.get("removed_ingredients", []) if int(item) > 0
    })
    normalized["extras"] = _clean_extra_selections(normalized.get("extras", []))
    normalized["substitutions"] = _clean_substitution_selections(normalized.get("substitutions", []))

    return {key: value for key, value in normalized.items() if value}


def customization_lines(customization: ItemCustomization | dict[str, Any] | str | None) -> list[str]:
    if isinstance(customization, str):
        customization = customization_from_json(customization)

    normalized = normalize_customization(customization)
    lines = []

    if normalized.get("remove"):
        lines.append(f"{LEGACY_CUSTOMIZATION_LABELS['remove']}: {_display_choices(normalized['remove'])}")
    if normalized.get("add"):
        lines.append(f"{LEGACY_CUSTOMIZATION_LABELS['add']}: {_display_choices(normalized['add'])}")
    if normalized.get("preferences"):
        lines.append(f"{LEGACY_CUSTOMIZATION_LABELS['preferences']}: {_display_choices(normalized['preferences'])}")
    if normalized.get("note"):
        lines.append(f"{LEGACY_CUSTOMIZATION_LABELS['note']}: {normalized['note']}")
    return lines


def customization_summary(customization: ItemCustomization | dict[str, Any] | str | None) -> str | None:
    lines = customization_lines(customization)
    return " | ".join(lines) if lines else None


def product_customization_options(product: Any) -> dict[str, list[str]]:
    """Generate customization choices from fields available in the product catalog."""
    remove_options = _ingredient_like_terms(product)

    return {
        "remove": remove_options,
        "add": list(COMMON_ADD_OPTIONS),
        "preferences": list(COMMON_PREFERENCES),
    }


def _ingredient_like_terms(product: Any) -> list[str]:
    text = str(getattr(product, "product_description", "") or "")
    results = _terms_from_text(text)
    if results:
        return results

    text = str(getattr(product, "name", "") or "")
    results = _terms_from_text(text)
    if results:
        return results

    category = getattr(getattr(product, "category", None), "category_name", "") or getattr(product, "category_id", "")
    category_key = _normalize_text(str(category))
    if "burger" in category_key:
        return ["Pickles", "Cebola", "Tomate", "Alface", "Molho"]
    if "taco" in category_key:
        return ["Salsa", "Couve marinada", "Guacamole", "Coentros", "Picante"]
    if "bowl" in category_key:
        return ["Granola", "Banana", "Frutos vermelhos", "Sementes", "Calda"]

    return ["Molho", "Cebola", "Tomate", "Picante"]


def _terms_from_text(text: str) -> list[str]:
    normalized = _normalize_text(text)
    tokens = re.findall(r"[a-z0-9]+", normalized)

    results = []
    seen = set()
    for token in tokens:
        if len(token) < 4 or token in _STOP_WORDS:
            continue
        label = token.replace("jalapenos", "jalapenos").title()
        key = label.lower()
        if key not in seen:
            seen.add(key)
            results.append(label)
        if len(results) >= 8:
            break

    return results


def _clean_list(items: list[str]) -> list[str]:
    cleaned = []
    seen = set()
    for raw_item in items:
        item = str(raw_item).strip()[:60]
        key = item.lower()
        if item and key not in seen:
            seen.add(key)
            cleaned.append(item)
    return cleaned


def _display_choice(value: str) -> str:
    return LEGACY_CUSTOMIZATION_VALUES.get(value.strip().casefold(), value)


def _display_choices(values: list[str]) -> str:
    return ", ".join(_display_choice(value) for value in values)


def _clean_extra_selections(items: list[dict[str, Any]]) -> list[dict[str, int]]:
    cleaned = []
    seen = set()
    for raw_item in items:
        option_id = int(raw_item.get("option_id", 0))
        quantity = int(raw_item.get("quantity", 0))
        if option_id <= 0 or quantity <= 0 or option_id in seen:
            continue
        seen.add(option_id)
        cleaned.append({"option_id": option_id, "quantity": quantity})
    return cleaned


def _clean_substitution_selections(items: list[dict[str, Any]]) -> list[dict[str, int]]:
    cleaned = []
    seen = set()
    for raw_item in items:
        original_id = int(raw_item.get("original_ingredient_id", 0))
        new_id = int(raw_item.get("new_ingredient_id", 0))
        if original_id <= 0 or new_id <= 0 or original_id in seen:
            continue
        seen.add(original_id)
        cleaned.append({
            "original_ingredient_id": original_id,
            "new_ingredient_id": new_id,
        })
    return cleaned


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()
