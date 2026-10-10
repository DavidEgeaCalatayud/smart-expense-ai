"""Add investment positions, movements and public NAV quotes.

Revision ID: 0018_investment_portfolios
Revises: 0017_fin_account_state_history
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0018_investment_portfolios"
down_revision = "0017_fin_account_state_history"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.drop_constraint("ck_financial_account_balance_snapshots_source", "financial_account_balance_snapshots", type_="check")
    op.create_check_constraint(
        "ck_financial_account_balance_snapshots_source",
        "financial_account_balance_snapshots",
        "source IN ('manual', 'open_banking', 'import', 'market')",
    )
    op.create_table(
        "investment_positions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("financial_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("financial_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("isin", sa.String(length=12), nullable=False),
        sa.Column("units", sa.Numeric(24, 8), nullable=False),
        sa.Column("cost_total", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'EUR'")),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("currency = 'EUR'", name="ck_investment_positions_currency_eur"),
        sa.CheckConstraint("units >= 0", name="ck_investment_positions_units_non_negative"),
        sa.CheckConstraint("cost_total >= 0", name="ck_investment_positions_cost_non_negative"),
    )
    op.create_index("ix_investment_positions_user_account_active", "investment_positions", ["user_id", "financial_account_id", "archived"])
    op.create_index("ix_investment_positions_isin_active", "investment_positions", ["isin", "archived"])
    op.create_index("ix_investment_positions_user_id", "investment_positions", ["user_id"])

    op.create_table(
        "investment_position_movements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("position_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("investment_positions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("movement_type", sa.String(length=24), nullable=False),
        sa.Column("units_after", sa.Numeric(24, 8), nullable=False),
        sa.Column("cost_total_after", sa.Numeric(14, 2), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("movement_type IN ('initial', 'contribution', 'sale', 'transfer_in', 'transfer_out', 'adjustment')", name="ck_investment_position_movements_type"),
        sa.CheckConstraint("units_after >= 0", name="ck_investment_position_movements_units_non_negative"),
        sa.CheckConstraint("cost_total_after >= 0", name="ck_investment_position_movements_cost_non_negative"),
    )
    op.create_index("ix_investment_position_movements_position_occurred", "investment_position_movements", ["position_id", "occurred_at"])
    op.create_index("ix_investment_position_movements_user_id", "investment_position_movements", ["user_id"])

    op.create_table(
        "fund_nav_quotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("isin", sa.String(length=12), nullable=False),
        sa.Column("nav", sa.Numeric(18, 6), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default=sa.text("'EUR'")),
        sa.Column("valuation_date", sa.Date(), nullable=False),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("currency = 'EUR'", name="ck_fund_nav_quotes_currency_eur"),
        sa.CheckConstraint("nav > 0", name="ck_fund_nav_quotes_nav_positive"),
        sa.UniqueConstraint("isin", "valuation_date", name="uq_fund_nav_quotes_isin_date"),
    )
    op.create_index("ix_fund_nav_quotes_isin_date", "fund_nav_quotes", ["isin", "valuation_date"])

def downgrade() -> None:
    op.drop_index("ix_fund_nav_quotes_isin_date", table_name="fund_nav_quotes")
    op.drop_table("fund_nav_quotes")
    op.drop_index("ix_investment_position_movements_user_id", table_name="investment_position_movements")
    op.drop_index("ix_investment_position_movements_position_occurred", table_name="investment_position_movements")
    op.drop_table("investment_position_movements")
    op.drop_index("ix_investment_positions_user_id", table_name="investment_positions")
    op.drop_index("ix_investment_positions_isin_active", table_name="investment_positions")
    op.drop_index("ix_investment_positions_user_account_active", table_name="investment_positions")
    op.drop_table("investment_positions")
    op.drop_constraint("ck_financial_account_balance_snapshots_source", "financial_account_balance_snapshots", type_="check")
    op.create_check_constraint(
        "ck_financial_account_balance_snapshots_source",
        "financial_account_balance_snapshots",
        "source IN ('manual', 'open_banking', 'import')",
    )
