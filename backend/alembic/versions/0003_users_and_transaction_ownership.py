"""Add users and transaction ownership.

Revision ID: 0003_user_ownership
Revises: 0002_seed_categories
Create Date: 2026-08-24 10:35:00

"""
from typing import Sequence, Union
from uuid import UUID

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0003_user_ownership"
down_revision: Union[str, Sequence[str], None] = "0002_seed_categories"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEGACY_USER_ID = UUID("00000000-0000-4000-8000-000000000001")

users_table = sa.table(
    "users",
    sa.column("id", postgresql.UUID(as_uuid=True)),
    sa.column("email", sa.String(length=320)),
    sa.column("display_name", sa.String(length=120)),
    sa.column("password_hash", sa.String(length=255)),
    sa.column("is_active", sa.Boolean()),
)

transactions_table = sa.table(
    "transactions",
    sa.column("user_id", postgresql.UUID(as_uuid=True)),
)


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.bulk_insert(
        users_table,
        [
            {
                "id": LEGACY_USER_ID,
                "email": "legacy-migration@local.invalid",
                "display_name": "Legacy migration data",
                "password_hash": "!",
                "is_active": False,
            }
        ],
    )

    op.add_column(
        "transactions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(transactions_table.update().values(user_id=LEGACY_USER_ID))
    op.alter_column("transactions", "user_id", nullable=False)
    op.create_foreign_key(
        "fk_transactions_user_id_users",
        "transactions",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_transactions_user_id", table_name="transactions")
    op.drop_constraint("fk_transactions_user_id_users", "transactions", type_="foreignkey")
    op.drop_column("transactions", "user_id")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
