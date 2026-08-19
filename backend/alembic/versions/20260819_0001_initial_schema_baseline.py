"""Initial schema baseline.

Revision ID: 20260819_0001
Revises:
Create Date: 2026-08-19 14:32:00

This baseline represents the current SQLAlchemy models state. Existing
databases that already contain this schema should be marked with:

    alembic stamp head

New databases should be created with:

    alembic upgrade head
"""

from collections.abc import Sequence

from alembic import op

from database import Base

import models  # noqa: F401 - ensure SQLAlchemy metadata includes all models.

revision: str = "20260819_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)