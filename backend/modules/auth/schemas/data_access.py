from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator


class DataAccessOtpRequest(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)

    @field_validator("hostname")
    @classmethod
    def normalize_hostname_input(cls, value: str) -> str:
        return value.strip().lower()


class DataAccessOtpChallengeResponse(BaseModel):
    challenge_id: str
    expires_at: datetime


class DataAccessOtpVerifyRequest(BaseModel):
    hostname: str = Field(min_length=1, max_length=255)
    challenge_id: str = Field(min_length=36, max_length=36)
    code: str = Field(pattern=r"^\d{6}$")

    @field_validator("hostname")
    @classmethod
    def normalize_hostname_input(cls, value: str) -> str:
        return value.strip().lower()


class DataAccessOwnerIdentity(BaseModel):
    owner_id: int
    name: str | None = None
    email: str


class DataAccessTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    organization_name: str
    data_access_expires_at: datetime
    owner: DataAccessOwnerIdentity


class DataAccessSessionResponse(BaseModel):
    organization_name: str
    data_access_expires_at: datetime
    owner: DataAccessOwnerIdentity
