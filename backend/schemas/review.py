"""Product review schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ReviewStatus = Literal["pendente", "aprovado", "rejeitado"]
ReactionType = Literal["like", "heart", "helpful", "flag"]


class ReviewReplyCreate(BaseModel):
    texto: str = Field(..., min_length=1, max_length=2000)


class ReviewReplyResponse(BaseModel):
    id_reply: int
    id_review: int
    id_admin: int
    texto: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReviewReactionCreate(BaseModel):
    tipo: ReactionType


class ReviewReactionResponse(BaseModel):
    id_reaction: int
    id_review: int
    id_admin: int
    tipo: ReactionType
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProdutoReviewCreate(BaseModel):
    id_encomenda_produto: int = Field(..., ge=1)
    rating: int = Field(..., ge=1, le=5)
    titulo: str | None = Field(default=None, max_length=120)
    comentario: str | None = Field(default=None, max_length=1000)

    @field_validator("titulo", "comentario")
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProdutoReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    titulo: str | None = Field(default=None, max_length=120)
    comentario: str | None = Field(default=None, max_length=1000)

    @field_validator("titulo", "comentario")
    @classmethod
    def empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class ProdutoReviewResponse(BaseModel):
    id_review: int
    id_produto: int
    id_produto_display: str
    id_cliente: int
    id_encomenda_produto: int | None
    cliente_nome: str | None = None
    rating: int
    titulo: str | None
    comentario: str | None
    status: ReviewStatus
    data_criacao: datetime
    data_atualizacao: datetime
    is_owner: bool = False
    reply: ReviewReplyResponse | None = None
    replies: list[ReviewReplyResponse] = Field(default_factory=list)
    reactions: list[ReviewReactionResponse] = Field(default_factory=list)


class ProdutoReviewStatsResponse(BaseModel):
    id_produto: int
    id_produto_display: str
    rating_medio: float | None = None
    total_reviews: int = 0


class ProdutoReviewEligibilityItem(BaseModel):
    id_encomenda_produto: int
    id_encomenda: int
    id_produto: int
    id_produto_display: str
    nome_produto: str
    data_encomenda: datetime
    existing_review: ProdutoReviewResponse | None = None


class ProdutoReviewEligibilityResponse(BaseModel):
    eligible: bool
    authenticated: bool
    items: list[ProdutoReviewEligibilityItem] = Field(default_factory=list)
    existing_review: ProdutoReviewResponse | None = None
    message: str
