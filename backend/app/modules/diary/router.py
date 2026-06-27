from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.modules.diary.models import DiaryEntry, DiaryTag
from app.modules.diary.schemas import DiaryEntryOut, DiaryEntryUpsert, DiaryTagCreate, DiaryTagOut

router = APIRouter(prefix="/api/diary", tags=["diary"])


@router.get("", response_model=list[DiaryEntryOut])
def list_entries(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[DiaryEntry]:
    query = db.query(DiaryEntry).filter(DiaryEntry.user_id == user.id)
    if date_from:
        query = query.filter(DiaryEntry.entry_date >= date_from)
    if date_to:
        query = query.filter(DiaryEntry.entry_date <= date_to)
    return query.order_by(DiaryEntry.entry_date.desc()).all()


# NOTE: tag routes must be declared before the "/{entry_date}" routes below,
# otherwise FastAPI tries to parse "tags" as a date and returns a 422 before
# ever reaching this handler.
@router.get("/tags", response_model=list[DiaryTagOut])
def list_tags(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[DiaryTag]:
    return db.query(DiaryTag).filter(DiaryTag.user_id == user.id).order_by(DiaryTag.name).all()


@router.post("/tags", response_model=DiaryTagOut, status_code=status.HTTP_201_CREATED)
def create_tag(
    payload: DiaryTagCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DiaryTag:
    name = payload.name.strip().lower()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tag name cannot be empty")
    existing = db.query(DiaryTag).filter(DiaryTag.user_id == user.id, DiaryTag.name == name).first()
    if existing:
        return existing
    tag = DiaryTag(user_id=user.id, name=name)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    tag = db.query(DiaryTag).filter(DiaryTag.id == tag_id, DiaryTag.user_id == user.id).first()
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tag not found")
    db.delete(tag)
    db.commit()


@router.get("/{entry_date}", response_model=DiaryEntryOut)
def get_entry(
    entry_date: date, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DiaryEntry:
    entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == entry_date)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    return entry


@router.put("", response_model=DiaryEntryOut)
def upsert_entry(
    payload: DiaryEntryUpsert, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DiaryEntry:
    entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == payload.entry_date)
        .first()
    )
    if entry is None:
        entry = DiaryEntry(user_id=user.id, entry_date=payload.entry_date)
        db.add(entry)
    entry.content = payload.content
    entry.tags = payload.tags

    existing_tag_names = {t.name for t in db.query(DiaryTag).filter(DiaryTag.user_id == user.id)}
    for name in payload.tags:
        if name not in existing_tag_names:
            db.add(DiaryTag(user_id=user.id, name=name))
            existing_tag_names.add(name)

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_date: date, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    entry = (
        db.query(DiaryEntry)
        .filter(DiaryEntry.user_id == user.id, DiaryEntry.entry_date == entry_date)
        .first()
    )
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found")
    db.delete(entry)
    db.commit()
