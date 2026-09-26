from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    FetchedValue,
    ForeignKey,
    Index,
    Numeric,
    String,
    func,
    text,
    true,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    pass


class FinancialAccount(Base):
    __tablename__ = "financial_accounts"
    __table_args__ = (
        CheckConstraint(
            "account_type IN ('checking', 'savings', 'broker', 'wallet', 'cash', 'other')",
            name="ck_financial_accounts_account_type",
        ),
        CheckConstraint(
            "purpose IN ('daily', 'savings', 'emergency_fund', 'opportunities', 'investment', 'other')",
            name="ck_financial_accounts_purpose",
        ),
        CheckConstraint("currency = 'EUR'", name="ck_financial_accounts_currency_eur"),
        CheckConstraint("sync_version > 0", name="ck_financial_accounts_sync_version_positive"),
        Index("ix_financial_accounts_user_active", "user_id", "archived"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(120), nullable=True)
    account_type: Mapped[str] = mapped_column(String(32), nullable=False)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    current_balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default=text("'EUR'"))
    include_in_net_worth: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    balance_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    sync_version: Mapped[int] = mapped_column(
        BigInteger,
        nullable=False,
        server_default=text("1"),
        server_onupdate=FetchedValue(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    balance_snapshots: Mapped[list["FinancialAccountBalanceSnapshot"]] = relationship(
        back_populates="financial_account",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class FinancialAccountBalanceSnapshot(Base):
    __tablename__ = "financial_account_balance_snapshots"
    __table_args__ = (
        CheckConstraint(
            "source IN ('manual', 'open_banking', 'import')",
            name="ck_financial_account_balance_snapshots_source",
        ),
        Index(
            "ix_financial_account_balance_snapshots_account_recorded",
            "financial_account_id",
            "recorded_at",
        ),
        Index(
            "ix_financial_account_balance_snapshots_user_recorded",
            "user_id",
            "recorded_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    financial_account_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("financial_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    balance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    include_in_net_worth: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=true(),
    )
    archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    source: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        server_default=text("'manual'"),
    )

    financial_account: Mapped["FinancialAccount"] = relationship(back_populates="balance_snapshots")
