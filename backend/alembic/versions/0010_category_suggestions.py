"""Persist user-controlled category suggestion feedback.

Revision ID: 0010_category_suggestions
Revises: 0009_categories_budgets
Create Date: 2026-08-27 11:55:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0010_category_suggestions"
down_revision: Union[str, Sequence[str], None] = "0009_categories_budgets"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "category_suggestions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("merchant_key", sa.String(length=160), nullable=False),
        sa.Column("transaction_type", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("model_version", sa.String(length=80), nullable=False),
        sa.Column("feature_policy", sa.String(length=120), nullable=False),
        sa.Column("suggested_category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("selected_category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("accepted", sa.Boolean(), nullable=False),
        sa.Column("corrected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "transaction_type IN ('expense', 'income')",
            name="ck_category_suggestions_transaction_type",
        ),
        sa.CheckConstraint(
            "source IN ('user_history', 'global_model')",
            name="ck_category_suggestions_source",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["transaction_id"], ["transactions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["suggested_category_id"], ["categories.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["selected_category_id"], ["categories.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_id", name="uq_category_suggestions_transaction_id"),
    )
    op.create_index(
        "ix_category_suggestions_user_id",
        "category_suggestions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_category_suggestions_user_merchant_type_created",
        "category_suggestions",
        ["user_id", "merchant_key", "transaction_type", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_category_suggestions_user_merchant_type_created",
        table_name="category_suggestions",
    )
    op.drop_index("ix_category_suggestions_user_id", table_name="category_suggestions")
    op.drop_table("category_suggestions")
