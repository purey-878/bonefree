"""Product review schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ReviewStatus = Literal["pendente", "aprovado", "rejeitado"]
ReactionType = Literal["like", "heart", "helpful", "flag"]


class ReviewReplyCreate(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class ReviewReplyResponse(BaseModel):
    reply_id: int
    review_id: int
    admin_id: int
    text: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReviewReactionCreate(BaseModel):
    type: ReactionType


class ReviewReactionResponse(BaseModel):
    reaction_id: int
    review_id: int
    admin_id: int
    type: ReactionType
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProdutoReviewCreate(BaseModel):
    order_product_id: int = Field(..., ge=1)
    rating: int = Field(..., ge=1, le=5)
    title: str | None = Field(default=None, max_length=120)
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("title", "comment")
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProdutoReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    title: str | None = Field(default=None, max_length=120)
    comment: str | None = Field(default=None, max_length=1000)

    @field_validator("title", "comment")
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProdutoReviewResponse(BaseModel):
    review_id: int
    product_id: int
    id_produto_display: str
    customer_id: int
    order_product_id: int | None
    cliente_nome: str | None = None
    rating: int
    title: str | None
    comment: str | None
    status: ReviewStatus
    created_at: datetime
    updated_at: datetime
    is_owner: bool = False
    reply: ReviewReplyResponse | None = None
    replies: list[ReviewReplyResponse] = Field(default_factory=list)
    reactions: list[ReviewReactionResponse] = Field(default_factory=list)


class ProdutoReviewStatsResponse(BaseModel):
    product_id: int
    id_produto_display: str
    rating_medio: float | None = None
    total_reviews: int = 0


class ProdutoReviewEligibilityItem(BaseModel):
    order_product_id: int
    order_id: int
    product_id: int
    id_produto_display: str
    nome_produto: str
    ordered_at: datetime
    existing_review: ProdutoReviewResponse | None = None


class ProdutoReviewEligibilityResponse(BaseModel):
    eligible: bool
    authenticated: bool
    items: list[ProdutoReviewEligibilityItem] = Field(default_factory=list)
    existing_review: ProdutoReviewResponse | None = None
    message: str
