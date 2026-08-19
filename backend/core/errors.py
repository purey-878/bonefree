from typing import Any

from core.config import settings


class AppHTTPException(Exception):
    """Application HTTP error rendered by the global exception handlers."""

    def __init__(
        self,
        status_code: int,
        error: str,
        message: str,
        params: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self.error = error
        self.message = message
        self.params = params
        self.details = details
        self.headers = headers
        super().__init__(message)


def build_error_payload(
    error: str,
    message: str,
    params: dict[str, Any] | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": error,
        "message": message,
    }
    if params:
        payload["params"] = params
    if settings.debug and details:
        payload["details"] = details
    return payload