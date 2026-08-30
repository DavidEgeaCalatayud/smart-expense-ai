"""Add the server-authoritative sync-v1 journal.

Revision ID: 0011_mobile_sync_v1
Revises: 0010_category_suggestions
Create Date: 2026-08-30 14:35:00

The journal is populated by PostgreSQL row triggers so every authoritative write path
(CRUD, CSV imports, feedback updates and bulk category reassignment) participates in
mobile synchronization without relying on callers to remember an application hook.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0011_mobile_sync_v1"
down_revision: Union[str, Sequence[str], None] = "0010_category_suggestions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TRANSACTION_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_transaction_change()
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
            'merchant', NEW.merchant,
            'description', NEW.description,
            'categoryId', NEW.category_id::text,
            'amount', to_char(NEW.amount, 'FM9999999990.00'),
            'currency', NEW.currency,
            'transactionDate', to_char(NEW.transaction_date, 'YYYY-MM-DD'),
            'transactionType', NEW.transaction_type,
            'paymentMethod', NEW.payment_method,
            'isRecurring', NEW.is_recurring,
            'source', NEW.source
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF ROW(
            NEW.category_id, NEW.merchant, NEW.description, NEW.amount, NEW.currency,
            NEW.transaction_date, NEW.transaction_type, NEW.payment_method,
            NEW.is_recurring, NEW.source
        ) IS NOT DISTINCT FROM ROW(
            OLD.category_id, OLD.merchant, OLD.description, OLD.amount, OLD.currency,
            OLD.transaction_date, OLD.transaction_type, OLD.payment_method,
            OLD.is_recurring, OLD.source
        ) THEN
            NEW.sync_version := OLD.sync_version;
            RETURN NEW;
        END IF;
        NEW.sync_version := OLD.sync_version + 1;
        v_scope_user_id := NEW.user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'merchant', NEW.merchant,
            'description', NEW.description,
            'categoryId', NEW.category_id::text,
            'amount', to_char(NEW.amount, 'FM9999999990.00'),
            'currency', NEW.currency,
            'transactionDate', to_char(NEW.transaction_date, 'YYYY-MM-DD'),
            'transactionType', NEW.transaction_type,
            'paymentMethod', NEW.payment_method,
            'isRecurring', NEW.is_recurring,
            'source', NEW.source
        );
    ELSE
        v_scope_user_id := OLD.user_id;
        v_entity_id := OLD.id;
        v_version := OLD.sync_version + 1;
        v_payload := NULL;
    END IF;

    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        v_scope_user_id,
        'transaction',
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

CREATE TRIGGER trg_sync_v1_transactions
BEFORE INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_v1_capture_transaction_change();
"""


CATEGORY_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_category_change()
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
        v_scope_user_id := NEW.owner_user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'name', NEW.name,
            'transactionType', NEW.transaction_type,
            'systemCategory', NEW.system_category,
            'archived', NEW.archived
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.name, NEW.transaction_type, NEW.system_category, NEW.archived, NEW.owner_user_id)
           IS NOT DISTINCT FROM
           ROW(OLD.name, OLD.transaction_type, OLD.system_category, OLD.archived, OLD.owner_user_id)
        THEN
            NEW.sync_version := OLD.sync_version;
            RETURN NEW;
        END IF;
        NEW.sync_version := OLD.sync_version + 1;
        v_scope_user_id := NEW.owner_user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'name', NEW.name,
            'transactionType', NEW.transaction_type,
            'systemCategory', NEW.system_category,
            'archived', NEW.archived
        );
    ELSE
        v_scope_user_id := OLD.owner_user_id;
        v_entity_id := OLD.id;
        v_version := OLD.sync_version + 1;
        v_payload := NULL;
    END IF;

    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        v_scope_user_id,
        'category',
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

