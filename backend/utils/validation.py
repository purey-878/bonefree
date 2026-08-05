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
        raise ValueError("Endereço de email inválido.")
    domain = email.rsplit("@", 1)[-1]
    if domain in DISPOSABLE_EMAIL_DOMAINS:
        raise ValueError("Endereço de email inválido.")
    return email


def validate_password(value: str) -> str:
    if not PASSWORD_RE.fullmatch(value):
        raise ValueError("A palavra-passe deve conter maiúsculas, minúsculas, um número e um carácter especial.")
    return value


def validate_name(value: Optional[str]) -> Optional[str]:
    name = clean_text(value)
    if name is None:
        return None
    if len(name) < 2:
        raise ValueError("O nome deve ter pelo menos 2 caracteres.")
    if len(name) > 100:
        raise ValueError("O nome deve ter no máximo 100 caracteres.")
    if name.isdigit():
        raise ValueError("O nome não pode conter apenas números.")
    if not NAME_RE.fullmatch(name) or not any(char.isalpha() for char in name):
        raise ValueError("Introduza um nome completo valido.")
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
        raise ValueError("O número de telefone deve conter apenas dígitos.")
    if len(national) != 9 or not national.startswith("9"):
        raise ValueError("Número de telefone português inválido.")
    return normalized


def validate_nif(value: Optional[str]) -> Optional[str]:
    nif = value.strip() if value else ""
    if not nif:
        return None
    if not nif.isdigit() or len(nif) != 9:
        raise ValueError("O NIF deve conter exatamente 9 dígitos.")
    checksum = sum(int(nif[index]) * (9 - index) for index in range(8))
    check_digit = 11 - (checksum % 11)
    if check_digit >= 10:
        check_digit = 0
    if check_digit != int(nif[-1]):
        raise ValueError("NIF português inválido.")
    return nif


def validate_postal_code(value: Optional[str]) -> Optional[str]:
    postal_code = value.strip() if value else ""
    if not postal_code:
        return None
    if not POSTAL_CODE_RE.fullmatch(postal_code):
        raise ValueError("O código postal deve seguir o formato português XXXX-XXX.")
    return postal_code
