import calendar as cal_mod
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import JournalEntry, JournalMedia, Media

router = APIRouter(prefix="/api/journal", tags=["journal"])


class JournalPut(BaseModel):
    title: str | None = None
    body: str | None = None


@router.get("/stats")
def journal_stats(db: Session = Depends(get_db)) -> dict:
    total = db.scalar(select(func.count(JournalEntry.id))) or 0
    return {"total_entries": total}


@router.get("/years")
def journal_years(db: Session = Depends(get_db)) -> dict:
    min_taken = db.scalar(select(func.min(Media.taken_at)))
    min_year = min_taken.year if min_taken else datetime.now().year
    max_year = datetime.now().year
    return {"min_year": min_year, "max_year": max_year}


@router.get("/entry-years")
def journal_entry_years(db: Session = Depends(get_db)) -> list[int]:
    dates = db.scalars(select(JournalEntry.date)).all()
    return sorted({int(d[:4]) for d in dates}, reverse=True)


@router.get("/{year}/entry-months")
def journal_entry_months(year: int, db: Session = Depends(get_db)) -> list[int]:
    dates = db.scalars(
        select(JournalEntry.date).where(JournalEntry.date.like(f"{year:04d}-%"))
    ).all()
    return sorted({int(d[5:7]) for d in dates})


@router.get("/{year}/{month}/days")
def journal_days(year: int, month: int, db: Session = Depends(get_db)) -> list[dict]:
    _, num_days = cal_mod.monthrange(year, month)
    prefix = f"{year:04d}-{month:02d}"

    # Media count per day in this month
    rows = db.execute(
        select(
            func.strftime("%d", Media.taken_at).label("day"),
            func.count(Media.id).label("cnt"),
        )
        .where(func.strftime("%Y-%m", Media.taken_at) == prefix)
        .group_by("day")
    ).all()
    media_by_day: dict[str, int] = {r.day: r.cnt for r in rows}

    # Which days already have journal entries
    entry_dates: set[str] = set(
        db.scalars(
            select(JournalEntry.date).where(JournalEntry.date.like(f"{prefix}-%"))
        ).all()
    )

    return [
        {
            "day": d,
            "date": f"{prefix}-{d:02d}",
            "media_count": media_by_day.get(f"{d:02d}", 0),
            "has_entry": f"{prefix}-{d:02d}" in entry_dates,
        }
        for d in range(1, num_days + 1)
    ]


@router.get("/{date}/check/{media_id}")
def check_journal_media(date: str, media_id: int, db: Session = Depends(get_db)) -> dict:
    exists = db.scalars(
        select(JournalMedia).where(JournalMedia.date == date, JournalMedia.media_id == media_id)
    ).first() is not None
    return {"in_journal": exists}


@router.get("/{date}")
def get_journal(date: str, db: Session = Depends(get_db)) -> dict:
    entry = db.scalars(select(JournalEntry).where(JournalEntry.date == date)).first()
    media_ids = db.scalars(
        select(JournalMedia.media_id)
        .where(JournalMedia.date == date)
        .order_by(JournalMedia.display_order, JournalMedia.id)
    ).all()

    media = []
    for mid in media_ids:
        m = db.get(Media, mid)
        if m:
            media.append({
                "id": m.id,
                "filename": m.filename,
                "thumb_name": m.thumb_name,
                "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            })

    return {
        "date": date,
        "title": entry.title if entry else None,
        "body": entry.body if entry else None,
        "media": media,
    }


@router.put("/{date}")
def update_journal(date: str, payload: JournalPut, db: Session = Depends(get_db)) -> dict:
    entry = db.scalars(select(JournalEntry).where(JournalEntry.date == date)).first()
    if entry is None:
        entry = JournalEntry(date=date)
        db.add(entry)
    if payload.title is not None:
        entry.title = payload.title or None
    if payload.body is not None:
        entry.body = payload.body or None
    db.commit()
    db.refresh(entry)
    return {"date": entry.date, "title": entry.title, "body": entry.body}


@router.delete("/{date}")
def delete_journal(date: str, db: Session = Depends(get_db)) -> dict:
    db.execute(delete(JournalMedia).where(JournalMedia.date == date))
    entry = db.scalars(select(JournalEntry).where(JournalEntry.date == date)).first()
    if entry:
        db.delete(entry)
    db.commit()
    return {"deleted": True}


@router.post("/{date}/media/{media_id}")
def toggle_journal_media(date: str, media_id: int, db: Session = Depends(get_db)) -> dict:
    """Toggle a media item in/out of the journal for a given date."""
    if db.get(Media, media_id) is None:
        raise HTTPException(status_code=404, detail="Media not found")

    existing = db.scalars(
        select(JournalMedia).where(JournalMedia.date == date, JournalMedia.media_id == media_id)
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"in_journal": False, "date": date}

    # Ensure a journal entry row exists
    if not db.scalars(select(JournalEntry).where(JournalEntry.date == date)).first():
        db.add(JournalEntry(date=date))

    max_order = db.scalar(
        select(func.max(JournalMedia.display_order)).where(JournalMedia.date == date)
    ) or 0
    db.add(JournalMedia(date=date, media_id=media_id, display_order=max_order + 1))
    db.commit()
    return {"in_journal": True, "date": date}
