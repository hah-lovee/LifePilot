"""mark imported transactions with a column instead of their note

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-04

Re-importing a month has to replace whatever a previous import put there. That
was keyed on the filename, which breaks the moment the same month arrives under
a different name — `09_2026.xlsx` and `09.2026.xlsx` are the same September, and
importing both doubled it. The month plus this column is the right key: it does
not depend on what the file was called, and it never matches a row typed by
hand.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("finance_transactions", sa.Column("source", sa.String(16), nullable=True))
    # Rows an earlier build of the importer created are recognisable by the note
    # it wrote; claim them so the first re-import after this replaces them.
    op.execute(
        "UPDATE finance_transactions SET source = 'xlsx' WHERE note LIKE 'импорт из %'"
    )


def downgrade() -> None:
    op.drop_column("finance_transactions", "source")
