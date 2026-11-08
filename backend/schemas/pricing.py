"""Informational menu options, independent of legacy purchase customization."""
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from schemas.catalog_translation import TranslationLocale, TranslationText


class OptionTranslationText(TranslationText):
    name: str | None = Field(None, max_length=150)


class PortionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int | None = Field(None, ge=1)
    label: str = Field(min_length=1, max_length=150)
    price: Decimal = Field(ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    display_order: int | None = Field(None, ge=0)
    is_available: bool = True
    translations: dict[TranslationLocale, OptionTranslationText | None] = Field(default_factory=dict)

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Option label must not be empty.")
        return value


class ExtraInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int | None = Field(None, ge=1)
    label: str = Field(min_length=1, max_length=150)
    price_delta: Decimal = Field(ge=0, max_digits=10, decimal_places=2, allow_inf_nan=False)
    type: Literal["addon", "replacement"] = "addon"
    display_order: int | None = Field(None, ge=0)
    is_available: bool = True
    translations: dict[TranslationLocale, OptionTranslationText | None] = Field(default_factory=dict)
    clean_label = field_validator("label")(PortionInput.clean_label.__func__)


class PricingInputs(BaseModel):
    portions: list[PortionInput] | None = Field(None, max_length=30)
    extras: list[ExtraInput] | None = Field(None, max_length=30)

    @model_validator(mode="after")
    def unique_options(self):
        ids = []
        for group in (self.portions, self.extras):
            if group is None:
                continue
            labels = [item.label.casefold() for item in group]
            orders = [item.display_order for item in group if item.display_order is not None]
            if len(labels) != len(set(labels)):
                raise ValueError("Option labels must be unique within each group.")
            if len(orders) != len(set(orders)):
                raise ValueError("Option display orders must be unique within each group.")
            ids.extend(item.id for item in group if item.id is not None)
        if len(ids) != len(set(ids)):
            raise ValueError("Option IDs must be unique.")
        return self


class PortionResponse(BaseModel):
    id: int
    label: str
    price: float
    display_order: int
    is_available: bool


class ExtraResponse(BaseModel):
    id: int
    label: str
    price_delta: float
    type: Literal["addon", "replacement"]
    display_order: int
    is_available: bool


class AdminPortionResponse(PortionResponse):
    translations: dict[TranslationLocale, OptionTranslationText] = Field(default_factory=dict)


class AdminExtraResponse(ExtraResponse):
    translations: dict[TranslationLocale, OptionTranslationText] = Field(default_factory=dict)
