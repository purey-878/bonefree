"""User/Usuario schemas for API validation."""

from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Optional
from utils.validation import (
    clean_text,
    normalize_phone,
    validate_email,
    validate_name,
    validate_nif,
    validate_password,
    validate_postal_code,
)


class UserAuth(BaseModel):
    """Request model for user login."""
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value)


class UserRegister(BaseModel):
    """Request model for user registration."""
    email: str = Field(..., min_length=3, max_length=150)
    password: str = Field(..., min_length=8, max_length=128)
    name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(..., min_length=1, max_length=80)
    phone: Optional[str] = None
    tax_id: Optional[str] = None

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password(value)

    @field_validator("name", "last_name")
    @classmethod
    def check_name(cls, value: Optional[str]) -> Optional[str]:
        return validate_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_phone(value)

    @field_validator("tax_id")
    @classmethod
    def check_nif(cls, value: Optional[str]) -> Optional[str]:
        return validate_nif(value)


class ClienteEnderecoFaturaBase(BaseModel):
    address: Optional[str] = Field(None, max_length=255)
    postal_code: Optional[str] = Field(None, max_length=20)
    city: Optional[str] = Field(None, max_length=100)

    @field_validator("address", "city")
    @classmethod
    def normalize_optional_address_text(cls, value: Optional[str]) -> Optional[str]:
        return clean_text(value)

    @field_validator("postal_code")
    @classmethod
    def check_postal_code(cls, value: Optional[str]) -> Optional[str]:
        return validate_postal_code(value)


class ClienteEnderecoFaturaResponse(ClienteEnderecoFaturaBase):
    address_id: int
    customer_id: int

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    """Response model for authenticated user."""
    customer_id: int
    email: str
    name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    billing_address: Optional[ClienteEnderecoFaturaResponse] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """Response model for authentication endpoints (login/register)."""
    access_token: str
    token_type: str
    user: UserResponse


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    tax_id: Optional[str] = None
    billing_address: Optional[ClienteEnderecoFaturaBase] = None

    @field_validator("name", "last_name", "phone", "tax_id")
    @classmethod
    def normalize_optional_text(cls, value: Optional[str]) -> Optional[str]:
        return clean_text(value)

    @field_validator("name", "last_name")
    @classmethod
    def check_name(cls, value: Optional[str]) -> Optional[str]:
        return validate_name(value)

    @field_validator("phone")
    @classmethod
    def check_phone(cls, value: Optional[str]) -> Optional[str]:
        return normalize_phone(value)

    @field_validator("tax_id")
    @classmethod
    def check_nif(cls, value: Optional[str]) -> Optional[str]:
        return validate_nif(value)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        return validate_email(value)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return validate_email(value)


class VerifyOTPRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return ForgotPasswordRequest.validate_email(value)


class VerifyOTPResponse(BaseModel):
    message: str
    reset_token: str


class ResetPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=150)
    reset_token: str = Field(..., min_length=20)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return ForgotPasswordRequest.validate_email(value)

    @field_validator("new_password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password(value)


class MessageResponse(BaseModel):
    message: str
