"""Allow rules-v2 recurring and frequency findings.

Revision ID: 0006_intelligence_rules_v2
Revises: 0005_historical_analysis
Create Date: 2026-08-25 09:40:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_intelligence_rules_v2"
down_revision: Union[str, Sequence[str], None] = "0005_historical_analysis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


RULES_V2_TYPES = (
    "'recurring_pattern', 'recurring_payment_missing', 'duplicate_subscription', "
    "'spending_anomaly', 'frequency_anomaly'"
)
RULES_V1_TYPES = "'recurring_pattern', 'duplicate_subscription', 'spending_anomaly'"


def upgrade() -> None:
    op.drop_constraint(
        "ck_intelligence_findings_type",
        "intelligence_findings",
        type_="check",
    )
    op.create_check_constraint(
        "ck_intelligence_findings_type",
        "intelligence_findings",
        sa.text(f"finding_type IN ({RULES_V2_TYPES})"),
    )


def downgrade() -> None:
    # A downgrade is safe only when no rules-v2-only findings remain.
    op.execute(
        "DELETE FROM intelligence_findings "
        "WHERE finding_type IN ('recurring_payment_missing', 'frequency_anomaly')"
    )
    op.drop_constraint(
        "ck_intelligence_findings_type",
        "intelligence_findings",
        type_="check",
    )
    op.create_check_constraint(
        "ck_intelligence_findings_type",
        "intelligence_findings",
        sa.text(f"finding_type IN ({RULES_V1_TYPES})"),
    )
