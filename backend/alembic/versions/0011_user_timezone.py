"""users: add timezone for reminder scheduling

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("timezone", sa.String(64), nullable=False, server_default="Europe/Moscow"),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
