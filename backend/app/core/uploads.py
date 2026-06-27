import os
import uuid

from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

EXERCISE_SUBDIR = "exercises"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_PHOTO_BYTES = 3 * 1024 * 1024


async def save_exercise_photo(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename or "")[1].lower() or ".jpg"
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недопустимый формат файла")

    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл больше 3 МБ")

    target_dir = os.path.join(settings.upload_dir, EXERCISE_SUBDIR)
    os.makedirs(target_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(target_dir, filename)
    with open(path, "wb") as f:
        f.write(content)
    return f"/uploads/{EXERCISE_SUBDIR}/{filename}"


def delete_exercise_photo(photo_url: str | None) -> None:
    if not photo_url or not photo_url.startswith(f"/uploads/{EXERCISE_SUBDIR}/"):
        return
    filename = photo_url.rsplit("/", 1)[-1]
    path = os.path.join(settings.upload_dir, EXERCISE_SUBDIR, filename)
    if os.path.exists(path):
        os.remove(path)
