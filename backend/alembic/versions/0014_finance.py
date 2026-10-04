"""monthly budget: groups, items, plans, transactions, savings accounts

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-04

Replaces the one-file-per-month spreadsheet. See
app/modules/finance/models.py for why actual amounts are individual rows and
why a plan row is what puts an item in a month.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("counts_as_savings", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_finance_groups_user", "finance_groups", ["user_id", "kind", "sort_order"]
    )

    op.create_table(
        "finance_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "group_id",
            sa.Integer(),
            sa.ForeignKey("finance_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_finance_items_group", "finance_items", ["group_id", "sort_order"])

    op.create_table(
        "finance_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("finance_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("month", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("percent_of_income", sa.Numeric(6, 4), nullable=True),
        sa.UniqueConstraint("item_id", "month", name="uq_finance_plans_item_month"),
    )
    op.create_index("ix_finance_plans_user_month", "finance_plans", ["user_id", "month"])

    op.create_table(
        "finance_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("finance_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("happened_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_finance_transactions_user_date", "finance_transactions", ["user_id", "happened_on"]
    )
    op.create_index(
        "ix_finance_transactions_item_date", "finance_transactions", ["item_id", "happened_on"]
    )

    op.create_table(
        "savings_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("goal_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("goal_date", sa.Date(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "savings_operations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "account_id",
            sa.Integer(),
            sa.ForeignKey("savings_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("happened_on", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_savings_operations_account_date", "savings_operations", ["account_id", "happened_on"]
    )


def downgrade() -> None:
    op.drop_table("savings_operations")
    op.drop_table("savings_accounts")
    op.drop_table("finance_transactions")
    op.drop_table("finance_plans")
    op.drop_table("finance_items")
    op.drop_table("finance_groups")
