import json
import mimetypes
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import and_, case, delete, func, or_, select, text, update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..geo import reverse_geocode
from ..models import Media
from ..schemas import (
    GeocodeResult, GeoSearchResult, HistogramBucket, LocateRequest, LocationSuggestion,
    MediaOut, MediaPatch, PlaceOut, RemoveLocationRequest, RelocateRequest, Stats, TagCount,
    UnlocatedGroup, UnlocatedItem,
)
from .. import settings_store

router = APIRouter(prefix="/api", tags=["media"])
settings = get_settings()

MAX_RESULTS = 50_000


def _is_allowed_path(path: Path) -> bool:
    """Guard file serving: only return files under a configured root."""
    try:
        resolved = path.resolve()
    except OSError:
        return False
    # Only serve files under a configured scan root (never the whole browse
    # root, which may be "/").
    roots = [settings.media_dir, *settings_store.scan_roots()]
    for root in roots:
        try:
            resolved.relative_to(root.resolve())
            return True
        except ValueError:
            continue
    return False


@router.get("/media", response_model=list[MediaOut])
def list_media(
    db: Session = Depends(get_db),
    geotagged: bool = Query(True, description="Only return items that have coordinates."),
    start: datetime | None = Query(None, description="Earliest taken_at (inclusive)."),
    end: datetime | None = Query(None, description="Latest taken_at (inclusive)."),
    min_lat: float | None = None,
    min_lon: float | None = None,
    max_lat: float | None = None,
    max_lon: float | None = None,
) -> list[Media]:
    stmt = select(Media)
    if geotagged:
        stmt = stmt.where(Media.lat.is_not(None), Media.lon.is_not(None))
    if start is not None:
        stmt = stmt.where(Media.taken_at >= start)
    if end is not None:
        stmt = stmt.where(Media.taken_at <= end)
    if None not in (min_lat, min_lon, max_lat, max_lon):
        stmt = stmt.where(
            Media.lat >= min_lat, Media.lat <= max_lat,
            Media.lon >= min_lon, Media.lon <= max_lon,
        )
    stmt = stmt.order_by(Media.taken_at).limit(MAX_RESULTS)
    return list(db.scalars(stmt).all())


