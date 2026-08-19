from __future__ import annotations

from enum import StrEnum


class UserRole(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    WAITER = "waiter"
    CHEF = "chef"
    CLIENT = "client"

    # Legacy values kept readable while old rows are migrated/normalized.
    LEGACY_SUPER_ADMIN = "super_admin"
    LEGACY_STAFF_ADMIN = "staff_admin"
    LEGACY_ADMIN = "admin"
    LEGACY_CUSTOMER = "customer"


class UserStatus(StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    PENDING = "pending"


class CouponType(StrEnum):
    FIXED_VALUE = "VALOR_FIXO"
    PERCENTAGE = "PERCENTAGEM"


class IngredientType(StrEnum):
    NORMAL = "INGREDIENTES_NORMAIS"
    SAUCE = "MOLHO"
    EXTRA = "EXTRA"
    DRINK = "BEBIDA"
    BASE = "BASE"
    SIDE = "ACOMPANHAMENTO"


class ProductCustomizationOptionType(StrEnum):
    ADD = "ADICIONAR"
    REMOVE = "REMOVER"
    EXTRA = "EXTRA"
    SUBSTITUTE_SAUCE = "SUBSTITUIR_MOLHO"


class CartCustomizationAction(StrEnum):
    REMOVE_INGREDIENT = "REMOVER_INGREDIENTE"
    ADD_EXTRA = "ADICIONAR_EXTRA"
    SUBSTITUTE_SAUCE = "SUBSTITUIR_MOLHO"
    SUBSTITUTE_SIDE = "SUBSTITUIR_ACOMPANHAMENTO"


class OrderState(StrEnum):
    PENDING = "pendente"
    CONFIRMED = "confirmada"
    IN_PREPARATION = "em_preparacao"
    READY = "pronta"
    DELIVERED = "entregue"
    CANCELLED = "cancelada"
    REFUNDED = "reembolsada"


class PaymentMethod(StrEnum):
    CARD = "cartao"
    MBWAY = "mbway"
    COUNTER = "balcao"


class PaymentStatus(StrEnum):
    UNPAID = "nao_pago"
    PAID = "pago"
    REFUNDED = "reembolsado"


class ReviewStatus(StrEnum):
    PENDING = "pendente"
    APPROVED = "aprovado"
    REJECTED = "rejeitado"


class ReviewReactionType(StrEnum):
    LIKE = "like"
    HEART = "heart"


class PaymentState(StrEnum):
    PENDING = "pendente"
    APPROVED = "aprovado"
    REJECTED = "rejeitado"
    REFUNDED = "reembolsado"


class RefundStatus(StrEnum):
    APPROVED = "aprovado"


ADMIN_ROLES = {
    UserRole.OWNER,
    UserRole.MANAGER,
    UserRole.WAITER,
    UserRole.CHEF,
}


LEGACY_ROLE_MAP: dict[str, UserRole] = {
    "super_admin": UserRole.OWNER,
    "staff_admin": UserRole.MANAGER,
    "admin": UserRole.MANAGER,
    "chef": UserRole.CHEF,
    "client": UserRole.CLIENT,
    "customer": UserRole.CLIENT,
}


def enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


def normalize_user_role(role: str | UserRole | None) -> UserRole:
    if isinstance(role, UserRole):
        return role
    if role is None:
        return UserRole.CLIENT
    normalized = role.strip()
    try:
        return UserRole(normalized)
    except ValueError:
        return LEGACY_ROLE_MAP.get(normalized, UserRole.CLIENT)


def normalize_admin_role(role: str | UserRole | None) -> UserRole:
    normalized = normalize_user_role(role)
    if normalized is UserRole.CLIENT:
        return UserRole.MANAGER
    return normalized


def is_admin_role(role: str | UserRole | None) -> bool:
    return normalize_user_role(role) in ADMIN_ROLES