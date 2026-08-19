import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.config import settings
from migrations import run_or_stamp_migrations
from routes.admin import router as admin_router
from routes.cart import alias_router as cart_alias_router
from routes.cart import router as cart_router
from routes.checkout import router as checkout_router
from routes.products import router as products_router
from routes.profile import router as profile_router
from routes.reviews import router as reviews_router
from routes.site_settings import admin_router as site_settings_admin_router
from routes.site_settings import public_router as site_settings_public_router
from routers.auth import router as auth_router
from services.auth_email import validate_email_config

logger = logging.getLogger(__name__)

run_or_stamp_migrations()

missing_email_config = validate_email_config()
if missing_email_config:
    logger.warning("Auth email SMTP configuration is missing or empty: %s", ", ".join(missing_email_config))


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Backend API for the Bonefree project",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)

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


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy"}


app.include_router(auth_router)
app.include_router(products_router, prefix="/products", tags=["Products"])
app.include_router(cart_router)
app.include_router(cart_alias_router)
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