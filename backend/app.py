import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import cast

from fastapi import Depends, FastAPI
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
from migrations import run_migrations
from database import engine as database_engine
from modules.restaurant.routers.management import router as staff_router
from modules.auth.routers.auth import router as auth_router
from modules.restaurant.routers.cart import router as cart_router
from modules.restaurant.routers.checkout import router as checkout_router
from modules.restaurant.routers.products import router as products_router
from modules.restaurant.routers.profile import router as profile_router
from modules.restaurant.routers.reviews import router as reviews_router
from modules.restaurant.routers.site_settings import owner_router as site_settings_owner_router
from modules.restaurant.routers.site_settings import public_router as site_settings_public_router
from modules.restaurant.routers.data_privacy import admin_router as data_privacy_admin_router
from modules.restaurant.routers.data_privacy import data_access_router as data_privacy_data_access_router
from modules.auth.routers.data_access import router as data_access_router
from modules.auth.routers.organizations import experience_router as organization_experience_router
from modules.auth.routers.organizations import router as organizations_router
from modules.auth.dependencies import (
    require_organization_context,
    require_organization_feature,
    require_organization_header_context,
)
from seeds import seed_test_users
from scripts.seed_catalog import seed_catalog_on_development_startup
from core.email_provider import validate_email_config
from core.redis import create_redis_client
from core.api_schemas import ApiErrorResponse, HealthResponse

logger = logging.getLogger(__name__)


def require_explicit_operation_id(route: APIRoute) -> str:
    """Reject routes that do not declare their stable SDK operation ID."""
    if not route.operation_id:
        raise RuntimeError(
            f"Route {','.join(sorted(route.methods or []))} {route.path} must declare operation_id"
        )
    return route.operation_id

PUBLIC_ASSETS_DIR = Path(__file__).resolve().parents[1] / "public" / "assets"
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"


def create_app(
    *,
    run_startup_tasks: bool = True,
    public_assets_dir: Path | None = None,
    uploads_dir: Path | None = None,
) -> FastAPI:
    """Build an application instance without forcing database startup work at import time."""

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        redis_client = create_redis_client(settings.environment, settings.redis_url)
        application.state.redis = redis_client
        try:
            await redis_client.ping()
        except Exception as exc:
            await redis_client.aclose()
            raise RuntimeError(
                f"Failed to connect to Redis at {settings.redis_url}: {exc}"
            ) from exc

        try:
            if run_startup_tasks:
                run_migrations()
                if settings.environment == "development":
                    database_engine.dispose()
                    seed_catalog_on_development_startup(uploads_root=resolved_uploads)
                    database_engine.dispose()
                    seed_test_users()

                missing_email_config = validate_email_config()
                if missing_email_config:
                    logger.warning(
                        "Email provider configuration is missing or empty: %s",
                        ", ".join(missing_email_config),
                    )
            yield
        finally:
            await redis_client.aclose()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Multi-tenant Core Platform API. Bonefree is the initial restaurant tenant.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url="/redoc" if settings.docs_enabled else None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        generate_unique_id_function=require_explicit_operation_id,
        lifespan=lifespan,
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
    application.add_exception_handler(AppHTTPException, cast(ExceptionHandler, app_http_exception_handler))
    application.add_exception_handler(StarletteHTTPException, cast(ExceptionHandler, http_exception_handler))
    application.add_exception_handler(RequestValidationError, cast(ExceptionHandler, request_validation_exception_handler))
    application.add_exception_handler(Exception, cast(ExceptionHandler, unexpected_exception_handler))

    resolved_assets = public_assets_dir or PUBLIC_ASSETS_DIR
    resolved_uploads = uploads_dir or UPLOADS_DIR
    resolved_exports = settings.data_exports_dir.resolve()
    for public_directory in (resolved_assets.resolve(), resolved_uploads.resolve()):
        if resolved_exports == public_directory or resolved_exports.is_relative_to(public_directory):
            raise RuntimeError("DATA_EXPORTS_DIR must not be inside a public static directory")
    resolved_assets.mkdir(parents=True, exist_ok=True)
    resolved_uploads.mkdir(parents=True, exist_ok=True)
    application.mount("/assets", StaticFiles(directory=resolved_assets), name="assets")
    application.mount("/uploads", StaticFiles(directory=resolved_uploads), name="uploads")

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition", "Retry-After"],
    )

    @application.get(
        "/health",
        tags=["Health"],
        response_model=HealthResponse,
        operation_id="health_health_check",
    )
    def health_check() -> HealthResponse:
        return HealthResponse(status="healthy")

    tenant_dependencies = [Depends(require_organization_context)]
    public_tenant_dependencies = [Depends(require_organization_header_context)]
    catalog_dependencies = [
        *public_tenant_dependencies,
        Depends(require_organization_feature("catalog")),
    ]
    customer_account_dependencies = [
        *tenant_dependencies,
        Depends(require_organization_feature("customer_accounts")),
    ]
    public_customer_account_dependencies = [
        *public_tenant_dependencies,
        Depends(require_organization_feature("customer_accounts")),
    ]
    ordering_dependencies = [
        *tenant_dependencies,
        Depends(require_organization_feature("ordering")),
    ]
    review_dependencies = [
        *tenant_dependencies,
        Depends(require_organization_feature("reviews")),
    ]
    application.include_router(organizations_router)
    application.include_router(data_access_router)
    application.include_router(data_privacy_data_access_router)
    application.include_router(organization_experience_router)
    application.include_router(auth_router, dependencies=public_customer_account_dependencies)
    application.include_router(products_router, prefix="/products", tags=["Products"], dependencies=catalog_dependencies)
    application.include_router(cart_router, dependencies=ordering_dependencies)
    application.include_router(checkout_router, dependencies=ordering_dependencies)
    application.include_router(profile_router, dependencies=customer_account_dependencies)
    application.include_router(reviews_router, dependencies=review_dependencies)
    application.include_router(staff_router)
    application.include_router(site_settings_public_router, dependencies=public_tenant_dependencies)
    application.include_router(site_settings_owner_router)
    application.include_router(data_privacy_admin_router)
    return application


app = create_app()


if __name__ == "__main__":
    import uvicorn

    if settings.environment in ("development", "test"):
        uvicorn.run(
            "app:app",
            host="0.0.0.0",
            port=settings.port,
            reload=settings.environment == "development",
            log_level="debug" if settings.debug else "info",
        )
    else:
        print(
            "Cannot run directly in production environment. "
            "Use a production ASGI server like Gunicorn or Uvicorn with proper configuration."
        )
