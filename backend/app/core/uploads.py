import os
import uuid

from fastapi import UploadFile

from app.core.config import settings

EXERCISE_SUBDIR = "exercises"


async def save_exercise_photo(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    target_dir = os.path.join(settings.upload_dir, EXERCISE_SUBDIR)
    os.makedirs(target_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(target_dir, filename)
    with open(path, "wb") as f:
        f.write(await file.read())
    return f"/uploads/{EXERCISE_SUBDIR}/{filename}"


def delete_exercise_photo(photo_url: str | None) -> None:
    if not photo_url or not photo_url.startswith(f"/uploads/{EXERCISE_SUBDIR}/"):
        return
    filename = photo_url.rsplit("/", 1)[-1]
    path = os.path.join(settings.upload_dir, EXERCISE_SUBDIR, filename)
    if os.path.exists(path):
        os.remove(path)
