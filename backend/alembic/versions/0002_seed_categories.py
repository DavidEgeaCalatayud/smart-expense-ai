"""Seed the initial transaction categories.

Revision ID: 0002_seed_categories
Revises: 0001_initial_schema
Create Date: 2026-08-23 21:02:00

"""
from typing import Sequence, Union
from uuid import UUID

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0002_seed_categories"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CATEGORIES = (
    (UUID("9d8e6db2-1304-4af2-8f85-8292792738ac"), "Food", "expense"),
    (UUID("3efea87c-b5f6-4f8a-8e21-5426b0dc6572"), "Subscriptions", "expense"),
    (UUID("37a66a39-f33d-4b38-aec6-d6118b374792"), "Shopping", "expense"),
    (UUID("11d4f4ce-72c9-496f-86b0-24f214bfa3df"), "Transport", "expense"),
    (UUID("0ffb8950-862e-4bb6-9dd4-fdc1f2182fac"), "Health", "expense"),
    (UUID("90937df5-a83d-449e-88d5-e6a65e8a4c2d"), "Salary", "income"),
    (UUID("c32133a7-0b58-4fb6-a50d-fca83dbe431b"), "Other", "expense"),
)

categories_table = sa.table(
    "categories",
    sa.column("id", postgresql.UUID(as_uuid=True)),
    sa.column("name", sa.String(length=80)),
    sa.column("transaction_type", sa.String(length=16)),
)


def upgrade() -> None:
    """Insert the default categories used by the current frontend."""
    op.bulk_insert(
        categories_table,
        [
            {"id": category_id, "name": name, "transaction_type": transaction_type}
            for category_id, name, transaction_type in CATEGORIES
        ],
    )


def downgrade() -> None:
    """Remove the default categories inserted by this migration."""
    category_ids = [category_id for category_id, _, _ in CATEGORIES]
    op.execute(categories_table.delete().where(categories_table.c.id.in_(category_ids)))
