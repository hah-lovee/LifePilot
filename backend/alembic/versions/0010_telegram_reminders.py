"""users: telegram link fields; habits: reminder schedule fields

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("telegram_chat_id", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("telegram_link_code", sa.String(16), nullable=True))

    op.add_column("habits", sa.Column("reminder_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("habits", sa.Column("reminder_time", sa.String(5), nullable=True))
    op.add_column(
        "habits",
        sa.Column("reminder_weekdays", sa.ARRAY(sa.Integer()), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("habits", "reminder_weekdays")
    op.drop_column("habits", "reminder_time")
    op.drop_column("habits", "reminder_enabled")

    op.drop_column("users", "telegram_link_code")
    op.drop_column("users", "telegram_chat_id")
