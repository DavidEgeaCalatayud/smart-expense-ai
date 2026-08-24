"""Add persisted financial intelligence findings and scans.

Revision ID: 0004_financial_intelligence
Revises: 0003_user_ownership
Create Date: 2026-08-24 11:58:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_financial_intelligence"
down_revision: Union[str, Sequence[str], None] = "0003_user_ownership"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "intelligence_findings",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finding_type", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="open", nullable=False),
        sa.Column("fingerprint", sa.String(length=255), nullable=False),
        sa.Column("rule_version", sa.String(length=32), server_default="rules-v1", nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("explanation", sa.String(length=1200), nullable=False),
        sa.Column("evidence", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("first_detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_detected_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "finding_type IN ('recurring_pattern', 'duplicate_subscription', 'spending_anomaly')",
            name="ck_intelligence_findings_type",
        ),
        sa.CheckConstraint(
            "severity IN ('info', 'warning', 'high')",
            name="ck_intelligence_findings_severity",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'dismissed', 'resolved')",
            name="ck_intelligence_findings_status",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "fingerprint", name="uq_intelligence_findings_user_fingerprint"),
    )
    op.create_index(
        "ix_intelligence_findings_user_status",
        "intelligence_findings",
        ["user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_intelligence_findings_user_type",
        "intelligence_findings",
        ["user_id", "finding_type"],
        unique=False,
    )

    op.create_table(
        "intelligence_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rule_version", sa.String(length=32), server_default="rules-v1", nullable=False),
        sa.Column("transaction_count", sa.Integer(), nullable=False),
        sa.Column("finding_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_intelligence_scans_user_created",
        "intelligence_scans",
        ["user_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_intelligence_scans_user_created", table_name="intelligence_scans")
    op.drop_table("intelligence_scans")
    op.drop_index("ix_intelligence_findings_user_type", table_name="intelligence_findings")
    op.drop_index("ix_intelligence_findings_user_status", table_name="intelligence_findings")
    op.drop_table("intelligence_findings")
