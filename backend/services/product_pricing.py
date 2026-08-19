from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def product_discount_percent(product: Any) -> Decimal:
    value = getattr(product, "discount_percentual", None)
    if value is None:
        return Decimal("0")
    discount = Decimal(str(value))
    if discount < 0:
        return Decimal("0")
    if discount > 100:
        return Decimal("100")
    return discount


def discounted_product_price(product: Any) -> Decimal:
    original = Decimal(str(getattr(product, "price", 0) or 0))
    discount = product_discount_percent(product)
    if discount <= 0:
        return original
    multiplier = (Decimal("100") - discount) / Decimal("100")
    return (original * multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def product_tags(product: Any) -> list[str]:
    raw_tags = getattr(product, "menu_tags", None) or ""
    tags: list[str] = []
    seen: set[str] = set()
    for tag in raw_tags.split(","):
        normalized = tag.strip()
        key = normalized.casefold()
        if normalized and key not in seen:
            tags.append(normalized)
            seen.add(key)
    return tags
