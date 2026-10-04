"""bank statement import: mapping rules and a duplicate guard

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-04

A statement knows the real date and the bank's own category; it does not know
which статья of this budget a purchase belongs to. finance_import_rules holds
that answer once per (bank, category, direction) so later imports need no
decisions.

Direction is part of the key because a category means different things either
way: "Переводы" is both money sent to a person and money moved in from another
account of your own.

external_id is the fingerprint of a statement row, so re-importing an
overlapping period adds nothing twice — which is what lets the mapping flow be
"set the rules, upload the same file again". It goes on savings_operations as
well: interest credited to a savings account comes from the same statement and
would otherwise be counted again on every upload.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "finance_transactions", sa.Column("external_id", sa.String(64), nullable=True)
    )
    op.create_index(
        "uq_finance_transactions_external",
        "finance_transactions",
        ["user_id", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.add_column(
        "savings_operations", sa.Column("external_id", sa.String(64), nullable=True)
    )
    op.create_index(
        "uq_savings_operations_external",
        "savings_operations",
        ["user_id", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.create_table(
        "finance_import_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("bank", sa.String(16), nullable=False),
        sa.Column("category", sa.String(120), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("finance_items.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "savings_account_id",
            sa.Integer(),
            sa.ForeignKey("savings_accounts.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("ignored", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "user_id", "bank", "category", "direction", name="uq_finance_import_rules_key"
        ),
    )


def downgrade() -> None:
    op.drop_table("finance_import_rules")
    op.drop_index("uq_savings_operations_external", table_name="savings_operations")
    op.drop_column("savings_operations", "external_id")
    op.drop_index("uq_finance_transactions_external", table_name="finance_transactions")
    op.drop_column("finance_transactions", "external_id")
