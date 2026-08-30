"""Add revocable rotating mobile authentication sessions.

Revision ID: 0012_mobile_auth_v1
Revises: 0011_mobile_sync_v1
Create Date: 2026-08-30 18:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0012_mobile_auth_v1"
down_revision: Union[str, Sequence[str], None] = "0011_mobile_sync_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mobile_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_mobile_sessions_user_device",
        "mobile_sessions",
        ["user_id", "device_id"],
        unique=False,
    )
    op.create_index(
        "ix_mobile_sessions_user_active",
        "mobile_sessions",
        ["user_id", "revoked_at"],
        unique=False,
    )

    op.create_table(
        "mobile_refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["session_id"], ["mobile_sessions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["replaced_by_id"], ["mobile_refresh_tokens.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_mobile_refresh_tokens_token_hash",
        "mobile_refresh_tokens",
        ["token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_mobile_refresh_tokens_session_created",
        "mobile_refresh_tokens",
        ["session_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_mobile_refresh_tokens_session_created", table_name="mobile_refresh_tokens")
    op.drop_index("ix_mobile_refresh_tokens_token_hash", table_name="mobile_refresh_tokens")
    op.drop_table("mobile_refresh_tokens")
    op.drop_index("ix_mobile_sessions_user_active", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_user_device", table_name="mobile_sessions")
    op.drop_table("mobile_sessions")
