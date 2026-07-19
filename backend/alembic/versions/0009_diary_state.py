"""diary: add energy, mood, body_condition fields

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("diary_entries", sa.Column("energy", sa.SmallInteger(), nullable=True))
    op.add_column("diary_entries", sa.Column("mood", sa.SmallInteger(), nullable=True))
    op.add_column("diary_entries", sa.Column("body_condition", sa.SmallInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column("diary_entries", "body_condition")
    op.drop_column("diary_entries", "mood")
    op.drop_column("diary_entries", "energy")
