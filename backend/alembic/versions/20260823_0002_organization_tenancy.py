"""Add organization tenancy and preserve Bonefree data.

Revision ID: 20260823_0002
Revises: 20260822_0001
Create Date: 2026-08-23
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260823_0002"
down_revision: str | None = "20260822_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TENANT_TABLES = (
    "user",
    "session",
    "customer_billing_address",
    "customer_loyalty",
    "coupon",
    "cart",
    "cart_product",
    "cart_product_customization",
    "category",
    "ingredient",
    "product",
    "product_ingredient",
    "product_customization_option",
    "media",
    "media_variant",
    "product_media",
    "site_setting",
    "customer_order",
    "order_product",
    "payment",
    "invoice",
    "product_review",
    "review_replies",
    "review_reactions",
)

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _json_object(value: object) -> dict:
    if not value:
        return {}
    try:
        decoded = json.loads(str(value))
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


def _site_settings(bind) -> tuple[dict, dict]:
    rows = bind.execute(
        sa.text(
            "SELECT key, value FROM site_setting "
            "WHERE key IN ('company_details', 'social_media')"
        )
    ).mappings()
    values = {str(row["key"]): row["value"] for row in rows}
    return _json_object(values.get("company_details")), _json_object(values.get("social_media"))


def _add_tenant_column(table_name: str, organization_id: int) -> None:
    with op.batch_alter_table(table_name, schema=None) as batch_op:
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))

    op.execute(
        sa.text(f'UPDATE "{table_name}" SET organization_id = :organization_id').bindparams(
            organization_id=organization_id
        )
    )

    with op.batch_alter_table(table_name, schema=None) as batch_op:
        batch_op.alter_column("organization_id", existing_type=sa.Integer(), nullable=False)
        batch_op.create_foreign_key(
            f"fk_{table_name}_organization_id_organization",
            "organization",
            ["organization_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(f"ix_{table_name}_organization_id", ["organization_id"], unique=False)


def _drop_unnamed_unique(table_name: str, columns: tuple[str, ...]) -> None:
    bind = op.get_bind()
    constraint_name = None
    for constraint in sa.inspect(bind).get_unique_constraints(table_name):
        if tuple(constraint.get("column_names") or ()) == columns:
            constraint_name = constraint.get("name")
            break
    if constraint_name is None:
        constraint_name = f"uq_{table_name}_{columns[0]}"

    with op.batch_alter_table(
        table_name,
        schema=None,
        naming_convention=NAMING_CONVENTION,
    ) as batch_op:
        batch_op.drop_constraint(constraint_name, type_="unique")


def _create_organization_type() -> None:
    if op.get_bind().dialect.name == "postgresql":
        postgresql.ENUM("restaurant", name="organizationtype").create(op.get_bind())


def _organization_type() -> sa.Enum:
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.ENUM("restaurant", name="organizationtype", create_type=False)
    return sa.Enum("restaurant", name="organizationtype")


def _issuer_address(profile: dict) -> str | None:
    locality = " ".join(
        str(profile.get(key) or "").strip()
        for key in ("postal_code", "city")
        if str(profile.get(key) or "").strip()
    )
    lines = [
        profile.get("address_line_1"),
        profile.get("address_line_2"),
        locality,
        profile.get("country"),
    ]
    rendered = "\n".join(str(line).strip() for line in lines if str(line or "").strip())
    return rendered or None


def upgrade() -> None:
    bind = op.get_bind()
    company_config_count = bind.scalar(sa.text("SELECT COUNT(*) FROM company_config")) or 0
    if company_config_count > 1:
        raise RuntimeError(
            "Cannot migrate company_config to organization_profile: more than one legacy row exists."
        )

    company_details, social_media = _site_settings(bind)
    brand_name = str(company_details.get("brand_name") or "BONEFREE").strip() or "BONEFREE"
    organization_name = "Bonefree" if brand_name.casefold() == "bonefree" else brand_name
    organization_email = str(company_details.get("email") or "carambolarubra@gmail.com").strip()
    organization_phone = str(company_details.get("phone") or "+351 968 107 703").strip()
    now = datetime.utcnow()

    _create_organization_type()
    op.create_table(
        "organization",
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("organization_type", _organization_type(), server_default="restaurant", nullable=False),
        sa.Column("email", sa.String(length=150), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_organization_id", "organization", ["id"], unique=False)
    op.create_index("ix_organization_slug", "organization", ["slug"], unique=True)

    organization_table = sa.table(
        "organization",
        sa.column("id", sa.Integer()),
        sa.column("name", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("organization_type", sa.String()),
        sa.column("email", sa.String()),
        sa.column("phone", sa.String()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    bind.execute(
        organization_table.insert().values(
            name=organization_name,
            slug="bonefree",
            organization_type="restaurant",
            email=organization_email,
            phone=organization_phone or None,
            created_at=now,
            updated_at=now,
        )
    )
    organization_id = bind.scalar(
        sa.select(organization_table.c.id).where(organization_table.c.slug == "bonefree")
    )
    if organization_id is None:
        raise RuntimeError("Failed to create the Bonefree organization during migration.")

    op.create_table(
        "organization_domain",
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("is_primary", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name="fk_organization_domain_organization_id_organization",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "domain",
            name="uq_organization_domain_organization_domain",
        ),
    )
    op.create_index("ix_organization_domain_id", "organization_domain", ["id"], unique=False)
    op.create_index("ix_organization_domain_organization_id", "organization_domain", ["organization_id"], unique=False)
    op.create_index("ix_organization_domain_domain", "organization_domain", ["domain"], unique=True)
    op.create_index(
        "uq_organization_domain_primary",
        "organization_domain",
        ["organization_id"],
        unique=True,
        sqlite_where=sa.text("is_primary = 1"),
        postgresql_where=sa.text("is_primary"),
    )

    domain_table = sa.table(
        "organization_domain",
        sa.column("domain", sa.String()),
        sa.column("is_primary", sa.Boolean()),
        sa.column("is_verified", sa.Boolean()),
        sa.column("organization_id", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    bind.execute(
        domain_table.insert(),
        [
            {
                "domain": domain,
                "is_primary": domain == "bonefree.pt",
                "is_verified": True,
                "organization_id": organization_id,
                "created_at": now,
                "updated_at": now,
            }
            for domain in ("bonefree.pt", "www.bonefree.pt", "bonefree.localhost", "127.0.0.1")
        ],
    )

    op.rename_table("company_config", "organization_profile")
    op.drop_index("ix_company_config_id", table_name="organization_profile")
    with op.batch_alter_table("organization_profile", schema=None) as batch_op:
        batch_op.alter_column(
            "company_name",
            existing_type=sa.String(length=150),
            new_column_name="legal_name",
            nullable=True,
        )
        batch_op.alter_column(
            "company_tax_id",
            existing_type=sa.String(length=20),
            new_column_name="tax_id",
            nullable=True,
        )
        batch_op.alter_column(
            "address",
            existing_type=sa.String(length=255),
            new_column_name="address_line_1",
            nullable=True,
        )
        batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("display_name", sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column("description", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("about_text", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("address_line_2", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("logo_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("currency_code", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("vat_exemption_reason", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("opening_hours", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("social_links", sa.JSON(), nullable=True))
    op.create_index("ix_organization_profile_id", "organization_profile", ["id"], unique=False)

    profile_table = sa.table(
        "organization_profile",
        sa.column("organization_id", sa.Integer()),
        sa.column("display_name", sa.String()),
        sa.column("legal_name", sa.String()),
        sa.column("tax_id", sa.String()),
        sa.column("description", sa.String()),
        sa.column("about_text", sa.Text()),
        sa.column("email", sa.String()),
        sa.column("phone", sa.String()),
        sa.column("address_line_1", sa.String()),
        sa.column("address_line_2", sa.String()),
        sa.column("city", sa.String()),
        sa.column("postal_code", sa.String()),
        sa.column("country", sa.String()),
        sa.column("logo_url", sa.String()),
        sa.column("currency_code", sa.String()),
        sa.column("vat_exemption_reason", sa.String()),
        sa.column("opening_hours", sa.JSON()),
        sa.column("social_links", sa.JSON()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    profile_values = {
        "organization_id": organization_id,
        "display_name": brand_name,
        "description": company_details.get("description"),
        "email": organization_email,
        "phone": organization_phone or None,
        "address_line_1": company_details.get("address"),
        "country": "Portugal",
        "logo_url": "/assets/images/bonefree-logo.webp",
        "currency_code": "EUR",
        "social_links": social_media or None,
        "updated_at": now,
    }
    if company_config_count:
        existing_profile = bind.execute(sa.select(profile_table)).mappings().first() or {}
        bind.execute(
            profile_table.update().values(
                **{
                    key: value
                    for key, value in profile_values.items()
                    if existing_profile.get(key) in (None, "") and value not in (None, "")
                }
            )
        )
    else:
        bind.execute(profile_table.insert().values(**profile_values, created_at=now))

    with op.batch_alter_table("organization_profile", schema=None) as batch_op:
        batch_op.alter_column("organization_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column(
            "currency_code",
            existing_type=sa.String(length=3),
            nullable=False,
            server_default="EUR",
        )
        batch_op.create_foreign_key(
            "fk_organization_profile_organization_id_organization",
            "organization",
            ["organization_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index("ix_organization_profile_organization_id", ["organization_id"], unique=False)
        batch_op.create_unique_constraint(
            "uq_organization_profile_organization_id",
            ["organization_id"],
        )

    for table_name in TENANT_TABLES:
        _add_tenant_column(table_name, organization_id)

    for index_name, table_name, column_name in (
        ("ix_user_email", "user", "email"),
        ("ix_site_setting_key", "site_setting", "key"),
        ("ix_coupon_code", "coupon", "code"),
        ("ix_invoice_invoice_number", "invoice", "invoice_number"),
    ):
        op.drop_index(index_name, table_name=table_name)
        op.create_index(index_name, table_name, [column_name], unique=False)

    _drop_unnamed_unique("user", ("tax_id",))
    _drop_unnamed_unique("ingredient", ("name",))
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_user_organization_email", ["organization_id", "email"])
        batch_op.create_unique_constraint("uq_user_organization_tax_id", ["organization_id", "tax_id"])
    with op.batch_alter_table("site_setting", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_site_setting_organization_key", ["organization_id", "key"])
    with op.batch_alter_table("ingredient", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_ingredient_organization_name", ["organization_id", "name"])
    with op.batch_alter_table("coupon", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_coupon_organization_code", ["organization_id", "code"])
    with op.batch_alter_table("invoice", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_invoice_organization_number", ["organization_id", "invoice_number"])
        batch_op.add_column(sa.Column("issuer_display_name", sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column("issuer_legal_name", sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column("issuer_tax_id", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("issuer_address", sa.String(length=700), nullable=True))
        batch_op.add_column(sa.Column("issuer_email", sa.String(length=150), nullable=True))
        batch_op.add_column(sa.Column("issuer_phone", sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column("issuer_logo_url", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("issuer_website", sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column("issuer_currency_code", sa.String(length=3), nullable=True))
        batch_op.add_column(sa.Column("issuer_vat_exemption_reason", sa.String(length=500), nullable=True))

    profile = bind.execute(sa.select(profile_table)).mappings().first() or {}
    primary_domain = bind.scalar(
        sa.select(domain_table.c.domain).where(
            domain_table.c.organization_id == organization_id,
            domain_table.c.is_primary.is_(True),
        )
    )
    invoice_table = sa.table(
        "invoice",
        sa.column("issuer_display_name", sa.String()),
        sa.column("issuer_legal_name", sa.String()),
        sa.column("issuer_tax_id", sa.String()),
        sa.column("issuer_address", sa.String()),
        sa.column("issuer_email", sa.String()),
        sa.column("issuer_phone", sa.String()),
        sa.column("issuer_logo_url", sa.String()),
        sa.column("issuer_website", sa.String()),
        sa.column("issuer_currency_code", sa.String()),
        sa.column("issuer_vat_exemption_reason", sa.String()),
    )
    bind.execute(
        invoice_table.update().values(
            issuer_display_name=profile.get("display_name") or organization_name,
            issuer_legal_name=profile.get("legal_name"),
            issuer_tax_id=profile.get("tax_id"),
            issuer_address=_issuer_address(profile),
            issuer_email=profile.get("email") or organization_email,
            issuer_phone=profile.get("phone") or organization_phone or None,
            issuer_logo_url=profile.get("logo_url"),
            issuer_website=f"https://{primary_domain}" if primary_domain else None,
            issuer_currency_code=profile.get("currency_code") or "EUR",
            issuer_vat_exemption_reason=profile.get("vat_exemption_reason"),
        )
    )
    with op.batch_alter_table("invoice", schema=None) as batch_op:
        batch_op.alter_column(
            "issuer_display_name",
            existing_type=sa.String(length=150),
            nullable=False,
        )
        batch_op.alter_column(
            "issuer_currency_code",
            existing_type=sa.String(length=3),
            nullable=False,
            server_default="EUR",
        )


def downgrade() -> None:
    bind = op.get_bind()
    organization_count = bind.scalar(sa.text("SELECT COUNT(*) FROM organization")) or 0
    if organization_count > 1:
        raise RuntimeError("Cannot downgrade organization tenancy while multiple organizations exist.")

    with op.batch_alter_table("invoice", schema=None) as batch_op:
        batch_op.drop_constraint("uq_invoice_organization_number", type_="unique")
        for column_name in (
            "issuer_vat_exemption_reason",
            "issuer_currency_code",
            "issuer_website",
            "issuer_logo_url",
            "issuer_phone",
            "issuer_email",
            "issuer_address",
            "issuer_tax_id",
            "issuer_legal_name",
            "issuer_display_name",
        ):
            batch_op.drop_column(column_name)
    with op.batch_alter_table("coupon", schema=None) as batch_op:
        batch_op.drop_constraint("uq_coupon_organization_code", type_="unique")
    with op.batch_alter_table("ingredient", schema=None) as batch_op:
        batch_op.drop_constraint("uq_ingredient_organization_name", type_="unique")
    with op.batch_alter_table("site_setting", schema=None) as batch_op:
        batch_op.drop_constraint("uq_site_setting_organization_key", type_="unique")
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_constraint("uq_user_organization_tax_id", type_="unique")
        batch_op.drop_constraint("uq_user_organization_email", type_="unique")

    for index_name, table_name, column_name in (
        ("ix_user_email", "user", "email"),
        ("ix_site_setting_key", "site_setting", "key"),
        ("ix_coupon_code", "coupon", "code"),
        ("ix_invoice_invoice_number", "invoice", "invoice_number"),
    ):
        op.drop_index(index_name, table_name=table_name)
        op.create_index(index_name, table_name, [column_name], unique=True)
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_user_tax_id", ["tax_id"])
    with op.batch_alter_table("ingredient", schema=None) as batch_op:
        batch_op.create_unique_constraint("uq_ingredient_name", ["name"])

    for table_name in reversed(TENANT_TABLES):
        with op.batch_alter_table(table_name, schema=None) as batch_op:
            batch_op.drop_index(f"ix_{table_name}_organization_id")
            batch_op.drop_constraint(
                f"fk_{table_name}_organization_id_organization",
                type_="foreignkey",
            )
            batch_op.drop_column("organization_id")

    op.execute(
        sa.text(
            "UPDATE organization_profile SET "
            "legal_name = COALESCE(NULLIF(legal_name, ''), display_name, 'BONEFREE'), "
            "tax_id = COALESCE(tax_id, '')"
        )
    )
    with op.batch_alter_table("organization_profile", schema=None) as batch_op:
        batch_op.drop_constraint("uq_organization_profile_organization_id", type_="unique")
        batch_op.drop_index("ix_organization_profile_organization_id")
        batch_op.drop_constraint(
            "fk_organization_profile_organization_id_organization",
            type_="foreignkey",
        )
        for column_name in (
            "social_links",
            "opening_hours",
            "vat_exemption_reason",
            "currency_code",
            "logo_url",
            "address_line_2",
            "about_text",
            "description",
            "display_name",
            "organization_id",
        ):
            batch_op.drop_column(column_name)
        batch_op.alter_column(
            "legal_name",
            existing_type=sa.String(length=150),
            new_column_name="company_name",
            nullable=False,
        )
        batch_op.alter_column(
            "tax_id",
            existing_type=sa.String(length=20),
            new_column_name="company_tax_id",
            nullable=False,
        )
        batch_op.alter_column(
            "address_line_1",
            existing_type=sa.String(length=255),
            new_column_name="address",
            nullable=True,
        )
    op.drop_index("ix_organization_profile_id", table_name="organization_profile")
    op.rename_table("organization_profile", "company_config")
    op.create_index("ix_company_config_id", "company_config", ["id"], unique=False)

    op.drop_index("uq_organization_domain_primary", table_name="organization_domain")
    op.drop_index("ix_organization_domain_domain", table_name="organization_domain")
    op.drop_index("ix_organization_domain_organization_id", table_name="organization_domain")
    op.drop_index("ix_organization_domain_id", table_name="organization_domain")
    op.drop_table("organization_domain")
    op.drop_index("ix_organization_slug", table_name="organization")
    op.drop_index("ix_organization_id", table_name="organization")
    op.drop_table("organization")
    if bind.dialect.name == "postgresql":
        postgresql.ENUM("restaurant", name="organizationtype").drop(bind)
