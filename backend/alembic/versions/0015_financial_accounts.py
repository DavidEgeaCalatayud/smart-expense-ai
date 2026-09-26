"""Manual financial accounts and net-worth snapshots.

Revision ID: 0015_financial_accounts
Revises: 0014_password_recovery
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0015_financial_accounts"
down_revision = "0014_password_recovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "financial_accounts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("institution", sa.String(length=120), nullable=True),
        sa.Column("account_type", sa.String(length=32), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("current_balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), server_default=sa.text("'EUR'"), nullable=False),
        sa.Column("include_in_net_worth", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("balance_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "account_type IN ('checking', 'savings', 'broker', 'wallet', 'cash', 'other')",
            name="ck_financial_accounts_account_type",
        ),
        sa.CheckConstraint(
            "purpose IN ('daily', 'savings', 'emergency_fund', 'opportunities', 'investment', 'other')",
            name="ck_financial_accounts_purpose",
        ),
        sa.CheckConstraint("currency = 'EUR'", name="ck_financial_accounts_currency_eur"),
    )
    op.create_index("ix_financial_accounts_user_id", "financial_accounts", ["user_id"])
    op.create_index(
        "ix_financial_accounts_user_active",
        "financial_accounts",
        ["user_id", "archived"],
    )

    op.create_table(
        "financial_account_balance_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "financial_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("balance", sa.Numeric(12, 2), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("source", sa.String(length=32), server_default=sa.text("'manual'"), nullable=False),
        sa.CheckConstraint(
            "source IN ('manual', 'open_banking', 'import')",
            name="ck_financial_account_balance_snapshots_source",
        ),
    )
    op.create_index(
        "ix_financial_account_balance_snapshots_account_recorded",
        "financial_account_balance_snapshots",
        ["financial_account_id", "recorded_at"],
    )
    op.create_index(
        "ix_financial_account_balance_snapshots_user_recorded",
        "financial_account_balance_snapshots",
        ["user_id", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_table("financial_account_balance_snapshots")
    op.drop_table("financial_accounts")
