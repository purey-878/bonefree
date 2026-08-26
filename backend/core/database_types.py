from __future__ import annotations

from enum import Enum, StrEnum
from typing import TypeVar

from sqlalchemy.engine.interfaces import Dialect
from sqlalchemy.types import String, TypeDecorator


StrEnumT = TypeVar("StrEnumT", bound=StrEnum)


class StrEnumType(TypeDecorator[StrEnumT]):
    """Persist a ``StrEnum`` value as a plain string column."""

    impl = String
    cache_ok = True

    def __init__(self, enum_class: type[StrEnumT], length: int = 50) -> None:
        if not isinstance(enum_class, type) or not issubclass(enum_class, StrEnum):
            raise TypeError("enum_class must be a StrEnum subclass")
        if isinstance(length, bool) or not isinstance(length, int) or length <= 0:
            raise ValueError("length must be a positive integer")

        longest_value = max((len(member.value) for member in enum_class), default=0)
        if longest_value > length:
            raise ValueError(
                f"{enum_class.__name__} contains a value longer than {length} characters"
            )

        self.enum_class = enum_class
        self.length = length
        super().__init__(length=length)

    @property
    def python_type(self) -> type[StrEnumT]:
        return self.enum_class

    def process_bind_param(
        self,
        value: StrEnumT | str | None,
        dialect: Dialect,
    ) -> str | None:
        del dialect
        if value is None:
            return None
        if isinstance(value, self.enum_class):
            return value.value
        if isinstance(value, Enum) or not isinstance(value, str):
            raise ValueError(self._invalid_value_message(value))

        try:
            return self.enum_class(value).value
        except (TypeError, ValueError) as exc:
            raise ValueError(self._invalid_value_message(value)) from exc

    def process_result_value(
        self,
        value: str | StrEnumT | None,
        dialect: Dialect,
    ) -> StrEnumT | None:
        del dialect
        if value is None:
            return None
        if isinstance(value, self.enum_class):
            return value

        try:
            return self.enum_class(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Database value {value!r} is not a valid {self.enum_class.__name__}"
            ) from exc

    def _invalid_value_message(self, value: object) -> str:
        return f"{value!r} is not a valid {self.enum_class.__name__}"
