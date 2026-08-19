"""Stock-out substitution and similar dish ranking helpers."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Iterable


DEFAULT_STOCK_THRESHOLD = 0
NUTRITION_FIELDS = (
    "calories",
    "kcal",
    "protein",
    "proteina",
    "fat",
    "gordura",
    "carbs",
    "carbohydrates",
    "hidratos",
    "sugar",
    "acucar",
    "fiber",
    "fibra",
    "sodium",
    "sodio",
)

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "as",
    "at",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "das",
    "e",
    "em",
    "for",
    "from",
    "in",
    "is",
    "it",
    "made",
    "na",
    "no",
    "of",
    "on",
    "or",
    "os",
    "para",
    "por",
    "the",
    "to",
    "um",
    "uma",
    "vegan",
    "with",
}


@dataclass(frozen=True)
class RankedSuggestion:
    """A scored replacement candidate with a human-readable reason."""

    product: Any
    score: float
    reason: str
    factors: tuple[str, ...]


def product_id(product: Any) -> str:
    return str(getattr(product, "product_id", getattr(product, "id", "")))


def product_name(product: Any) -> str:
    return str(getattr(product, "name", getattr(product, "name", "")) or "")


def product_description(product: Any) -> str:
    return str(getattr(product, "product_description", getattr(product, "description", "")) or "")


def product_category(product: Any) -> str:
    category = getattr(product, "category", None)
    if category is not None:
        category_name = getattr(category, "category_name", None)
        if category_name:
            return str(category_name)

    return str(
        getattr(product, "category", None)
        or getattr(product, "category_id", "")
        or ""
    )


def product_stock(product: Any) -> int:
    try:
        return int(getattr(product, "stock", 0) or 0)
    except (TypeError, ValueError):
        return 0


def product_price(product: Any) -> float | None:
    price = getattr(product, "price", getattr(product, "price", None))
    if price is None:
        return None

    try:
        if isinstance(price, Decimal):
            return float(price)
        return float(Decimal(str(price)))
    except (InvalidOperation, TypeError, ValueError):
        return None


def is_active_product(product: Any) -> bool:
    """Return True when a product can be shown as an active menu item."""
    status_value = getattr(product, "status", None)
    deleted_at = getattr(product, "deleted_at", None)
    return status_value != 0 and deleted_at is None


def is_product_available(
    product: Any,
    quantity: int = 1,
    stock_threshold: int = DEFAULT_STOCK_THRESHOLD,
) -> bool:
    """Return True when the product has enough stock above the threshold."""
    if quantity < 1:
        raise ValueError("A quantity deve ser pelo menos 1.")
    if stock_threshold < 0:
        raise ValueError("O limite de stock não pode ser negativo.")

    return (
        is_active_product(product)
        and product_stock(product) >= quantity
        and product_stock(product) > stock_threshold
    )


def availability_reason(
    product: Any,
    quantity: int = 1,
    stock_threshold: int = DEFAULT_STOCK_THRESHOLD,
) -> str:
    """Explain why a product is or is not available for preparation."""
    stock = product_stock(product)
    if not is_active_product(product):
        return "O item não está ativo no menu."
    if stock <= 0:
        return "O item está esgotado."
    if stock < quantity:
        return f"O item tem apenas {stock} em stock para um pedido de {quantity}."
    if stock <= stock_threshold:
        return f"O stock do item ({stock}) está no limite ou abaixo do limite ({stock_threshold})."
    return "O item está disponível."


def extract_product_tags(product: Any) -> set[str]:
    """Derive searchable tags from the fields currently stored for products."""
    text = " ".join(
        part
        for part in (
            product_name(product),
            product_description(product),
            product_category(product),
        )
        if part
    )
    normalized = _normalize_text(text)
    tokens = set()
    for token in re.findall(r"[a-z0-9]+", normalized):
        if len(token) > 2 and token not in _STOP_WORDS:
            tokens.add(token)
    return tokens


def rank_substitutions(
    original: Any,
    candidates: Iterable[Any],
    quantity: int = 1,
    stock_threshold: int = DEFAULT_STOCK_THRESHOLD,
    limit: int = 5,
) -> list[RankedSuggestion]:
    """Rank stock-available products that can substitute the original item."""
    return _rank_candidates(
        original,
        candidates,
        quantity=quantity,
        stock_threshold=stock_threshold,
        limit=limit,
        mode="substitution",
    )


def suggest_similar_dishes(
    original: Any,
    candidates: Iterable[Any],
    quantity: int = 1,
    stock_threshold: int = DEFAULT_STOCK_THRESHOLD,
    limit: int = 5,
) -> list[RankedSuggestion]:
    """Rank available dishes similar to the unavailable original dish."""
    return _rank_candidates(
        original,
        candidates,
        quantity=quantity,
        stock_threshold=stock_threshold,
        limit=limit,
        mode="dish",
    )


def _rank_candidates(
    original: Any,
    candidates: Iterable[Any],
    quantity: int,
    stock_threshold: int,
    limit: int,
    mode: str,
) -> list[RankedSuggestion]:
    if limit < 1:
        raise ValueError("O limite deve ser pelo menos 1.")

    original_id = product_id(original)
    original_category = _category_key(original)
    original_tags = extract_product_tags(original)
    original_price = product_price(original)
    original_nutrition = _nutrition_vector(original)

    ranked: list[RankedSuggestion] = []

    for candidate in candidates:
        if product_id(candidate) == original_id:
            continue
        if not is_product_available(candidate, quantity, stock_threshold):
            continue

        candidate_category = _category_key(candidate)
        candidate_tags = extract_product_tags(candidate)
        shared_tags = original_tags.intersection(candidate_tags)
        same_category = bool(original_category and original_category == candidate_category)

        if not _is_compatible(same_category, shared_tags, mode):
            continue

        score, factors = _score_candidate(
            original=original,
            candidate=candidate,
            same_category=same_category,
            shared_tags=shared_tags,
            original_tags=original_tags,
            candidate_tags=candidate_tags,
            original_price=original_price,
            original_nutrition=original_nutrition,
            stock_threshold=stock_threshold,
            quantity=quantity,
        )
        ranked.append(
            RankedSuggestion(
                product=candidate,
                score=round(score, 2),
                reason=_build_reason(mode, factors),
                factors=tuple(factors),
            )
        )

    ranked.sort(key=lambda item: (-item.score, product_name(item.product).lower()))
    return ranked[:limit]


def _score_candidate(
    original: Any,
    candidate: Any,
    same_category: bool,
    shared_tags: set[str],
    original_tags: set[str],
    candidate_tags: set[str],
    original_price: float | None,
    original_nutrition: dict[str, float],
    stock_threshold: int,
    quantity: int,
) -> tuple[float, list[str]]:
    score = 0.0
    factors: list[str] = []

    if same_category:
        score += 35.0
        factors.append("it is in the same category")

    tag_similarity = _jaccard(original_tags, candidate_tags)
    if tag_similarity > 0:
        score += 25.0 * tag_similarity
        factors.append(f"it shares {_format_shared_tags(shared_tags)} flavor/profile tags")

    price_similarity = _price_similarity(original_price, product_price(candidate))
    if price_similarity is not None:
        score += 20.0 * price_similarity
        if price_similarity >= 0.75:
            factors.append("its price is close to the original")

    nutrition_similarity = _nutrition_similarity(original_nutrition, _nutrition_vector(candidate))
    if nutrition_similarity is not None:
        score += 15.0 * nutrition_similarity
        if nutrition_similarity >= 0.75:
            factors.append("its nutrition profile is similar")

    stock_score = _stock_score(candidate, stock_threshold, quantity)
    score += 10.0 * stock_score
    if stock_score >= 0.6:
        factors.append("tem stock suficiente")

    compatibility_score = _compatibility_score(same_category, tag_similarity)
    score += 10.0 * compatibility_score
    if compatibility_score >= 0.7 and "it fits the original dish style" not in factors:
        factors.append("it fits the original dish style")

    if not factors:
        factors.append(f"it is currently available as an alternative to {product_name(original)}")

    return score, factors


def _build_reason(mode: str, factors: list[str]) -> str:
    if not factors:
        return "Suggested because it is currently available."

    selected = factors[:3]
    if len(selected) == 1:
        factor_text = selected[0]
    else:
        factor_text = ", ".join(selected[:-1]) + f", and {selected[-1]}"

    if mode == "dish":
        return f"Suggested because {factor_text} and the dish is currently available."
    return f"Suggested because {factor_text} and is currently available."


def _is_compatible(same_category: bool, shared_tags: set[str], mode: str) -> bool:
    if same_category:
        return True
    if mode == "substitution":
        return len(shared_tags) >= 2
    return len(shared_tags) >= 1


def _stock_score(product: Any, stock_threshold: int, quantity: int) -> float:
    usable_stock = max(0, product_stock(product) - stock_threshold)
    return min(1.0, usable_stock / max(quantity * 5, 1))


def _compatibility_score(same_category: bool, tag_similarity: float) -> float:
    base = 0.7 if same_category else 0.0
    return min(1.0, base + tag_similarity)


def _price_similarity(original_price: float | None, candidate_price: float | None) -> float | None:
    if original_price is None or candidate_price is None:
        return None
    if original_price <= 0 or candidate_price <= 0:
        return None

    difference = abs(original_price - candidate_price)
    scale = max(original_price, candidate_price)
    return max(0.0, 1.0 - (difference / scale))


def _nutrition_vector(product: Any) -> dict[str, float]:
    values: dict[str, float] = {}
    nutrition = getattr(product, "nutrition", None)

    for field in NUTRITION_FIELDS:
        raw_value = None
        if isinstance(nutrition, dict):
            raw_value = nutrition.get(field)
        if raw_value is None:
            raw_value = getattr(product, field, None)
        number = _to_float(raw_value)
        if number is not None:
            values[field] = number

    return values


def _nutrition_similarity(
    original_nutrition: dict[str, float],
    candidate_nutrition: dict[str, float],
) -> float | None:
    shared_fields = set(original_nutrition).intersection(candidate_nutrition)
    if not shared_fields:
        return None

    similarities = []
    for field in shared_fields:
        original_value = original_nutrition[field]
        candidate_value = candidate_nutrition[field]
        scale = max(abs(original_value), abs(candidate_value), 1.0)
        similarities.append(max(0.0, 1.0 - abs(original_value - candidate_value) / scale))

    return sum(similarities) / len(similarities)


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left.intersection(right)) / len(left.union(right))


def _category_key(product: Any) -> str:
    return _normalize_text(product_category(product)).strip()


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()


def _format_shared_tags(shared_tags: set[str]) -> str:
    if not shared_tags:
        return "similar"
    return ", ".join(sorted(shared_tags)[:3])
