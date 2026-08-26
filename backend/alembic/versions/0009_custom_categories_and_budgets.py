"""Add user-owned categories and monthly budgets.

Revision ID: 0009_custom_categories_and_budgets
Revises: 0008_csv_import_batches
Create Date: 2026-08-26 15:25:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0009_custom_categories_and_budgets"
down_revision: Union[str, Sequence[str], None] = "0008_csv_import_batches"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_categories_name", table_name="categories")
    op.add_column(
        "categories",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "categories",
        sa.Column(
            "system_category",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.add_column(
        "categories",
        sa.Column(
            "archived",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    op.execute("UPDATE categories SET system_category = true WHERE owner_user_id IS NULL")
    op.create_foreign_key(
        "fk_categories_owner_user_id",
        "categories",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_check_constraint(
        "ck_categories_ownership_scope",
        "categories",
        "(system_category = true AND owner_user_id IS NULL) OR "
        "(system_category = false AND owner_user_id IS NOT NULL)",
    )
    op.create_index("ix_categories_name", "categories", ["name"], unique=False)
    op.create_index(
        "ix_categories_owner_user_id",
        "categories",
        ["owner_user_id"],
        unique=False,
    )
    op.create_index(
        "uq_categories_system_name_type",
        "categories",
        [sa.text("lower(name)"), "transaction_type"],
        unique=True,
        postgresql_where=sa.text("owner_user_id IS NULL"),
    )
    op.create_index(
        "uq_categories_user_name_type",
        "categories",
        ["owner_user_id", sa.text("lower(name)"), "transaction_type"],
        unique=True,
        postgresql_where=sa.text("owner_user_id IS NOT NULL"),
    )

    op.create_table(
        "budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("limit_amount", sa.Numeric(precision=12, scale=2), nullable=False),
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
        sa.CheckConstraint("limit_amount > 0", name="ck_budgets_limit_positive"),
        sa.CheckConstraint("EXTRACT(DAY FROM month) = 1", name="ck_budgets_month_first_day"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_budgets_user_id", "budgets", ["user_id"], unique=False)
    op.create_index("ix_budgets_category_id", "budgets", ["category_id"], unique=False)
    op.create_index("ix_budgets_month", "budgets", ["month"], unique=False)
    op.create_index(
        "uq_budgets_user_month_overall",
        "budgets",
        ["user_id", "month"],
        unique=True,
        postgresql_where=sa.text("category_id IS NULL"),
    )
    op.create_index(
        "uq_budgets_user_month_category",
        "budgets",
        ["user_id", "month", "category_id"],
        unique=True,
        postgresql_where=sa.text("category_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_budgets_user_month_category", table_name="budgets")
    op.drop_index("uq_budgets_user_month_overall", table_name="budgets")
    op.drop_index("ix_budgets_month", table_name="budgets")
    op.drop_index("ix_budgets_category_id", table_name="budgets")
    op.drop_index("ix_budgets_user_id", table_name="budgets")
    op.drop_table("budgets")

    op.drop_index("uq_categories_user_name_type", table_name="categories")
    op.drop_index("uq_categories_system_name_type", table_name="categories")
    op.drop_index("ix_categories_owner_user_id", table_name="categories")
    op.drop_index("ix_categories_name", table_name="categories")
    op.drop_constraint("ck_categories_ownership_scope", "categories", type_="check")
    op.drop_constraint("fk_categories_owner_user_id", "categories", type_="foreignkey")
    op.drop_column("categories", "archived")
    op.drop_column("categories", "system_category")
    op.drop_column("categories", "owner_user_id")
    op.create_index("ix_categories_name", "categories", ["name"], unique=True)
