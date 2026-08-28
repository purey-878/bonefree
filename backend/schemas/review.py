"""Product review schemas."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from schemas.enums import ReviewReactionType, ReviewStatus
from schemas.pagination import PaginatedResponse


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
    type: ReviewReactionType


class ReviewReactionResponse(BaseModel):
    reaction_id: int
    review_id: int
    admin_id: int
    type: ReviewReactionType
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductReviewCreate(BaseModel):
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


class ProductReviewUpdate(BaseModel):
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


class ProductReviewResponse(BaseModel):
    review_id: int
    product_id: int
    product_display_id: str
    product_name: str | None = None
    customer_id: int
    order_product_id: int | None
    customer_name: str | None = None
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


class ProductReviewPageResponse(PaginatedResponse[ProductReviewResponse]):
    pass


class AdminReviewSummary(BaseModel):
    average_rating: float | None = None
    with_reply: int = Field(ge=0)
    awaiting_reply: int = Field(ge=0)


class AdminReviewPageResponse(ProductReviewPageResponse):
    summary: AdminReviewSummary


class ProductReviewStatsResponse(BaseModel):
    product_id: int
    product_display_id: str
    average_rating: float | None = None
    total_reviews: int = 0


class ProductReviewEligibilityItem(BaseModel):
    order_product_id: int
    order_id: int
    product_id: int
    product_display_id: str
    product_name: str
    ordered_at: datetime
    existing_review: ProductReviewResponse | None = None


class ProductReviewEligibilityResponse(BaseModel):
    eligible: bool
    authenticated: bool
    items: list[ProductReviewEligibilityItem] = Field(default_factory=list)
    existing_review: ProductReviewResponse | None = None
    message: str
