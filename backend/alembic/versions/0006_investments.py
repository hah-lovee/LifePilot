"""investment snapshots for net-worth-over-time chart

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investment_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("total_value_rub", sa.Numeric(16, 2), nullable=False),
        sa.Column("crypto_value_rub", sa.Numeric(16, 2), nullable=False),
        sa.Column("broker_value_rub", sa.Numeric(16, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "snapshot_date", name="uq_investment_snapshot_date"),
    )
    op.create_index("ix_investment_snapshots_user_id", "investment_snapshots", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_investment_snapshots_user_id", table_name="investment_snapshots")
    op.drop_table("investment_snapshots")
