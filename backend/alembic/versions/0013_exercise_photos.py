"""exercise photos in the database instead of an uploads volume

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-30

A named Docker volume does not travel with `pg_dump` or with `docker save`,
which is how the catalog once reached the VM with every photo missing. The
bytes move into the database, where a single dump carries the whole catalog.

The upgrade imports whatever is still on the uploads volume. Rows whose file is
gone lose photo_url — the UI then shows "без фото" instead of a broken image,
and the photo can be re-uploaded from the admin catalog.

"""
import hashlib
import mimetypes
import os
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Rules of thumb, not measurements: large groups get 72 hours between sessions,
# small ones 48, and abs/calves — trained lightly and often — 24. Groups that
# are not in this list keep the column default of 48, and every value is
# editable from the admin catalog afterwards.
RECOVERY_HOURS = {
    "спина": 72,
    "грудь": 72,
    "ноги": 72,
    "плечи": 48,
    "бицепс": 48,
    "трицепс": 48,
    "руки": 48,
    "предплечья": 24,
    "пресс": 24,
    "икры": 24,
}


def upgrade() -> None:
    op.add_column(
        "muscle_groups",
        sa.Column("recovery_hours", sa.Integer(), nullable=False, server_default="48"),
    )
    for name, hours in RECOVERY_HOURS.items():
        op.execute(
            sa.text("UPDATE muscle_groups SET recovery_hours = :h WHERE lower(name) = :n").bindparams(
                h=hours, n=name
            )
        )

    op.create_table(
        "exercise_photos",
        sa.Column(
            "exercise_id",
            sa.Integer(),
            sa.ForeignKey("exercises.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("content_type", sa.String(60), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    _import_files_from_volume()


def _import_files_from_volume() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, photo_url FROM exercises WHERE photo_url IS NOT NULL")
    ).fetchall()
    if not rows:
        return

    upload_dir = os.environ.get("UPLOAD_DIR", "./uploads")
    imported = 0
    for exercise_id, photo_url in rows:
        content = _read_file(upload_dir, photo_url)
        if content is None:
            conn.execute(
                sa.text("UPDATE exercises SET photo_url = NULL WHERE id = :id").bindparams(
                    id=exercise_id
                )
            )
            continue
        digest = hashlib.sha256(content).hexdigest()
        content_type = mimetypes.guess_type(photo_url)[0] or "application/octet-stream"
        conn.execute(
            sa.text(
                "INSERT INTO exercise_photos (exercise_id, content_type, content, sha256) "
                "VALUES (:id, :ct, :content, :sha)"
            ).bindparams(id=exercise_id, ct=content_type, content=content, sha=digest)
        )
        conn.execute(
            sa.text("UPDATE exercises SET photo_url = :url WHERE id = :id").bindparams(
                url=f"/api/exercises/{exercise_id}/photo?v={digest[:12]}", id=exercise_id
            )
        )
        imported += 1
    print(f"[0013] imported {imported} exercise photo(s) of {len(rows)} from {upload_dir}")


def _read_file(upload_dir: str, photo_url: str) -> bytes | None:
    """Only ever reads back a file this app wrote: /uploads/exercises/<name>."""
    prefix = "/uploads/exercises/"
    if not photo_url.startswith(prefix):
        return None
    filename = os.path.basename(photo_url[len(prefix) :])
    path = os.path.join(upload_dir, "exercises", filename)
    try:
        with open(path, "rb") as handle:
            return handle.read()
    except OSError:
        return None


def downgrade() -> None:
    op.drop_table("exercise_photos")
    op.drop_column("muscle_groups", "recovery_hours")
