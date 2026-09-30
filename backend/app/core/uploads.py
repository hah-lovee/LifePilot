import hashlib
import io

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.modules.sport.models import Exercise, ExercisePhoto

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
# Photos are shown at 56x56 in a list and full-screen when zoomed. 1024 px on
# the long side covers the zoom and keeps a re-encoded photo around 100 KB,
# which is what makes storing them in the database reasonable in the first place.
MAX_SIDE = 1024
WEBP_QUALITY = 82


def photo_url_for(exercise_id: int, digest: str) -> str:
    """The URL stored in exercises.photo_url and served by GET
    /api/exercises/{id}/photo. The digest in the query string is what lets the
    browser cache a photo forever and still notice when it is replaced."""
    return f"/api/exercises/{exercise_id}/photo?v={digest[:12]}"


def _encode(raw: bytes) -> tuple[bytes, str]:
    """Normalise an upload to WebP, downscaled to MAX_SIDE.

    Animated images are passed through untouched — some exercise "photos" are
    short looping demonstrations, and re-encoding would flatten them to a single
    frame."""
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Не удалось прочитать изображение"
        ) from exc

    if getattr(image, "n_frames", 1) > 1:
        return raw, Image.MIME.get(image.format or "", "application/octet-stream")

    image = ImageOps.exif_transpose(image)
    has_alpha = image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info)
    image = image.convert("RGBA" if has_alpha else "RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))

    buffer = io.BytesIO()
    image.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=6)
    return buffer.getvalue(), "image/webp"


async def store_exercise_photo(db: Session, exercise: Exercise, file: UploadFile) -> None:
    """Replace the exercise photo, writing the bytes into the database and
    pointing exercise.photo_url at the endpoint that serves them.

    The caller commits; exercise.id must already be assigned (flush first when
    the exercise is new)."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недопустимый формат файла")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Файл больше 10 МБ")

    content, content_type = _encode(raw)
    digest = hashlib.sha256(content).hexdigest()

    photo = db.get(ExercisePhoto, exercise.id)
    if photo is None:
        photo = ExercisePhoto(exercise_id=exercise.id)
        db.add(photo)
    photo.content = content
    photo.content_type = content_type
    photo.sha256 = digest

    exercise.photo_url = photo_url_for(exercise.id, digest)


def delete_exercise_photo(db: Session, exercise: Exercise) -> None:
    photo = db.get(ExercisePhoto, exercise.id)
    if photo is not None:
        db.delete(photo)
    exercise.photo_url = None
