"""Public media response schemas."""

from pydantic import BaseModel, ConfigDict, Field

from modules.restaurant.models import MediaVariantKind


class MediaVariantResponse(BaseModel):
    kind: MediaVariantKind
    url: str
    content_type: str
    width: int
    height: int
    size_bytes: int | None = None

    model_config = ConfigDict(from_attributes=True)


class ProductMediaResponse(BaseModel):
    media_id: int
    sort_order: int
    alt_text: str | None = None
    is_primary: bool
    original_url: str
    original_filename: str | None = None
    content_type: str
    width: int | None = None
    height: int | None = None
    size_bytes: int | None = None
    variants: list[MediaVariantResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)
