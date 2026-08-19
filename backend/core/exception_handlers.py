import traceback
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.errors import AppHTTPException, build_error_payload
from core.validation_messages import map_pydantic_error


def _message_to_error_code(message: str, status_code: int) -> str:
    normalized = message.lower().strip()

    if "not found" in normalized:
        return "not_found"

    return {
        status.HTTP_400_BAD_REQUEST: "bad_request",
        status.HTTP_401_UNAUTHORIZED: "authentication_required",
        status.HTTP_403_FORBIDDEN: "permission_denied",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_409_CONFLICT: "conflict",
        status.HTTP_422_UNPROCESSABLE_ENTITY: "validation_error",
        status.HTTP_503_SERVICE_UNAVAILABLE: "service_unavailable",
    }.get(status_code, "http_error")


def _http_exception_payload(
    exc: StarletteHTTPException,
    request: Request,
) -> dict[str, Any]:
    detail = exc.detail
    details: dict[str, Any] | None = {"path": str(request.url.path)}

    if isinstance(detail, dict):
        error = str(detail.get("error") or _message_to_error_code("", exc.status_code))
        message = str(detail.get("message") or detail.get("detail") or "Request failed.")
        params = detail.get("params") if isinstance(detail.get("params"), dict) else None
        raw_details = detail.get("details")
        if isinstance(raw_details, dict):
            details = {**details, **raw_details}
        fields = detail.get("fields")
        if fields is not None:
            details = {**details, "fields": fields}
        return build_error_payload(error, message, params, details)

    message = str(detail) if detail else "Request failed."
    return build_error_payload(
        _message_to_error_code(message, exc.status_code),
        message,
        None,
        details,
    )


async def app_http_exception_handler(
    request: Request,
    exc: AppHTTPException,
) -> JSONResponse:
    details = {"path": str(request.url.path), **(exc.details or {})}
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_payload(exc.error, exc.message, exc.params, details),
        headers=exc.headers,
    )


async def http_exception_handler(
    request: Request,
    exc: StarletteHTTPException,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=_http_exception_payload(exc, request),
        headers=getattr(exc, "headers", None),
    )


async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    fields = [map_pydantic_error(error) for error in exc.errors()]
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=build_error_payload(
            "validation_error",
            "Validation failed.",
            None,
            {"path": str(request.url.path), "fields": fields},
        ),
    )


async def unexpected_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    details: dict[str, Any] | None = None
    if settings.debug:
        details = {
            "path": str(request.url.path),
            "exception_type": type(exc).__name__,
            "exception_message": str(exc),
            "traceback": traceback.format_exception(
                type(exc),
                exc,
                exc.__traceback__,
            ),
        }

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=build_error_payload(
            "internal_server_error",
            "Internal server error.",
            None,
            details,
        ),
    )