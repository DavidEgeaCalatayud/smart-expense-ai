"""Replicate financial accounts and balance snapshots through sync-v1.

Revision ID: 0016_financial_accounts_sync
Revises: 0015_financial_accounts
"""
from alembic import op
import sqlalchemy as sa


revision = "0016_financial_accounts_sync"
down_revision = "0015_financial_accounts"
branch_labels = None
depends_on = None


FINANCIAL_ACCOUNT_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_financial_account_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_scope_user_id uuid;
    v_entity_id uuid;
    v_version bigint;
    v_payload jsonb;
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.sync_version := COALESCE(NEW.sync_version, 1);
        v_scope_user_id := NEW.user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'name', NEW.name,
            'institution', NEW.institution,
            'accountType', NEW.account_type,
            'purpose', NEW.purpose,
            'currentBalance', to_char(NEW.current_balance, 'FM9999999990.00'),
            'currency', NEW.currency,
            'includeInNetWorth', NEW.include_in_net_worth,
            'archived', NEW.archived,
            'balanceUpdatedAt', to_char(NEW.balance_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'balanceSnapshotId', NULL
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF ROW(
            NEW.name, NEW.institution, NEW.account_type, NEW.purpose,
            NEW.current_balance, NEW.currency, NEW.include_in_net_worth,
            NEW.archived, NEW.balance_updated_at
        ) IS NOT DISTINCT FROM ROW(
            OLD.name, OLD.institution, OLD.account_type, OLD.purpose,
            OLD.current_balance, OLD.currency, OLD.include_in_net_worth,
            OLD.archived, OLD.balance_updated_at
        ) THEN
            NEW.sync_version := OLD.sync_version;
            RETURN NEW;
        END IF;
        NEW.sync_version := OLD.sync_version + 1;
        v_scope_user_id := NEW.user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'name', NEW.name,
            'institution', NEW.institution,
            'accountType', NEW.account_type,
            'purpose', NEW.purpose,
            'currentBalance', to_char(NEW.current_balance, 'FM9999999990.00'),
            'currency', NEW.currency,
            'includeInNetWorth', NEW.include_in_net_worth,
            'archived', NEW.archived,
            'balanceUpdatedAt', to_char(NEW.balance_updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
            'balanceSnapshotId', NULL
        );
    ELSE
        v_scope_user_id := OLD.user_id;
        v_entity_id := OLD.id;
        v_version := OLD.sync_version + 1;
        v_payload := NULL;
    END IF;

    IF TG_OP = 'DELETE'
       AND v_scope_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM users WHERE id = v_scope_user_id)
    THEN
        RETURN OLD;
    END IF;

    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        v_scope_user_id,
        'financial_account',
        v_entity_id,
        CASE WHEN TG_OP = 'DELETE' THEN 'delete' ELSE 'upsert' END,
        v_version,
        v_payload,
        now()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_v1_financial_accounts
BEFORE INSERT OR UPDATE OR DELETE ON financial_accounts
FOR EACH ROW EXECUTE FUNCTION sync_v1_capture_financial_account_change();
"""


FINANCIAL_ACCOUNT_SNAPSHOT_TRIGGER_SQL = r"""
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

CREATE TRIGGER trg_sync_v1_financial_account_snapshots
AFTER INSERT ON financial_account_balance_snapshots
FOR EACH ROW EXECUTE FUNCTION sync_v1_capture_financial_account_snapshot();
"""


NEW_ENTITY_CHECK = (
    "entity_type IN ('transaction', 'category', 'budget', "
    "'financial_account', 'financial_account_snapshot')"
)
OLD_ENTITY_CHECK = "entity_type IN ('transaction', 'category', 'budget')"


def upgrade() -> None:
    op.add_column(
        "financial_accounts",
        sa.Column("sync_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.create_check_constraint(
        "ck_financial_accounts_sync_version_positive",
        "financial_accounts",
        "sync_version > 0",
    )

    op.drop_constraint("ck_sync_mutations_entity_type", "sync_mutations", type_="check")
    op.drop_constraint("ck_sync_changes_entity_type", "sync_changes", type_="check")
    op.alter_column(
        "sync_mutations",
        "entity_type",
        existing_type=sa.String(length=24),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.alter_column(
        "sync_changes",
        "entity_type",
        existing_type=sa.String(length=24),
        type_=sa.String(length=32),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_sync_mutations_entity_type", "sync_mutations", NEW_ENTITY_CHECK
    )
    op.create_check_constraint(
        "ck_sync_changes_entity_type", "sync_changes", NEW_ENTITY_CHECK
    )

    op.execute(FINANCIAL_ACCOUNT_TRIGGER_SQL)
    op.execute(FINANCIAL_ACCOUNT_SNAPSHOT_TRIGGER_SQL)


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_sync_v1_financial_account_snapshots "
        "ON financial_account_balance_snapshots"
    )
    op.execute("DROP FUNCTION IF EXISTS sync_v1_capture_financial_account_snapshot()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_v1_financial_accounts ON financial_accounts")
    op.execute("DROP FUNCTION IF EXISTS sync_v1_capture_financial_account_change()")

    op.execute(
        "DELETE FROM sync_mutations WHERE entity_type IN "
        "('financial_account', 'financial_account_snapshot')"
    )
    op.execute(
        "DELETE FROM sync_changes WHERE entity_type IN "
        "('financial_account', 'financial_account_snapshot')"
    )
    op.drop_constraint("ck_sync_mutations_entity_type", "sync_mutations", type_="check")
    op.drop_constraint("ck_sync_changes_entity_type", "sync_changes", type_="check")
    op.create_check_constraint(
        "ck_sync_mutations_entity_type", "sync_mutations", OLD_ENTITY_CHECK
    )
    op.create_check_constraint(
        "ck_sync_changes_entity_type", "sync_changes", OLD_ENTITY_CHECK
    )
    op.alter_column(
        "sync_mutations",
        "entity_type",
        existing_type=sa.String(length=32),
        type_=sa.String(length=24),
        existing_nullable=False,
    )
    op.alter_column(
        "sync_changes",
        "entity_type",
        existing_type=sa.String(length=32),
        type_=sa.String(length=24),
        existing_nullable=False,
    )

    op.drop_constraint(
        "ck_financial_accounts_sync_version_positive",
        "financial_accounts",
        type_="check",
    )
    op.drop_column("financial_accounts", "sync_version")
