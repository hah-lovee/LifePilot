"""investments snapshot v2: add invested_amount_rub, dividends_received_rub

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("investment_snapshots", sa.Column("invested_amount_rub", sa.Numeric(16, 2), nullable=True))
    op.add_column("investment_snapshots", sa.Column("dividends_received_rub", sa.Numeric(16, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("investment_snapshots", "dividends_received_rub")
    op.drop_column("investment_snapshots", "invested_amount_rub")
