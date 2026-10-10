from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class InvestmentPosition(Base):
    __tablename__ = "investment_positions"
    __table_args__ = (
        CheckConstraint("currency = 'EUR'", name="ck_investment_positions_currency_eur"),
        CheckConstraint("units >= 0", name="ck_investment_positions_units_non_negative"),
        CheckConstraint("cost_total >= 0", name="ck_investment_positions_cost_non_negative"),
        Index("ix_investment_positions_user_account_active", "user_id", "financial_account_id", "archived"),
        Index("ix_investment_positions_isin_active", "isin", "archived"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    financial_account_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("financial_accounts.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    isin: Mapped[str] = mapped_column(String(12), nullable=False)
    units: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    cost_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'EUR'"))
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class InvestmentPositionMovement(Base):
    __tablename__ = "investment_position_movements"
    __table_args__ = (
        CheckConstraint(
            "movement_type IN ('initial', 'contribution', 'sale', 'transfer_in', 'transfer_out', 'adjustment')",
            name="ck_investment_position_movements_type",
        ),
        CheckConstraint("units_after >= 0", name="ck_investment_position_movements_units_non_negative"),
        CheckConstraint("cost_total_after >= 0", name="ck_investment_position_movements_cost_non_negative"),
        Index("ix_investment_position_movements_position_occurred", "position_id", "occurred_at"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    position_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("investment_positions.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_type: Mapped[str] = mapped_column(String(24), nullable=False)
    units_after: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    cost_total_after: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FundNavQuote(Base):
    __tablename__ = "fund_nav_quotes"
    __table_args__ = (
        CheckConstraint("currency = 'EUR'", name="ck_fund_nav_quotes_currency_eur"),
        CheckConstraint("nav > 0", name="ck_fund_nav_quotes_nav_positive"),
        UniqueConstraint("isin", "valuation_date", name="uq_fund_nav_quotes_isin_date"),
        Index("ix_fund_nav_quotes_isin_date", "isin", "valuation_date"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    isin: Mapped[str] = mapped_column(String(12), nullable=False)
    nav: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'EUR'"))
    valuation_date: Mapped[date] = mapped_column(Date, nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
