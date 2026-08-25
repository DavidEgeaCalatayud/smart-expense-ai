from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IntelligenceFinding(Base):
    __tablename__ = "intelligence_findings"
    __table_args__ = (
        CheckConstraint(
            "finding_type IN ('recurring_pattern', 'recurring_payment_missing', 'duplicate_subscription', 'spending_anomaly', 'frequency_anomaly')",
            name="ck_intelligence_findings_type",
        ),
        CheckConstraint(
            "severity IN ('info', 'warning', 'high')",
            name="ck_intelligence_findings_severity",
        ),
        CheckConstraint(
            "status IN ('open', 'dismissed', 'resolved')",
            name="ck_intelligence_findings_status",
        ),
        UniqueConstraint("user_id", "fingerprint", name="uq_intelligence_findings_user_fingerprint"),
        Index("ix_intelligence_findings_user_status", "user_id", "status"),
        Index("ix_intelligence_findings_user_type", "user_id", "finding_type"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    finding_type: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", server_default="open")
    fingerprint: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_version: Mapped[str] = mapped_column(String(32), nullable=False, default="rules-v1", server_default="rules-v1")
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    explanation: Mapped[str] = mapped_column(String(1200), nullable=False)
    evidence: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False, default=dict)
    first_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IntelligenceScan(Base):
    __tablename__ = "intelligence_scans"
    __table_args__ = (Index("ix_intelligence_scans_user_created", "user_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule_version: Mapped[str] = mapped_column(String(32), nullable=False, default="rules-v1", server_default="rules-v1")
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False)
    finding_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
