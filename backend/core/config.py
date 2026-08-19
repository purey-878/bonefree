import json
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent
ENV_FILE = PROJECT_ROOT / ".env"
BACKEND_ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    app_name: str = Field(default="Bonefree API", validation_alias="APP_NAME")
    app_version: str = Field(default="0.1.0", validation_alias="APP_VERSION")
    environment: Literal["development", "test", "production"] = Field(
        default="development",
        validation_alias="ENVIRONMENT",
    )
    api_prefix: str = Field(default="/api", validation_alias="API_PREFIX")
    debug: bool = Field(default=False, validation_alias="APP_DEBUG")
    port: int = Field(default=8000, validation_alias="PORT")

    @property
    def docs_enabled(self) -> bool:
        return self.environment == "development"

    database_url: str = Field(
        default=f"sqlite:///{(BASE_DIR / 'bonefree_rest_2.db').as_posix()}",
        validation_alias="DATABASE_URL",
    )
    database_pool_pre_ping: bool = Field(
        default=True,
        validation_alias="DATABASE_POOL_PRE_PING",
    )
    database_pool_recycle_seconds: int = Field(
        default=1800,
        validation_alias="DATABASE_POOL_RECYCLE_SECONDS",
    )
    database_pool_timeout_seconds: int = Field(
        default=30,
        validation_alias="DATABASE_POOL_TIMEOUT_SECONDS",
    )
    auto_apply_migrations: bool = Field(default=True, validation_alias="AUTO_APPLY_MIGRATIONS")
    dev_reset_database_on_migration_error: bool = Field(
        default=True,
        validation_alias="DEV_RESET_DATABASE_ON_MIGRATION_ERROR",
    )
    dev_stamp_existing_database_without_alembic: bool = Field(
        default=True,
        validation_alias="DEV_STAMP_EXISTING_DATABASE_WITHOUT_ALEMBIC",
    )

    cors_origins_raw: str = Field(
        default=(
            "http://127.0.0.1:8000,"
            "http://localhost:5173,"
            "http://127.0.0.1,"
            "http://127.0.0.1:5174,"
            "https://bonefree.pt,"
            "https://www.bonefree.pt"
        ),
        validation_alias="CORS_ORIGINS",
    )

    @property
    def cors_origins(self) -> list[str]:
        raw_origins = self.cors_origins_raw.strip()
        if not raw_origins:
            return []

        if raw_origins.startswith("["):
            parsed_origins = json.loads(raw_origins)
            if not isinstance(parsed_origins, list) or not all(
                isinstance(origin, str) for origin in parsed_origins
            ):
                raise ValueError("CORS_ORIGINS must be a JSON string list or a comma-separated list")
            return [origin.strip() for origin in parsed_origins if origin.strip()]

        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    public_base_url_raw: str | None = Field(default=None, validation_alias="PUBLIC_BASE_URL")
    app_base_url: str | None = Field(default=None, validation_alias="APP_BASE_URL")

    @property
    def public_base_url(self) -> str:
        return (self.public_base_url_raw or self.app_base_url or "http://localhost:8000").rstrip("/")

    sendgrid_api_key: str | None = Field(default=None, validation_alias="SENDGRID_API_KEY")
    smtp_host: str | None = Field(default=None, validation_alias="SMTP_HOST")
    smtp_port: int | None = Field(default=None, validation_alias="SMTP_PORT")
    smtp_secure: bool | None = Field(default=None, validation_alias="SMTP_SECURE")
    smtp_starttls: bool = Field(default=True, validation_alias="SMTP_STARTTLS")
    smtp_user: str | None = Field(default=None, validation_alias="SMTP_USER")
    smtp_password_value: str | None = Field(default=None, validation_alias="SMTP_PASSWORD")
    smtp_pass: str | None = Field(default=None, validation_alias="SMTP_PASS")
    email_from: str | None = Field(default=None, validation_alias="EMAIL_FROM")
    email_send_timeout_seconds: float = Field(default=10, validation_alias="EMAIL_SEND_TIMEOUT_SECONDS")

    @property
    def smtp_password(self) -> str | None:
        return self.smtp_password_value or self.smtp_pass

    @property
    def effective_smtp_port(self) -> int:
        if self.smtp_port is not None:
            return self.smtp_port
        return 465 if self.effective_smtp_secure else 587

    @property
    def effective_smtp_secure(self) -> bool:
        if self.smtp_secure is not None:
            return self.smtp_secure
        return self.smtp_port == 465

    auth_email_from: str | None = Field(default=None, validation_alias="AUTH_EMAIL_FROM")
    auth_email_from_name: str = Field(default="Bonefree", validation_alias="AUTH_EMAIL_FROM_NAME")

    receipt_company_name: str = Field(default="BONEFREE", validation_alias="RECEIPT_COMPANY_NAME")
    receipt_company_nif: str = Field(default="", validation_alias="RECEIPT_COMPANY_NIF")
    receipt_company_address: str = Field(
        default="Av. Frei Miguel Contreiras 54B, 1700-213 Lisboa, Portugal",
        validation_alias="RECEIPT_COMPANY_ADDRESS",
    )
    receipt_company_email: str = Field(
        default="carambolarubra@gmail.com",
        validation_alias="RECEIPT_COMPANY_EMAIL",
    )
    receipt_company_phone: str = Field(default="+351 968 107 703", validation_alias="RECEIPT_COMPANY_PHONE")
    receipt_from_email: str | None = Field(default=None, validation_alias="RECEIPT_FROM_EMAIL")
    receipt_tax_label: str = Field(default="Incluído", validation_alias="RECEIPT_TAX_LABEL")
    receipt_pickup_address: str = Field(
        default="Levantamento em loja - Av. Frei Miguel Contreiras 54B, 1700-213 Lisboa",
        validation_alias="RECEIPT_PICKUP_ADDRESS",
    )
    receipt_iva_rate: str = Field(default="13", validation_alias="RECEIPT_IVA_RATE")
    receipt_iva_exemption_reason: str = Field(
        default="Isento ao abrigo do artigo 53.º do CIVA",
        validation_alias="RECEIPT_IVA_EXEMPTION_REASON",
    )
    receipt_currency_symbol: str = Field(default="€", validation_alias="RECEIPT_CURRENCY_SYMBOL")
    receipt_company_logo_url: str | None = Field(default=None, validation_alias="RECEIPT_COMPANY_LOGO_URL")

    @property
    def effective_receipt_company_logo_url(self) -> str:
        if self.receipt_company_logo_url:
            return self.receipt_company_logo_url
        return f"{self.public_base_url}/assets/images/bonefree-logo.webp"

    model_config = SettingsConfigDict(
        env_file=(ENV_FILE, BACKEND_ENV_FILE),
        extra="ignore",
    )


settings = Settings()