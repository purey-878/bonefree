"""Shared Portuguese customer-data validation helpers."""

from __future__ import annotations

import re
from typing import Optional

DISPOSABLE_EMAIL_DOMAINS = {
    "10minutemail.com",
    "guerrillamail.com",
    "mailinator.com",
    "tempmail.com",
    "temp-mail.org",
    "yopmail.com",
}

EMAIL_RE = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$")
NAME_RE = re.compile(r"^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '\u2019-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$")
POSTAL_CODE_RE = re.compile(r"^\d{4}-\d{3}$")
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,128}$")


def clean_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def validate_email(value: str) -> str:
    email = value.strip().lower()
    if not EMAIL_RE.fullmatch(email):
        raise ValueError("Invalid email address.")
    domain = email.rsplit("@", 1)[-1]
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        raise ValueError("Invalid email address.")
    return email


def validate_password(value: str) -> str:
    if not PASSWORD_RE.fullmatch(value):
        raise ValueError("Password must contain uppercase and lowercase letters, a number, and a special character.")
    return value


def validate_name(value: Optional[str]) -> Optional[str]:
    name = clean_text(value)
    if name is None:
        return None
    if len(name) < 2:
        raise ValueError("Name must contain at least 2 characters.")
    if len(name) > 100:
        raise ValueError("Name must contain at most 100 characters.")
    if name.isdigit():
        raise ValueError("Name cannot contain only numbers.")
    if not NAME_RE.fullmatch(name) or not any(char.isalpha() for char in name):
        raise ValueError("Enter a valid full name.")
    return name


def normalize_phone(value: Optional[str]) -> Optional[str]:
    phone = value.strip().replace(" ", "") if value else ""
    if not phone:
        return None
    if phone.startswith("+351"):
        national = phone[4:]
        normalized = phone
    else:
        national = phone
        normalized = phone
    if not national.isdigit():
        raise ValueError("Phone number must contain only digits.")
    if len(national) != 9 or not national.startswith("9"):
        raise ValueError("Invalid Portuguese phone number.")
    return normalized


def validate_portuguese_tax_id(value: Optional[str]) -> Optional[str]:
    tax_id = value.strip() if value else ""
    if not tax_id:
        return None
    if not tax_id.isdigit() or len(tax_id) != 9:
        raise ValueError("Portuguese tax ID must contain exactly 9 digits.")
    checksum = sum(int(tax_id[index]) * (9 - index) for index in range(8))
    check_digit = 11 - (checksum % 11)
    if check_digit >= 10:
        check_digit = 0
    if check_digit != int(tax_id[-1]):
        raise ValueError("Invalid Portuguese tax ID.")
    return tax_id


def validate_postal_code(value: Optional[str]) -> Optional[str]:
    postal_code = value.strip() if value else ""
    if not postal_code:
        return None
    if not POSTAL_CODE_RE.fullmatch(postal_code):
        raise ValueError("Postal code must use the Portuguese XXXX-XXX format.")
    return postal_code
