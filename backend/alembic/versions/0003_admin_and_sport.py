"""admin role, mutable app settings, habit catalog, sport module

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("is_admin", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value", sa.String(500), nullable=False),
    )

    op.alter_column("habits", "user_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "habits", sa.Column("is_base", sa.Boolean(), nullable=False, server_default=sa.false())
    )

    op.create_table(
        "exercises",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("muscle_group", sa.String(80), nullable=True),
        sa.Column("photo_url", sa.String(300), nullable=True),
        sa.Column("is_base", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "exercise_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("exercise_id", sa.Integer(), sa.ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False),
        sa.Column("log_date", sa.Date(), nullable=False),
        sa.Column("weight", sa.Numeric(6, 2), nullable=True),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("sets", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("exercise_logs")
    op.drop_table("exercises")
    op.drop_column("habits", "is_base")
    op.alter_column("habits", "user_id", existing_type=sa.Integer(), nullable=False)
    op.drop_table("app_settings")
    op.drop_column("users", "last_login_at")
    op.drop_column("users", "is_admin")
