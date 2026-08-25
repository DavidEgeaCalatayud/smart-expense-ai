"""Add revocable user session version.

Revision ID: 0007_user_session_version
Revises: 0006_intelligence_rules_v2
Create Date: 2026-08-25 19:35:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_user_session_version"
down_revision: Union[str, Sequence[str], None] = "0006_intelligence_rules_v2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("users", "session_version")
