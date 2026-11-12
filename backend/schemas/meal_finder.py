"""Fixed Meal Finder contract. The administrator controls only availability."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from schemas.catalog_translation import CatalogLocale
from schemas.product import ProductResponse


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Text(StrictModel):
    pt: str
    en: str
    de: str


class Option(StrictModel):
    id: str
    label: Text


class Question(StrictModel):
    id: Literal['course', 'style', 'ingredient']
    label: Text
    options: list[Option]


class FinderSettings(StrictModel):
    enabled: StrictBool


class Configuration(StrictModel):
    version: int
    enabled: bool
    questions: list[Question]


class Answers(StrictModel):
    course: Literal['starter', 'tacos', 'main']
    style: Literal['crispy', 'creamy', 'smoky', 'any']
    ingredient: Literal['plant_protein', 'legumes', 'vegetables', 'any']


class RecommendationRequest(StrictModel):
    version: int = Field(ge=1)
    answers: Answers
    locale: CatalogLocale = 'pt-PT'
    restrictions: list[Literal['gluten_free']] = Field(default_factory=list, max_length=1)


class Match(StrictModel):
    product: ProductResponse
    reasons: list[Literal['course', 'style', 'ingredient']]


class RecommendationResult(StrictModel):
    best: Match | None = None
    alternatives: list[Match] = Field(default_factory=list)
    closest: bool = False
