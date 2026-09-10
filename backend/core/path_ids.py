"""Resource identifiers accepted in URL paths, validated before database access."""

import re
from typing import Annotated

from fastapi import Path
from pydantic import AfterValidator, BeforeValidator


# Prevent integer binding overflow, including on SQLite used by local deployments.
MAX_RESOURCE_ID = (1 << 63) - 1


def _numeric_path_id(value: object) -> int:
    if not isinstance(value, str) or re.fullmatch(r"[0-9]+", value) is None:
        raise ValueError("Invalid resource ID.")
    digits = value.lstrip("0")
    if not digits or len(digits) > 19:
        raise ValueError("Invalid resource ID.")
    parsed = int(digits)
    if parsed > MAX_RESOURCE_ID:
        raise ValueError("Invalid resource ID.")
    return parsed


def _prefixed_path_id(value: str) -> str:
    # Path's pattern has already checked the prefix and the complete identifier.
    digits = re.sub(r"^[A-Za-z]+-?", "", value)
    # Canonicalize before legacy ID parsers, including very long leading zeros.
    return str(_numeric_path_id(digits))


ResourcePathId = Annotated[
    int,
    Path(ge=1, le=MAX_RESOURCE_ID, description="Positive integer resource ID. Invalid IDs return 404."),
    BeforeValidator(_numeric_path_id),
]
ProductPathId = Annotated[
    str,
    Path(pattern=r"^(?:[Pp][Rr][Dd]-?)?[0-9]+$", description="Numeric product ID or PRD display code. Invalid IDs return 404."),
    AfterValidator(_prefixed_path_id),
]
CategoryPathId = Annotated[
    str,
    Path(pattern=r"^(?:[Cc][Aa][Tt]-?)?[0-9]+$", description="Numeric category ID or CAT display code. Invalid IDs return 404."),
    AfterValidator(_prefixed_path_id),
]
