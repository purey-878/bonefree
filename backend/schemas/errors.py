"""Shared response models used by the OpenAPI contract."""

from typing import Any

from pydantic import BaseModel, Field


class ApiErrorResponse(BaseModel):
    error: str = Field(description="Stable machine-readable error code.")
    message: str = Field(description="Human-readable error message.")
    params: dict[str, Any] | None = None
    details: dict[str, Any] | None = None


class HealthResponse(BaseModel):
    status: str
