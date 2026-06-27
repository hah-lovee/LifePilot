"""predefined muscle groups, managed by admins, replacing free-text field

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "muscle_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
    )
    op.create_unique_constraint("uq_muscle_groups_name", "muscle_groups", ["name"])

    op.add_column("exercises", sa.Column("muscle_group_id", sa.Integer(), nullable=True))

    op.execute(
        "INSERT INTO muscle_groups (name) SELECT DISTINCT muscle_group FROM exercises WHERE muscle_group IS NOT NULL"
    )
    op.execute(
        "UPDATE exercises SET muscle_group_id = muscle_groups.id "
        "FROM muscle_groups WHERE exercises.muscle_group = muscle_groups.name"
    )

    op.create_foreign_key(
        "fk_exercises_muscle_group_id",
        "exercises",
        "muscle_groups",
        ["muscle_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_column("exercises", "muscle_group")


def downgrade() -> None:
    op.add_column("exercises", sa.Column("muscle_group", sa.String(80), nullable=True))
    op.execute(
        "UPDATE exercises SET muscle_group = muscle_groups.name "
        "FROM muscle_groups WHERE exercises.muscle_group_id = muscle_groups.id"
    )
    op.drop_constraint("fk_exercises_muscle_group_id", "exercises", type_="foreignkey")
    op.drop_column("exercises", "muscle_group_id")
    op.drop_constraint("uq_muscle_groups_name", "muscle_groups", type_="unique")
    op.drop_table("muscle_groups")
