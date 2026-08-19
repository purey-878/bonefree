import re


FIELD_LABELS: dict[str, str] = {
    # Define custom field labels here when API-facing validation messages need a friendlier label.
}


def get_label(field: str) -> str:
    return FIELD_LABELS.get(field, field.replace("_", " ").capitalize())


def _clean_expected(raw: str) -> str:
    """Convert Pydantic's "'a', 'b' or 'c'" into "a, b, c"."""
    values = re.findall(r"'([^']+)'", raw)
    return ", ".join(values) if values else raw


def _expected_values(raw: str) -> list[str]:
    return re.findall(r"'([^']+)'", raw)


_TYPE_ERROR_TYPES = {
    "int_parsing",
    "int_type",
    "float_parsing",
    "float_type",
    "bool_parsing",
    "bool_type",
    "string_type",
    "decimal_parsing",
}


def map_pydantic_error(error: dict) -> dict:
    error_type: str = error.get("type", "")
    loc: tuple = error.get("loc", ())
    ctx: dict = error.get("ctx") or {}

    field = next(
        (str(p) for p in reversed(loc) if isinstance(p, str) and p != "body"),
        str(loc[-1]) if loc else "unknown",
    )
    label = get_label(field)

    if error_type == "missing":
        return {"field": field, "code": "required", "message": f"{label} is required."}

    if error_type == "string_too_short":
        min_length = ctx.get("min_length", 1)
        if min_length == 1:
            return {
                "field": field,
                "code": "blank",
                "message": f"{label} cannot be empty.",
            }
        return {
            "field": field,
            "code": "too_short",
            "message": f"{label} must have at least {min_length} characters.",
            "params": {"min": min_length},
        }

    if error_type == "string_too_long":
        max_length = ctx.get("max_length", "?")
        return {
            "field": field,
            "code": "too_long",
            "message": f"{label} must have at most {max_length} characters.",
            "params": {"max": max_length},
        }

    if error_type in ("enum", "literal_error"):
        raw_expected = ctx.get("expected", "")
        if raw_expected:
            choices = _clean_expected(raw_expected)
            values = _expected_values(raw_expected)
            return {
                "field": field,
                "code": "invalid_choice",
                "message": f"{label} must be one of: {choices}.",
                "params": {"choices": values or choices},
            }
        return {
            "field": field,
            "code": "invalid_choice",
            "message": f"{label} has an invalid value.",
        }

    if error_type in _TYPE_ERROR_TYPES:
        return {
            "field": field,
            "code": "invalid_type",
            "message": f"{label} has an invalid type.",
        }

    if error_type == "value_error":
        raw_message = error.get("msg", "")
        custom_error = ctx.get("error")
        if custom_error is not None:
            raw_message = str(custom_error)
        elif isinstance(raw_message, str) and raw_message.startswith("Value error, "):
            raw_message = raw_message.removeprefix("Value error, ")

        message = raw_message.strip() if isinstance(raw_message, str) else ""
        custom_codes = {
            "Username can contain only letters, numbers, dots, hyphens, and underscores.": "username_invalid_characters",
            "Username cannot start or end with punctuation.": "username_punctuation_boundary",
            "Username cannot contain repeated punctuation.": "username_repeated_punctuation",
            "Name can contain only letters, spaces, hyphens, and apostrophes.": "person_name_invalid_characters",
            "Name cannot contain leading or repeated separators.": "person_name_invalid_separators",
            "Name cannot end with a separator.": "person_name_trailing_separator",
        }
        return {
            "field": field,
            "code": custom_codes.get(message, "invalid"),
            "message": message or f"{label} is invalid.",
        }

    return {"field": field, "code": "invalid", "message": f"{label} is invalid."}