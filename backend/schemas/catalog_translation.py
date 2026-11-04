"""Optional catalog text overrides; Portuguese remains in the original fields."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CatalogLocale = Literal["pt-PT", "en-GB", "de-DE"]
TranslationLocale = Literal["en-GB", "de-DE"]


class TranslationText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def normalize_text(cls, value):
        return value.strip() or None if isinstance(value, str) else value


class ProductTranslationText(TranslationText):
    name: str | None = Field(None, max_length=150)
    description: str | None = Field(None, max_length=255)
    menu_tags: str | None = Field(None, max_length=255)


class CategoryTranslationText(TranslationText):
    name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=255)


class IngredientTranslationText(TranslationText):
    name: str | None = Field(None, max_length=120)
