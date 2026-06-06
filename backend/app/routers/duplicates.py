"""Perceptual-hash duplicate detection endpoints."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Media

router = APIRouter(prefix="/api/duplicates", tags=["duplicates"])


@router.get("/stats")
def dup_stats(db: Session = Depends(get_db)) -> dict:
    total = db.scalar(select(func.count(Media.id))) or 0
    hashed = db.scalar(select(func.count(Media.id)).where(Media.phash.is_not(None))) or 0
    rows = db.execute(
        select(Media.phash, func.count(Media.id).label("cnt"))
        .where(Media.phash.is_not(None))
        .group_by(Media.phash)
        .having(func.count(Media.id) > 1)
    ).all()
    groups = len(rows)
    dup_items = sum(r.cnt for r in rows)
    return {"total": total, "hashed": hashed, "groups": groups, "dup_items": dup_items}


@router.get("")
def list_duplicates(
    page: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list:
    dup_phashes = db.scalars(
        select(Media.phash)
        .where(Media.phash.is_not(None))
        .group_by(Media.phash)
        .having(func.count(Media.id) > 1)
        .order_by(func.count(Media.id).desc(), Media.phash)
        .offset(page * limit)
        .limit(limit)
    ).all()

    result = []
    for phash in dup_phashes:
        items = db.scalars(
            select(Media).where(Media.phash == phash).order_by(Media.taken_at)
        ).all()
        result.append([
            {
                "id": m.id,
                "filename": m.filename,
                "path": m.path,
                "taken_at": m.taken_at.isoformat() if m.taken_at else None,
                "size_bytes": m.size_bytes,
                "thumb_name": m.thumb_name,
                "media_type": m.media_type,
            }
            for m in items
        ])
    return result
