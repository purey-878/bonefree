"""Stable response mapping for product-owned media."""

from typing import Any

from modules.restaurant.models import MediaVariantKind
from modules.restaurant.schemas.media import MediaVariantResponse, ProductMediaResponse


_VARIANT_ORDER = {
    MediaVariantKind.THUMB: 0,
    MediaVariantKind.CARD: 1,
    MediaVariantKind.DETAIL: 2,
}


def product_media_response(link: Any) -> ProductMediaResponse:
    media = link.media
    variants = sorted(
        media.variants,
        key=lambda variant: (_VARIANT_ORDER.get(variant.kind, 99), variant.id),
    )
    return ProductMediaResponse(
        media_id=media.id,
        sort_order=link.sort_order,
        alt_text=link.alt_text,
        is_primary=link.is_primary,
        original_url=media.public_url,
        original_filename=media.original_filename,
        content_type=media.content_type,
        width=media.width,
        height=media.height,
        size_bytes=media.size_bytes,
        variants=[
            MediaVariantResponse(
                kind=variant.kind,
                url=variant.public_url,
                content_type=variant.content_type,
                width=variant.width,
                height=variant.height,
                size_bytes=variant.size_bytes,
            )
            for variant in variants
        ],
    )


def product_media_responses(product: Any) -> list[ProductMediaResponse]:
    links = sorted(product.media_items, key=lambda link: (link.sort_order, link.id))
    return [product_media_response(link) for link in links]


def primary_product_media_response(product: Any) -> ProductMediaResponse | None:
    links = sorted(product.media_items, key=lambda link: (link.sort_order, link.id))
    primary = next((link for link in links if link.is_primary), None)
    return product_media_response(primary or links[0]) if links else None
