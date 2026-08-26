"""Add CSV import batches and duplicate fingerprints.

Revision ID: 0008_csv_import_batches
Revises: 0007_user_session_version
Create Date: 2026-08-26 12:45:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008_csv_import_batches"
down_revision: Union[str, Sequence[str], None] = "0007_user_session_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "import_batches",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("rows_total", sa.Integer(), nullable=False),
        sa.Column("rows_imported", sa.Integer(), nullable=False),
        sa.Column("duplicates_skipped", sa.Integer(), nullable=False),
        sa.Column("invalid_rows", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("rows_total >= 0", name="ck_import_batches_rows_total"),
        sa.CheckConstraint("rows_imported >= 0", name="ck_import_batches_rows_imported"),
        sa.CheckConstraint(
            "duplicates_skipped >= 0",
            name="ck_import_batches_duplicates_skipped",
        ),
        sa.CheckConstraint("invalid_rows >= 0", name="ck_import_batches_invalid_rows"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_import_batches_user_id",
        "import_batches",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_import_batches_file_hash",
        "import_batches",
        ["file_hash"],
        unique=False,
    )

    op.add_column(
        "transactions",
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "transactions",
        sa.Column("import_fingerprint", sa.String(length=64), nullable=True),
    )
    op.create_foreign_key(
        "fk_transactions_import_batch_id",
        "transactions",
        "import_batches",
        ["import_batch_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_transactions_import_batch_id",
        "transactions",
        ["import_batch_id"],
        unique=False,
    )
    op.create_index(
        "uq_transactions_user_import_fingerprint",
        "transactions",
        ["user_id", "import_fingerprint"],
        unique=True,
        postgresql_where=sa.text("import_fingerprint IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_transactions_user_import_fingerprint", table_name="transactions")
    op.drop_index("ix_transactions_import_batch_id", table_name="transactions")
    op.drop_constraint(
        "fk_transactions_import_batch_id",
        "transactions",
        type_="foreignkey",
    )
    op.drop_column("transactions", "import_fingerprint")
    op.drop_column("transactions", "import_batch_id")
    op.drop_index("ix_import_batches_file_hash", table_name="import_batches")
    op.drop_index("ix_import_batches_user_id", table_name="import_batches")
    op.drop_table("import_batches")
