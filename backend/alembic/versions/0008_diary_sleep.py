"""diary: add sleep_bedtime and sleep_wakeup fields

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-06
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("diary_entries", sa.Column("sleep_bedtime", sa.String(5), nullable=True))
    op.add_column("diary_entries", sa.Column("sleep_wakeup", sa.String(5), nullable=True))


def downgrade() -> None:
    op.drop_column("diary_entries", "sleep_wakeup")
    op.drop_column("diary_entries", "sleep_bedtime")
