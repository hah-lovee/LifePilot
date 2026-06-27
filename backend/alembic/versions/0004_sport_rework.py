"""sport rework: exercises become a shared catalog, logs own a user directly

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exercise_logs", sa.Column("user_id", sa.Integer(), nullable=True))
    op.execute(
        "UPDATE exercise_logs SET user_id = exercises.user_id "
        "FROM exercises WHERE exercise_logs.exercise_id = exercises.id"
    )
    # Logs against already-catalog exercises (no owner to inherit from) are
    # orphaned test data — owner can't be recovered, so drop them.
    op.execute("DELETE FROM exercise_logs WHERE user_id IS NULL")

    op.alter_column("exercise_logs", "user_id", existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        "fk_exercise_logs_user_id", "exercise_logs", "users", ["user_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_exercise_logs_user_id", "exercise_logs", ["user_id"])

    op.drop_column("exercise_logs", "sets")
    op.drop_column("exercise_logs", "note")

    op.drop_column("exercises", "user_id")
    op.drop_column("exercises", "is_base")


def downgrade() -> None:
    op.add_column(
        "exercises", sa.Column("is_base", sa.Boolean(), nullable=False, server_default=sa.false())
    )
    op.add_column("exercises", sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE")))

    op.add_column("exercise_logs", sa.Column("note", sa.Text(), nullable=True))
    op.add_column(
        "exercise_logs", sa.Column("sets", sa.Integer(), nullable=False, server_default="1")
    )

    op.drop_index("ix_exercise_logs_user_id", table_name="exercise_logs")
    op.drop_constraint("fk_exercise_logs_user_id", "exercise_logs", type_="foreignkey")
    op.drop_column("exercise_logs", "user_id")
