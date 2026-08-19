"""Schemas package for API request/response validation."""

from .carrinho import (
    CarrinhoItemOut,
    CarrinhoOut,
    AdicionarItemSchema,
    AtualizarItemSchema,
    GuestCartItem,
    MergeCarrinhoSchema,
    MergeResultado,
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
from .produto import ProdutoResponse
from .review import (
    ProdutoReviewCreate,
    ProdutoReviewEligibilityItem,
    ProdutoReviewEligibilityResponse,
    ProdutoReviewResponse,
    ProdutoReviewStatsResponse,
    ProdutoReviewUpdate,
)
from .substitution import AvailabilitySuggestionResponse, StockSuggestion
from .usuario import (
    ClienteEnderecoFaturaBase,
    ClienteEnderecoFaturaResponse,
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserAuth,
    UserProfileUpdate,
    UserRegister,
    UserResponse,
    VerifyOTPRequest,
    VerifyOTPResponse,
)

__all__ = [
    # Cart schemas
    "CarrinhoItemOut",
    "CarrinhoOut",
    "AdicionarItemSchema",
    "AtualizarItemSchema",
    "GuestCartItem",
    "MergeCarrinhoSchema",
    "MergeResultado",
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
    "ProdutoResponse",
    # Review schemas
    "ProdutoReviewCreate",
    "ProdutoReviewEligibilityItem",
    "ProdutoReviewEligibilityResponse",
    "ProdutoReviewResponse",
    "ProdutoReviewStatsResponse",
    "ProdutoReviewUpdate",
    # Stock-out substitution schemas
    "AvailabilitySuggestionResponse",
    "StockSuggestion",
    # User schemas
    "UserAuth",
    "ClienteEnderecoFaturaBase",
    "ClienteEnderecoFaturaResponse",
    "UserRegister",
    "UserResponse",
    "TokenResponse",
    "UserProfileUpdate",
    "ForgotPasswordRequest",
    "VerifyOTPRequest",
    "VerifyOTPResponse",
    "ResetPasswordRequest",
    "MessageResponse",
]
