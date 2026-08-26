"""Schemas package for API request/response validation."""

from .cart import (
    CartItemOut,
    CartOut,
    AddItemSchema,
    UpdateItemSchema,
    GuestCartItem,
    MergeCartSchema,
    MergeResult,
)
from .customization import (
    CustomizedCartItemRequest,
    CustomizationExtraSelection,
    CustomizationIngredientResponse,
    CustomizationOptionResponse,
    CustomizationSubstitutionSelection,
    ItemCustomization,
    ProductCustomizationOptions,
    ProductCustomizationResponse,
)
from .product import ProductResponse
from .media import MediaVariantResponse, ProductMediaResponse
from .review import (
    ProductReviewCreate,
    ProductReviewEligibilityItem,
    ProductReviewEligibilityResponse,
    ProductReviewResponse,
    ProductReviewStatsResponse,
    ProductReviewUpdate,
)
from .substitution import AvailabilitySuggestionResponse, ProductSuggestion

__all__ = [
    # Cart schemas
    "CartItemOut",
    "CartOut",
    "AddItemSchema",
    "UpdateItemSchema",
    "GuestCartItem",
    "MergeCartSchema",
    "MergeResult",
    # Customization schemas
    "ItemCustomization",
    "ProductCustomizationOptions",
    "CustomizedCartItemRequest",
    "CustomizationExtraSelection",
    "CustomizationIngredientResponse",
    "CustomizationOptionResponse",
    "CustomizationSubstitutionSelection",
    "ProductCustomizationResponse",
    # Product schemas
    "ProductResponse",
    "MediaVariantResponse",
    "ProductMediaResponse",
    # Review schemas
    "ProductReviewCreate",
    "ProductReviewEligibilityItem",
    "ProductReviewEligibilityResponse",
    "ProductReviewResponse",
    "ProductReviewStatsResponse",
    "ProductReviewUpdate",
    # Availability substitution schemas
    "AvailabilitySuggestionResponse",
    "ProductSuggestion",
]
