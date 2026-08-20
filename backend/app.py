import logging
from pathlib import Path
from typing import cast

from fastapi import FastAPI
from fastapi.routing import APIRoute
from starlette.types import ExceptionHandler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from core.config import settings
from core.errors import AppHTTPException
from core.exception_handlers import (
    app_http_exception_handler,
    http_exception_handler,
    request_validation_exception_handler,
    unexpected_exception_handler,
)
from migrations import run_or_stamp_migrations
from routers.admin import router as admin_router
from routers.auth import router as auth_router
from routers.cart import router as cart_router
from routers.checkout import router as checkout_router
from routers.products import router as products_router
from routers.profile import router as profile_router
from routers.reviews import router as reviews_router
from routers.site_settings import admin_router as site_settings_admin_router
from routers.site_settings import public_router as site_settings_public_router
from seeds import seed_test_users
from core.email_provider import validate_email_config
from schemas.errors import ApiErrorResponse, HealthResponse

logger = logging.getLogger(__name__)


def require_explicit_operation_id(route: APIRoute) -> str:
    """Reject routes that do not declare their stable SDK operation ID."""
    if not route.operation_id:
        raise RuntimeError(
            f"Route {','.join(sorted(route.methods or []))} {route.path} must declare operation_id"
        )
    return route.operation_id

run_or_stamp_migrations()

if settings.environment == "development":
    seed_test_users()

missing_email_config = validate_email_config()
if missing_email_config:
    logger.warning("Email provider configuration is missing or empty: %s", ", ".join(missing_email_config))


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for the Bonefree project",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    generate_unique_id_function=require_explicit_operation_id,
    responses={
        400: {"model": ApiErrorResponse, "description": "Invalid request"},
        401: {"model": ApiErrorResponse, "description": "Authentication required"},
        403: {"model": ApiErrorResponse, "description": "Permission denied"},
        404: {"model": ApiErrorResponse, "description": "Resource not found"},
        409: {"model": ApiErrorResponse, "description": "Request conflict"},
        422: {"model": ApiErrorResponse, "description": "Validation error"},
        500: {"model": ApiErrorResponse, "description": "Internal server error"},
    },
)
app.add_exception_handler(AppHTTPException, cast(ExceptionHandler, app_http_exception_handler))
app.add_exception_handler(StarletteHTTPException, cast(ExceptionHandler, http_exception_handler))
app.add_exception_handler(RequestValidationError, cast(ExceptionHandler, request_validation_exception_handler))
app.add_exception_handler(Exception, cast(ExceptionHandler, unexpected_exception_handler))

PUBLIC_ASSETS_DIR = Path(__file__).resolve().parents[1] / "public" / "assets"
PUBLIC_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=PUBLIC_ASSETS_DIR), name="assets")

UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.get("/health", tags=["Health"], response_model=HealthResponse, operation_id="health_health_check")
def health_check() -> HealthResponse:
    return HealthResponse(status="healthy")


app.include_router(auth_router)
app.include_router(products_router, prefix="/products", tags=["Products"])
app.include_router(cart_router)
app.include_router(checkout_router)
app.include_router(profile_router)
app.include_router(reviews_router)
app.include_router(admin_router)
app.include_router(site_settings_public_router)
app.include_router(site_settings_admin_router)


if __name__ == "__main__":
    import uvicorn

    if settings.environment in ("development", "test"):
        uvicorn.run(
            "app:app",
            host="127.0.0.1",
            port=settings.port,
            reload=settings.environment == "development",
            log_level="debug" if settings.debug else "info",
        )
    else:
        print(
            "Cannot run directly in production environment. "
            "Use a production ASGI server like Gunicorn or Uvicorn with proper configuration."
        )
