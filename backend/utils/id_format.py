"""Helpers for numeric product/category IDs and their public display codes."""

from __future__ import annotations

import re
from typing import Any


def format_product_id(value: int | str | None) -> str:
    return _format_prefixed_id(value, "PRD")


def format_category_id(value: int | str | None) -> str:
    return _format_prefixed_id(value, "CAT")


def parse_product_id(value: Any) -> int:
    return _parse_prefixed_id(value, "PRD", "product")


def parse_category_id(value: Any) -> int:
    return _parse_prefixed_id(value, "CAT", "category")


def _format_prefixed_id(value: int | str | None, prefix: str) -> str:
    parsed = _parse_prefixed_id(value, prefix, prefix)
    return f"{prefix}-{parsed:03d}"


def _parse_prefixed_id(value: Any, prefix: str, label: str) -> int:
    if value is None:
        raise ValueError(f"ID de {label} obrigatorio.")

    if isinstance(value, int):
        parsed = value
    else:
        raw = str(value).strip()
        if not raw:
            raise ValueError(f"ID de {label} obrigatorio.")
        upper = raw.upper()
        prefixed = re.fullmatch(rf"{re.escape(prefix)}-?0*(\d+)", upper)
        if prefixed:
            parsed = int(prefixed.group(1))
        elif raw.isdigit():
            parsed = int(raw)
        else:
            trailing = re.search(r"(\d+)$", raw)
            if not trailing:
                raise ValueError(f"ID de {label} invalido.")
            parsed = int(trailing.group(1))

    if parsed < 1:
        raise ValueError(f"ID de {label} invalido.")
    return parsed
