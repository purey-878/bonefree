"""Persist legal documents without replacing existing organisation data.

Revision ID: 20260907_0007
Revises: 20260831_0006
"""
import json
from datetime import UTC, datetime
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "20260907_0007"
down_revision = "20260831_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if "organization_legal_document" not in sa.inspect(bind).get_table_names():
        op.create_table(
            "organization_legal_document",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("organization_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
            sa.Column("document_type", sa.String(30), nullable=False),
            sa.Column("locale", sa.String(5), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("eyebrow", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("summary_title", sa.String(200), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("body", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.UniqueConstraint("organization_id", "document_type", "locale", name="uq_legal_document_organization_type_locale"),
        )
        op.create_index("ix_organization_legal_document_id", "organization_legal_document", ["id"])
        op.create_index("ix_organization_legal_document_organization_id", "organization_legal_document", ["organization_id"])
    metadata = sa.MetaData()
    documents = sa.Table("organization_legal_document", metadata, autoload_with=bind)
    organizations = sa.Table("organization", metadata, autoload_with=bind)
    # Versioned fixtures are immutable migration inputs, independent of ORM code.
    root = Path(__file__).resolve().parents[2] / "seeds" / "organizations"
    defaults = json.loads((root / "legal_defaults_v1.json").read_text(encoding="utf-8"))
    bonefree = json.loads((root / "bonefree_v1.json").read_text(encoding="utf-8"))["documents"]
    existing = set(bind.execute(sa.select(documents.c.organization_id, documents.c.document_type, documents.c.locale)).all())
    rows = []
    now = datetime.now(UTC).replace(tzinfo=None)
    for organization in bind.execute(sa.select(organizations.c.id, organizations.c.slug, organizations.c.purged_at)).mappings():
        if organization["purged_at"] is not None:
            continue
        for source in bonefree if organization["slug"] == "bonefree" else defaults:
            key = (organization["id"], source["document_type"], source["locale"])
            if key not in existing:
                row = dict(source, organization_id=organization["id"], created_at=now)
                row["updated_at"] = datetime.fromisoformat(source["updated_at"]) if source.get("updated_at") else now
                rows.append(row)
    if rows:
        bind.execute(documents.insert(), rows)


def downgrade() -> None:
    op.drop_table("organization_legal_document")