CREATE TRIGGER trg_sync_v1_categories
BEFORE INSERT OR UPDATE OR DELETE ON categories
FOR EACH ROW EXECUTE FUNCTION sync_v1_capture_category_change();
"""


BUDGET_TRIGGER_SQL = r"""
CREATE OR REPLACE FUNCTION sync_v1_capture_budget_change()
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
            'categoryId', CASE WHEN NEW.category_id IS NULL THEN NULL ELSE NEW.category_id::text END,
            'month', to_char(NEW.month, 'YYYY-MM-DD'),
            'limitAmount', to_char(NEW.limit_amount, 'FM9999999990.00')
        );
    ELSIF TG_OP = 'UPDATE' THEN
        IF ROW(NEW.category_id, NEW.month, NEW.limit_amount)
           IS NOT DISTINCT FROM ROW(OLD.category_id, OLD.month, OLD.limit_amount)
        THEN
            NEW.sync_version := OLD.sync_version;
            RETURN NEW;
        END IF;
        NEW.sync_version := OLD.sync_version + 1;
        v_scope_user_id := NEW.user_id;
        v_entity_id := NEW.id;
        v_version := NEW.sync_version;
        v_payload := jsonb_build_object(
            'categoryId', CASE WHEN NEW.category_id IS NULL THEN NULL ELSE NEW.category_id::text END,
            'month', to_char(NEW.month, 'YYYY-MM-DD'),
            'limitAmount', to_char(NEW.limit_amount, 'FM9999999990.00')
        );
    ELSE
        v_scope_user_id := OLD.user_id;
        v_entity_id := OLD.id;
        v_version := OLD.sync_version + 1;
        v_payload := NULL;
    END IF;

    INSERT INTO sync_changes (
        scope_user_id, entity_type, entity_id, operation,
        entity_version, payload_json, changed_at
    ) VALUES (
        v_scope_user_id,
        'budget',
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

CREATE TRIGGER trg_sync_v1_budgets
BEFORE INSERT OR UPDATE OR DELETE ON budgets
FOR EACH ROW EXECUTE FUNCTION sync_v1_capture_budget_change();
"""


def upgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column("sync_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.add_column(
        "categories",
        sa.Column("sync_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.add_column(
        "budgets",
        sa.Column("sync_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    )
    op.create_check_constraint(
        "ck_transactions_sync_version_positive", "transactions", "sync_version > 0"
    )
    op.create_check_constraint(
        "ck_categories_sync_version_positive", "categories", "sync_version > 0"
    )
    op.create_check_constraint(
        "ck_budgets_sync_version_positive", "budgets", "sync_version > 0"
    )

    op.create_table(
        "sync_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "device_id", name="uq_sync_devices_user_device"),
    )
    op.create_index("ix_sync_devices_user_id", "sync_devices", ["user_id"], unique=False)

    op.create_table(
        "sync_mutations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mutation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=24), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("result_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "entity_type IN ('transaction', 'category', 'budget')",
            name="ck_sync_mutations_entity_type",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "device_id", "mutation_id", name="uq_sync_mutations_user_device_mutation"
        ),
    )
    op.create_index(
        "ix_sync_mutations_user_created",
        "sync_mutations",
        ["user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "sync_changes",
        sa.Column("sequence", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("scope_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(length=24), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("operation", sa.String(length=16), nullable=False),
        sa.Column("entity_version", sa.BigInteger(), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "entity_type IN ('transaction', 'category', 'budget')",
            name="ck_sync_changes_entity_type",
        ),
        sa.CheckConstraint(
            "operation IN ('upsert', 'delete')",
            name="ck_sync_changes_operation",
        ),
        sa.CheckConstraint("entity_version > 0", name="ck_sync_changes_version_positive"),
        sa.CheckConstraint(
            "(operation = 'upsert' AND payload_json IS NOT NULL) OR "
            "(operation = 'delete' AND payload_json IS NULL)",
            name="ck_sync_changes_payload_operation",
        ),
        sa.ForeignKeyConstraint(["scope_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("sequence"),
    )
    op.create_index(
        "ix_sync_changes_scope_sequence",
        "sync_changes",
        ["scope_user_id", "sequence"],
        unique=False,
    )
    op.create_index(
        "ix_sync_changes_scope_entity_sequence",
        "sync_changes",
        ["scope_user_id", "entity_type", "entity_id", "sequence"],
        unique=False,
    )

    op.execute(TRANSACTION_TRIGGER_SQL)
    op.execute(CATEGORY_TRIGGER_SQL)
    op.execute(BUDGET_TRIGGER_SQL)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_sync_v1_budgets ON budgets")
    op.execute("DROP FUNCTION IF EXISTS sync_v1_capture_budget_change()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_v1_categories ON categories")
    op.execute("DROP FUNCTION IF EXISTS sync_v1_capture_category_change()")
    op.execute("DROP TRIGGER IF EXISTS trg_sync_v1_transactions ON transactions")
    op.execute("DROP FUNCTION IF EXISTS sync_v1_capture_transaction_change()")

    op.drop_index("ix_sync_changes_scope_entity_sequence", table_name="sync_changes")
    op.drop_index("ix_sync_changes_scope_sequence", table_name="sync_changes")
    op.drop_table("sync_changes")
    op.drop_index("ix_sync_mutations_user_created", table_name="sync_mutations")
    op.drop_table("sync_mutations")
    op.drop_index("ix_sync_devices_user_id", table_name="sync_devices")
    op.drop_table("sync_devices")

    op.drop_constraint("ck_budgets_sync_version_positive", "budgets", type_="check")
    op.drop_constraint("ck_categories_sync_version_positive", "categories", type_="check")
    op.drop_constraint("ck_transactions_sync_version_positive", "transactions", type_="check")
    op.drop_column("budgets", "sync_version")
    op.drop_column("categories", "sync_version")
    op.drop_column("transactions", "sync_version")
