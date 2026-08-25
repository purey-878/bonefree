"""Add organization experience and feature entitlements.

Revision ID: 20260825_0003
Revises: 20260823_0002
Create Date: 2026-08-25
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from alembic import op
import sqlalchemy as sa


revision: str = "20260825_0003"
down_revision: str | None = "20260823_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


BONEFREE_FEATURES = (
    "catalog",
    "customer_accounts",
    "events",
    "loyalty",
    "ordering",
    "reviews",
)


def upgrade() -> None:
    op.create_table(
        "organization_experience",
        sa.Column("schema_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("theme_key", sa.String(length=100), nullable=False),
        sa.Column("theme_mode", sa.String(length=100), nullable=True),
        sa.Column("decoration_preset", sa.String(length=100), nullable=True),
        sa.Column("token_overrides", sa.JSON(), nullable=False),
        sa.Column("assets", sa.JSON(), nullable=False),
        sa.Column("navigation", sa.JSON(), nullable=False),
        sa.Column("pages", sa.JSON(), nullable=False),
        sa.Column("variant_overrides", sa.JSON(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name="fk_organization_experience_organization_id_organization",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            name="uq_organization_experience_organization_id",
        ),
    )
    op.create_index(
        "ix_organization_experience_id",
        "organization_experience",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_organization_experience_organization_id",
        "organization_experience",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "organization_feature_entitlement",
        sa.Column("feature_key", sa.String(length=100), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="0", nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=True),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organization.id"],
            name="fk_organization_feature_entitlement_organization_id_organization",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "feature_key",
            name="uq_organization_feature_entitlement_organization_feature",
        ),
    )
    op.create_index(
        "ix_organization_feature_entitlement_id",
        "organization_feature_entitlement",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_organization_feature_entitlement_organization_id",
        "organization_feature_entitlement",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        "ix_organization_feature_entitlement_feature_key",
        "organization_feature_entitlement",
        ["feature_key"],
        unique=False,
    )

    bind = op.get_bind()
    organization_id = bind.scalar(
        sa.text("SELECT id FROM organization WHERE slug = 'bonefree'")
    )
    if organization_id is None:
        raise RuntimeError("Bonefree organization is required before seeding its experience.")

    now = datetime.now(UTC).replace(tzinfo=None)
    experience_table = sa.table(
        "organization_experience",
        sa.column("schema_version", sa.Integer()),
        sa.column("theme_key", sa.String()),
        sa.column("theme_mode", sa.String()),
        sa.column("decoration_preset", sa.String()),
        sa.column("token_overrides", sa.JSON()),
        sa.column("assets", sa.JSON()),
        sa.column("navigation", sa.JSON()),
        sa.column("pages", sa.JSON()),
        sa.column("variant_overrides", sa.JSON()),
        sa.column("organization_id", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    bind.execute(
        experience_table.insert().values(
            schema_version=1,
            theme_key="bonefree",
            theme_mode="default",
            decoration_preset=None,
            token_overrides={},
            assets={"logo": "/assets/images/bonefree-logo.webp"},
            navigation=[
                {"id": "home", "route_id": "home", "label": "Home", "enabled": True},
                {"id": "menu", "route_id": "menu", "label": "Menu", "enabled": True},
                {"id": "about", "route_id": "about", "label": "About", "enabled": True},
                {"id": "events", "route_id": "events", "label": "Events", "enabled": True},
                {"id": "contact", "route_id": "contact", "label": "Contact", "enabled": True},
            ],
            pages={
                "home": {
                    "sections": [
                        {"id": "hero", "type": "hero", "enabled": True},
                        {"id": "categories", "type": "category_navigation", "enabled": True, "feature_key": "catalog"},
                        {"id": "loyalty", "type": "loyalty", "enabled": True, "feature_key": "loyalty"},
                        {"id": "popular", "type": "popular_products", "enabled": True, "feature_key": "catalog"},
                        {"id": "chef", "type": "chef_special", "enabled": True, "feature_key": "catalog"},
                        {"id": "reviews", "type": "reviews", "enabled": True, "feature_key": "reviews"},
                    ]
                }
            },
            variant_overrides={},
            organization_id=organization_id,
            created_at=now,
            updated_at=now,
        )
    )

    entitlement_table = sa.table(
        "organization_feature_entitlement",
        sa.column("feature_key", sa.String()),
        sa.column("enabled", sa.Boolean()),
        sa.column("configuration", sa.JSON()),
        sa.column("organization_id", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
        sa.column("updated_at", sa.DateTime()),
    )
    bind.execute(
        entitlement_table.insert(),
        [
            {
                "feature_key": feature_key,
                "enabled": True,
                "configuration": None,
                "organization_id": organization_id,
                "created_at": now,
                "updated_at": now,
            }
            for feature_key in BONEFREE_FEATURES
        ],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_organization_feature_entitlement_feature_key",
        table_name="organization_feature_entitlement",
    )
    op.drop_index(
        "ix_organization_feature_entitlement_organization_id",
        table_name="organization_feature_entitlement",
    )
    op.drop_index(
        "ix_organization_feature_entitlement_id",
        table_name="organization_feature_entitlement",
    )
    op.drop_table("organization_feature_entitlement")
    op.drop_index(
        "ix_organization_experience_organization_id",
        table_name="organization_experience",
    )
    op.drop_index(
        "ix_organization_experience_id",
        table_name="organization_experience",
    )
    op.drop_table("organization_experience")
