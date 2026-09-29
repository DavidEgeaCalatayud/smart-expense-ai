"""Preserve financial-account inclusion state in historical observations.

Revision ID: 0017_fin_account_state_history
Revises: 0016_financial_accounts_sync
"""
from alembic import op
import sqlalchemy as sa


revision = "0017_fin_account_state_history"
down_revision = "0016_financial_accounts_sync"
branch_labels = None
depends_on = None


SNAPSHOT_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_financial_account_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        NEW.user_id,
        'financial_account_snapshot',
        NEW.id,
        'upsert',
        1,
        jsonb_build_object(
            'financialAccountId', NEW.financial_account_id::text,
            'balance', to_char(NEW.balance, 'FM9999999990.00'),
            'includeInNetWorth', NEW.include_in_net_worth,
            'archived', NEW.archived,
            'recordedAt', to_char(NEW.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'source', NEW.source
        ),
        NEW.recorded_at
    );
    RETURN NEW;
END;
$$;
"""


OLD_SNAPSHOT_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_financial_account_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        NEW.user_id,
        'financial_account_snapshot',
        NEW.id,
        'upsert',
        1,
        jsonb_build_object(
            'financialAccountId', NEW.financial_account_id::text,
            'balance', to_char(NEW.balance, 'FM9999999990.00'),
            'recordedAt', to_char(NEW.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'source', NEW.source
        ),
        NEW.recorded_at
    );
    RETURN NEW;
END;
$$;
"""


def upgrade() -> None:
    op.add_column(
        "financial_account_balance_snapshots",
        sa.Column("include_in_net_worth", sa.Boolean(), nullable=True),
    )
    op.add_column(
        "financial_account_balance_snapshots",
        sa.Column("archived", sa.Boolean(), nullable=True),
    )
    op.execute(
        """
        UPDATE financial_account_balance_snapshots AS snapshot
        SET include_in_net_worth = account.include_in_net_worth,
            archived = account.archived
        FROM financial_accounts AS account
        WHERE account.id = snapshot.financial_account_id
        """
    )
    op.alter_column(
        "financial_account_balance_snapshots",
        "include_in_net_worth",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.true(),
    )
    op.alter_column(
        "financial_account_balance_snapshots",
        "archived",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    )
    op.execute(SNAPSHOT_TRIGGER_SQL)


def downgrade() -> None:
    op.execute(OLD_SNAPSHOT_TRIGGER_SQL)
    op.drop_column("financial_account_balance_snapshots", "archived")
    op.drop_column("financial_account_balance_snapshots", "include_in_net_worth")