@router.patch("/media/{media_id}", response_model=MediaOut)
def patch_media(media_id: int, patch: MediaPatch, db: Session = Depends(get_db)) -> Media:
    row = db.get(Media, media_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    if patch.comment is not None:
        row.comment = patch.comment if patch.comment != "" else None
    if patch.tags is not None:
        row.tags = json.dumps(patch.tags) if patch.tags else None
    if patch.is_favourite is not None:
        row.is_favourite = int(patch.is_favourite)
    if patch.taken_at is not None:
        row.taken_at = patch.taken_at
    if patch.clear_location:
        row.lat = None
        row.lon = None
        row.place = None
        row.region = None
        row.country = None
        row.country_code = None
        row.location_manual = False
    elif patch.lat is not None and patch.lon is not None:
        row.lat = patch.lat
        row.lon = patch.lon
        row.location_manual = True
        try:
            geo_results = reverse_geocode([(patch.lat, patch.lon)])
            geo = geo_results[0] if geo_results else {}
            row.place = geo.get("place")
            row.region = geo.get("region")
            row.country = geo.get("country")
            row.country_code = geo.get("country_code")
        except Exception:
            pass
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/media/{media_id}", response_model=MediaOut)
def get_media(media_id: int, db: Session = Depends(get_db)) -> Media:
    row = db.get(Media, media_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.get("/media/{media_id}/thumbnail")
def get_thumbnail(media_id: int, db: Session = Depends(get_db)) -> FileResponse:
    row = db.get(Media, media_id)
    if row is None or not row.thumb_name:
        raise HTTPException(status_code=404, detail="No thumbnail")
    path = settings.thumb_dir / row.thumb_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Thumbnail missing")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/media/{media_id}/file")
def get_file(media_id: int, db: Session = Depends(get_db)) -> FileResponse:
    row = db.get(Media, media_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    path = Path(row.path)
    if not _is_allowed_path(path) or not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    # Serve the H.264 transcode for HEVC videos (broad browser compatibility).
    if row.transcode_path:
        tc = settings.data_dir / "transcoded" / row.transcode_path
        if tc.exists():
            return FileResponse(str(tc), media_type="video/mp4",
                                filename=Path(row.path).stem + "_h264.mp4")
    mime = row.mime or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
    return FileResponse(path, media_type=mime)


@router.delete("/media/{media_id}")
def delete_media(media_id: int, db: Session = Depends(get_db)) -> dict:
    """Permanently delete a media file from disk and remove its index entry."""
    from ..models import Face
    row = db.get(Media, media_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    # Delete original file
    try:
        Path(row.path).unlink(missing_ok=True)
    except OSError:
        pass
    # Delete thumbnail
    if row.thumb_name:
        (settings.thumb_dir / row.thumb_name).unlink(missing_ok=True)
    # Delete transcode
    if row.transcode_path:
        (settings.data_dir / "transcoded" / row.transcode_path).unlink(missing_ok=True)
    # Remove face crops for this item
    face_thumbs = db.scalars(select(Face.thumb_name).where(Face.media_id == media_id)).all()
    for ft in face_thumbs:
        if ft:
            (settings.data_dir / "faces" / ft).unlink(missing_ok=True)
    db.execute(delete(Face).where(Face.media_id == media_id))
    db.delete(row)
    db.commit()
    return {"deleted": media_id}


@router.get("/media/corrupt")
def list_corrupt(db: Session = Depends(get_db)) -> list[dict]:
    """Media rows that failed thumbnail generation — likely corrupt or unreadable files."""
    rows = db.scalars(
        select(Media).where(Media.thumb_name.is_(None)).order_by(Media.taken_at)
    ).all()
    return [
        {
            "id": m.id,
            "filename": m.filename,
            "path": m.path,
            "media_type": m.media_type,
            "taken_at": m.taken_at.isoformat() if m.taken_at else None,
            "size_bytes": m.size_bytes,
        }
        for m in rows
    ]


@router.get("/stats", response_model=Stats)
def stats(
    db: Session = Depends(get_db),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    types: list[str] = Query(default=["image", "video", "pano"]),
    favourite: bool = Query(False),
    tags: list[str] = Query(default=[]),
) -> Stats:
    total = db.scalar(select(func.count(Media.id))) or 0
    geotagged = db.scalar(
        select(func.count(Media.id)).where(Media.lat.is_not(None))
    ) or 0
    images = db.scalar(
        select(func.count(Media.id)).where(Media.media_type == "image")
    ) or 0
    videos = db.scalar(
        select(func.count(Media.id)).where(Media.media_type == "video")
    ) or 0
    panos = db.scalar(
        select(func.count(Media.id)).where(Media.projection.is_not(None))
    ) or 0
    favourites = db.scalar(
        select(func.count(Media.id)).where(Media.is_favourite == 1)
    ) or 0
    tag_rows = db.scalars(select(Media.tags).where(Media.tags.is_not(None))).all()
    tag_set: set[str] = set()
    for raw in tag_rows:
        try:
            for t in json.loads(raw):
                if isinstance(t, str) and t:
                    tag_set.add(t)
        except Exception:
            pass
    min_date = db.scalar(select(func.min(Media.taken_at)))
    max_date = db.scalar(select(func.max(Media.taken_at)))

    # Monthly histogram of counts, ordered by month.
    histogram: list[HistogramBucket] = []
    month_expr = func.strftime("%Y-%m-01 00:00:00", Media.taken_at)
    rows = db.execute(
        select(month_expr.label("bucket"), func.count(Media.id))
        .where(Media.taken_at.is_not(None))
        .group_by("bucket")
        .order_by("bucket")
    ).all()
    for bucket, count in rows:
        try:
            histogram.append(
                HistogramBucket(start=datetime.fromisoformat(bucket), count=count)
            )
        except (TypeError, ValueError):
            continue

    # Geotagged count with active filters applied (drives the sidebar "memories" counter).
    _ALL = {"image", "video", "pano"}
    fg: list = [Media.lat.is_not(None)]
    if start: fg.append(Media.taken_at >= start)
    if end:   fg.append(Media.taken_at <= end)
    active = set(types) & _ALL
    if active and active != _ALL:
        tc: list = []
        if "image" in active: tc.append(and_(Media.media_type == "image", Media.projection.is_(None)))
        if "video" in active: tc.append(and_(Media.media_type == "video", Media.projection.is_(None)))
        if "pano"  in active: tc.append(Media.projection.is_not(None))
        if tc: fg.append(or_(*tc))
    if favourite: fg.append(Media.is_favourite == 1)
    if tags: fg.append(or_(*[Media.tags.like(f'%"{t}"%') for t in tags]))
    geotagged_filtered = db.scalar(select(func.count(Media.id)).where(*fg)) or 0

    return Stats(
        total=total,
        geotagged=geotagged,
        geotagged_filtered=geotagged_filtered,
        images=images,
        videos=videos,
        panos=panos,
        favourites=favourites,
        tag_count=len(tag_set),
        min_date=min_date,
        max_date=max_date,
        histogram=histogram,
    )


@router.get("/places", response_model=list[PlaceOut])
def places(
    db: Session = Depends(get_db),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
) -> list[PlaceOut]:
    """Aggregate geotagged media into places, most-visited first."""
    stmt = (
        select(
            Media.place,
            Media.region,
            Media.country,
            Media.country_code,
            func.count(Media.id),
            func.avg(Media.lat),
            func.avg(Media.lon),
        )
        .where(Media.lat.is_not(None), Media.place.is_not(None))
    )
    if start is not None:
        stmt = stmt.where(Media.taken_at >= start)
    if end is not None:
        stmt = stmt.where(Media.taken_at <= end)
    stmt = (
        stmt.group_by(Media.place, Media.region, Media.country, Media.country_code)
        .order_by(func.count(Media.id).desc())
    )
    rows = db.execute(stmt).all()
    return [
        PlaceOut(
            place=place,
            region=region,
            country=country,
            country_code=cc,
            count=count,
            lat=lat,
            lon=lon,
        )
        for place, region, country, cc, count, lat, lon in rows
    ]


@router.get("/unlocated", response_model=list[UnlocatedGroup])
def unlocated_groups(
    db: Session = Depends(get_db),
    limit: int = Query(200, le=1000),
) -> list[UnlocatedGroup]:
    """Return ungeotagged media grouped by calendar day, newest first."""
    day_expr = func.date(Media.taken_at)
    stmt = (
        select(
            day_expr.label("day"),
            func.count(Media.id).label("cnt"),
            func.max(Media.id).label("cover_id"),
            func.sum(case(
                (and_(Media.media_type == "image", Media.projection.is_(None)), 1), else_=0
            )).label("images"),
            func.sum(case(
                (Media.media_type == "video", 1), else_=0
            )).label("videos"),
            func.sum(case(
                (Media.projection.is_not(None), 1), else_=0
            )).label("panos"),
        )
        .where(Media.lat.is_(None))
        .group_by(day_expr)
        # NULL dates sink to the bottom; non-NULL days newest first.
        .order_by(text("day IS NULL, day DESC"))
        .limit(limit)
    )
    # Pre-compute which dates have located media (for "has suggestion" flag).
    located_dates: set[str] = set(
        db.execute(
            select(func.date(Media.taken_at))
            .where(Media.lat.is_not(None), Media.taken_at.is_not(None))
            .distinct()
        ).scalars().all()
    )

    out: list[UnlocatedGroup] = []
    for row in db.execute(stmt).all():
        day = row.day or "no-date"
        if row.day:
            try:
                d = datetime.strptime(row.day, "%Y-%m-%d")
                label = d.strftime("%-d %B %Y")
            except (ValueError, AttributeError):
                label = row.day
        else:
            label = "Unknown date"
        out.append(UnlocatedGroup(
            date=day, label=label, count=row.cnt, cover_id=row.cover_id,
            images=row.images or 0, videos=row.videos or 0, panos=row.panos or 0,
            has_suggestion=day in located_dates,
        ))
    return out


@router.get("/geocode", response_model=GeocodeResult)
def geocode_point(lat: float, lon: float) -> GeocodeResult:
    """Reverse-geocode a single point for the placement preview."""
    if abs(lat) < 0.001 and abs(lon) < 0.001:
        return GeocodeResult(place=None, region=None, country_code=None, country=None)
    results = reverse_geocode([(lat, lon)])
    r = results[0] if results else {}
    return GeocodeResult(
        place=r.get("place"),
        region=r.get("region"),
        country_code=r.get("country_code"),
        country=r.get("country"),
    )


@router.post("/locate")
def locate_media(req: LocateRequest, db: Session = Depends(get_db)) -> dict:
    """Assign a lat/lon to all unlocated media on a given date."""
    if not (-90 <= req.lat <= 90) or not (-180 <= req.lon <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range")
    if abs(req.lat) < 0.001 and abs(req.lon) < 0.001:
        raise HTTPException(status_code=400, detail="Cannot place at (0, 0)")

    geo_results = reverse_geocode([(req.lat, req.lon)])
    geo = geo_results[0] if geo_results else {}

    if req.date == "no-date":
        where = [Media.lat.is_(None), Media.taken_at.is_(None)]
    else:
        where = [Media.lat.is_(None), func.date(Media.taken_at) == req.date]

    stmt = (
        update(Media)
        .where(*where)
        .values(
            lat=req.lat,
            lon=req.lon,
            place=geo.get("place"),
            region=geo.get("region"),
            country_code=geo.get("country_code"),
            country=geo.get("country"),
            location_manual=True,
        )
    )
    result = db.execute(stmt)
    db.commit()
    return {"updated": result.rowcount}


@router.post("/relocate")
def relocate_media(req: RelocateRequest, db: Session = Depends(get_db)) -> dict:
    """Move ALL media on a given date to a new lat/lon (including already-located media)."""
    if not (-90 <= req.lat <= 90) or not (-180 <= req.lon <= 180):
        raise HTTPException(status_code=400, detail="Coordinates out of range")
    if abs(req.lat) < 0.001 and abs(req.lon) < 0.001:
        raise HTTPException(status_code=400, detail="Cannot place at (0, 0)")

    geo_results = reverse_geocode([(req.lat, req.lon)])
    geo = geo_results[0] if geo_results else {}

    if req.date == "no-date":
        where = [Media.taken_at.is_(None)]
    else:
        where = [func.date(Media.taken_at) == req.date]

    result = db.execute(
        update(Media).where(*where).values(
            lat=req.lat, lon=req.lon,
            place=geo.get("place"),
            region=geo.get("region"),
            country_code=geo.get("country_code"),
            country=geo.get("country"),
            location_manual=True,
        )
    )
    db.commit()
    return {"updated": result.rowcount}


@router.post("/remove-location")
def remove_location(req: RemoveLocationRequest, db: Session = Depends(get_db)) -> dict:
    """Clear the manually-set location for all media on a given date."""
    if req.date == "no-date":
        where = [Media.taken_at.is_(None), Media.location_manual.is_(True)]
    else:
        where = [func.date(Media.taken_at) == req.date, Media.location_manual.is_(True)]

    result = db.execute(
        update(Media).where(*where).values(
            lat=None, lon=None,
            place=None, region=None,
            country_code=None, country=None,
            location_manual=False,
        )
    )
    db.commit()
    return {"updated": result.rowcount}


@router.post("/unlocated/auto-place")
def auto_place(db: Session = Depends(get_db)) -> dict:
    """Place all unlocated groups that have a same-day located match.
    Groups without any match are left untouched."""
    day_expr = func.date(Media.taken_at)

    unlocated_days: list[str] = db.execute(
        select(day_expr).where(Media.lat.is_(None), Media.taken_at.is_not(None)).distinct()
    ).scalars().all()

    placed = 0
    for date in unlocated_days:
        match = db.execute(
            select(Media.lat, Media.lon, Media.place, Media.region, Media.country_code, Media.country)
            .where(Media.lat.is_not(None), day_expr == date)
            .limit(1)
        ).first()
        if not match:
            continue
        db.execute(
            update(Media)
            .where(Media.lat.is_(None), day_expr == date)
            .values(
                lat=match.lat, lon=match.lon,
                place=match.place, region=match.region,
                country_code=match.country_code, country=match.country,
            )
        )
        placed += 1

    if placed:
        db.commit()
    return {"placed": placed}


@router.get("/unlocated/{date}/items", response_model=list[UnlocatedItem])
def unlocated_items(date: str, db: Session = Depends(get_db)) -> list[UnlocatedItem]:
    """Return all media items for a given unlocated date group."""
    if date == "no-date":
        where = [Media.lat.is_(None), Media.taken_at.is_(None)]
    else:
        where = [Media.lat.is_(None), func.date(Media.taken_at) == date]
    rows = db.execute(
        select(Media.id, Media.filename, Media.path, Media.media_type, Media.thumb_name)
        .where(*where)
        .order_by(Media.taken_at, Media.filename)
        .limit(500)
    ).all()
    return [
        UnlocatedItem(id=r.id, filename=r.filename, path=r.path,
                      media_type=r.media_type, thumb_name=r.thumb_name)
        for r in rows
    ]


@router.get("/unlocated/{date}/suggest", response_model=list[LocationSuggestion])
def suggest_location(date: str, db: Session = Depends(get_db)) -> list[LocationSuggestion]:
    """Suggest a location for an unlocated date group based on same-day or same-dir located media."""
    if date == "no-date":
        return []

    suggestions: list[LocationSuggestion] = []
    seen: set[tuple] = set()

    # 1. Located media on the same calendar day.
    same_day = db.execute(
        select(Media.lat, Media.lon, Media.place, Media.region, Media.country)
        .where(Media.lat.is_not(None), func.date(Media.taken_at) == date)
        .limit(1)
    ).first()
    if same_day:
        key = (round(same_day.lat, 2), round(same_day.lon, 2))
        seen.add(key)
        label = ", ".join(filter(None, [same_day.place, same_day.region, same_day.country]))
        suggestions.append(LocationSuggestion(
            lat=same_day.lat, lon=same_day.lon,
            place=same_day.place, region=same_day.region, country=same_day.country,
            source="same_day",
            source_label=label or f"{same_day.lat:.3f}, {same_day.lon:.3f}",
        ))

    # 2. Located media in the same directory as the unlocated files.
    unlocated_paths = db.execute(
        select(Media.path)
        .where(Media.lat.is_(None), func.date(Media.taken_at) == date)
        .limit(20)
    ).scalars().all()

    dirs = list({str(Path(p).parent) for p in unlocated_paths})[:5]
    for d in dirs:
        same_dir = db.execute(
            select(Media.lat, Media.lon, Media.place, Media.region, Media.country)
            .where(Media.lat.is_not(None), Media.path.like(f"{d}/%"))
            .limit(1)
        ).first()
        if same_dir:
            key = (round(same_dir.lat, 2), round(same_dir.lon, 2))
            if key not in seen:
                seen.add(key)
                label = ", ".join(filter(None, [same_dir.place, same_dir.region, same_dir.country]))
                suggestions.append(LocationSuggestion(
                    lat=same_dir.lat, lon=same_dir.lon,
                    place=same_dir.place, region=same_dir.region, country=same_dir.country,
                    source="same_dir",
                    source_label=label or f"{same_dir.lat:.3f}, {same_dir.lon:.3f}",
                ))

    return suggestions


@router.get("/tags", response_model=list[TagCount])
def list_tags(db: Session = Depends(get_db)) -> list[TagCount]:
    """Return all distinct tags with their usage counts, most-used first."""
    from collections import Counter
    rows = db.scalars(select(Media.tags).where(Media.tags.is_not(None))).all()
    counts: Counter = Counter()
    for raw in rows:
        try:
            for t in json.loads(raw):
                if isinstance(t, str) and t:
                    counts[t] += 1
        except Exception:
            continue
    return [TagCount(tag=t, count=c) for t, c in counts.most_common()]


@router.get("/geocode/search", response_model=list[GeoSearchResult])
def geocode_search(q: str = Query(..., min_length=2)) -> list[GeoSearchResult]:
    """Forward-geocode a place name using Nominatim (requires network)."""
    import urllib.parse
    import urllib.request

    params = urllib.parse.urlencode({"q": q, "format": "json", "limit": 5})
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mneme/1.0 (self-hosted photo map)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read())
        return [
            GeoSearchResult(
                lat=float(r["lat"]),
                lon=float(r["lon"]),
                display_name=r["display_name"],
                place=r["display_name"].split(",")[0].strip(),
            )
            for r in data
        ]
    except Exception:
        return []
