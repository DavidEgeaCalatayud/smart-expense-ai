"""Add subscription-ready account entitlement state.

Revision ID: 0013_premium_entitlements_v1
Revises: 0012_mobile_auth_v1
Create Date: 2026-09-02 16:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_premium_entitlements_v1"
down_revision: Union[str, Sequence[str], None] = "0012_mobile_auth_v1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "plan_tier",
            sa.String(length=32),
            server_default="free",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_status",
            sa.String(length=32),
            server_default="none",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "subscription_current_period_end",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_users_plan_tier",
        "users",
        "plan_tier IN ('free', 'premium')",
    )
    op.create_check_constraint(
        "ck_users_subscription_status",
        "users",
        "subscription_status IN ('none', 'trialing', 'active', 'past_due', 'canceled')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_users_subscription_status",
        "users",
        type_="check",
    )
    op.drop_constraint(
        "ck_users_plan_tier",
        "users",
        type_="check",
    )
    op.drop_column("users", "subscription_current_period_end")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "plan_tier")
