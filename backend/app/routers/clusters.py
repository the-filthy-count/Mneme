import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, select, text, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AlbumLabel, Face, Media
from ..schemas import AlbumLabelOut, AlbumLabelUpdate, AlbumOut, ClusterOut, MediaOut

router = APIRouter(prefix="/api/clusters", tags=["clusters"])

_ALL_TYPES = {"image", "video", "pano"}


def _tag_filter(tags: list[str]):
    """Return an OR condition matching media that have any of the given tags."""
    if not tags:
        return None
    return or_(*[Media.tags.like(f'%"{t}"%') for t in tags])


def _type_filter(types: list[str]):
    """Return an OR condition for the given type list, or None when all types selected."""
    active = set(types) & _ALL_TYPES
    if not active or active == _ALL_TYPES:
        return None
    conds = []
    if "image" in active:
        conds.append(and_(Media.media_type == "image", Media.projection.is_(None)))
    if "video" in active:
        conds.append(and_(Media.media_type == "video", Media.projection.is_(None)))
    if "pano" in active:
        conds.append(Media.projection.is_not(None))
    return or_(*conds) if conds else None


def _group_mode(zoom: int) -> str:
    if zoom <= 2:  return "country"   # full-world zoom only
    if zoom <= 5:  return "region"    # continent/country view → states & provinces
    if zoom <= 16: return "place"     # city/venue level — one dot per named place
    return "coord3"                   # ~111 m grid, only kicks in at street level (z17+)


def _lat_str(dp: int):
    return func.printf(f"%.{dp}f", Media.lat)


def _lon_str(dp: int):
    return func.printf(f"%.{dp}f", Media.lon)


# ---------------------------------------------------------------------------
# Cluster-key encode / decode
# ---------------------------------------------------------------------------

def _geo_key(mode: str, country, region, place) -> str:
    if mode == "country":
        return f"c:{country or ''}"
    if mode == "region":
        return f"r:{country or ''}|{region or ''}"
    return f"p:{country or ''}|{region or ''}|{place or ''}"


def _parse_key(key: str) -> dict:
    """Decode a cluster key into a filter-spec dict."""
    if key.startswith("c:"):
        v = key[2:]
        return {"mode": "country", "country": v or None, "region": None, "place": None}

    if key.startswith("r:"):
        parts = key[2:].split("|", 1)
        return {
            "mode": "region",
            "country": parts[0] or None,
            "region": (parts[1] if len(parts) > 1 else "") or None,
            "place": None,
        }

    if key.startswith("p:"):
        parts = key[2:].split("|", 2)
        return {
            "mode": "place",
            "country": parts[0] or None,
            "region": (parts[1] if len(parts) > 1 else "") or None,
            "place": (parts[2] if len(parts) > 2 else "") or None,
        }

    # coordinate key: "51.512_-0.128"
    try:
        coord_parts = key.split("_", 1)
        float(coord_parts[0])
        float(coord_parts[1])
        dp = len(coord_parts[0].split(".")[-1]) if "." in coord_parts[0] else 0
        return {"mode": "coord", "clat": coord_parts[0], "clon": coord_parts[1], "dp": max(dp, 1)}
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid cluster key")


def _where_for_key(parsed: dict) -> list:
    """Return SQLAlchemy WHERE conditions matching the cluster."""
    conds = [Media.lat.is_not(None)]
    mode = parsed["mode"]

    if mode in ("country", "region", "place"):
        c = parsed["country"]
        conds.append(Media.country == c if c is not None else Media.country.is_(None))
        if mode in ("region", "place"):
            r = parsed["region"]
            conds.append(Media.region == r if r is not None else Media.region.is_(None))
        if mode == "place":
            p = parsed["place"]
            conds.append(Media.place == p if p is not None else Media.place.is_(None))

    else:  # coord
        dp = parsed["dp"]
        conds.append(_lat_str(dp) == parsed["clat"])
        conds.append(_lon_str(dp) == parsed["clon"])

    return conds


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ClusterOut])
def list_clusters(
    db: Session = Depends(get_db),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    zoom: int = Query(10, ge=1, le=20),
    min_lat: float | None = None,
    max_lat: float | None = None,
    min_lon: float | None = None,
    max_lon: float | None = None,
    types: list[str] = Query(default=["image", "video", "pano"]),
    favourite: bool = Query(False),
    tags: list[str] = Query(default=[]),
    person_id: int | None = Query(None),
) -> list[ClusterOut]:
    mode = _group_mode(zoom)
    base = [Media.lat.is_not(None)]
    if start: base.append(Media.taken_at >= start)
    if end:   base.append(Media.taken_at <= end)
    tc = _type_filter(types)
    if tc is not None: base.append(tc)
    if favourite: base.append(Media.is_favourite == 1)
    tg = _tag_filter(tags)
    if tg is not None: base.append(tg)
    if person_id is not None:
        person_media_sub = select(Face.media_id).where(
            Face.person_id == person_id, Face.encoding != "[]"
        ).distinct()
        base.append(Media.id.in_(person_media_sub))

    # Viewport filter — pad by 20 % so markers don't vanish at the edge.
    # Skip lon filter when the viewport wraps the date line or is near-global.
    if None not in (min_lat, max_lat, min_lon, max_lon):
        lat_pad = (max_lat - min_lat) * 0.2
        lon_span = max_lon - min_lon
        base.append(Media.lat >= min_lat - lat_pad)
        base.append(Media.lat <= max_lat + lat_pad)
        if 0 < lon_span < 300:          # skip when near-global or date-line wrap
            lon_pad = lon_span * 0.2
            base.append(Media.lon >= min_lon - lon_pad)
            base.append(Media.lon <= max_lon + lon_pad)

    if mode == "country":
        stmt = (
            select(
                Media.country.label("g_country"),
                func.count(Media.id).label("cnt"),
                func.avg(Media.lat).label("avg_lat"),
                func.avg(Media.lon).label("avg_lon"),
                func.max(Media.id).label("cover_id"),
            )
            .where(*base, Media.country.is_not(None))
            .group_by(Media.country)
            .order_by(func.count(Media.id).desc())
        )
        return [
            ClusterOut(
                cluster_key=f"c:{row.g_country}",
                lat=row.avg_lat, lon=row.avg_lon,
                count=row.cnt, cover_id=row.cover_id,
                place=None, region=None, country=row.g_country,
            )
            for row in db.execute(stmt).all()
        ]

    if mode == "region":
        stmt = (
            select(
                Media.country.label("g_country"),
                Media.region.label("g_region"),
                func.count(Media.id).label("cnt"),
                func.avg(Media.lat).label("avg_lat"),
                func.avg(Media.lon).label("avg_lon"),
                func.max(Media.id).label("cover_id"),
            )
            .where(*base, Media.country.is_not(None))
            .group_by(Media.country, Media.region)
            .order_by(func.count(Media.id).desc())
        )
        return [
            ClusterOut(
                cluster_key=_geo_key("region", row.g_country, row.g_region, None),
                lat=row.avg_lat, lon=row.avg_lon,
                count=row.cnt, cover_id=row.cover_id,
                place=None, region=row.g_region, country=row.g_country,
            )
            for row in db.execute(stmt).all()
        ]

    if mode == "place":
        stmt = (
            select(
                Media.country.label("g_country"),
                Media.region.label("g_region"),
                Media.place.label("g_place"),
                func.count(Media.id).label("cnt"),
                func.avg(Media.lat).label("avg_lat"),
                func.avg(Media.lon).label("avg_lon"),
                func.max(Media.id).label("cover_id"),
            )
            .where(*base, Media.country.is_not(None))
            .group_by(Media.country, Media.region, Media.place)
            .order_by(func.count(Media.id).desc())
        )
        return [
            ClusterOut(
                cluster_key=_geo_key("place", row.g_country, row.g_region, row.g_place),
                lat=row.avg_lat, lon=row.avg_lon,
                count=row.cnt, cover_id=row.cover_id,
                place=row.g_place, region=row.g_region, country=row.g_country,
            )
            for row in db.execute(stmt).all()
        ]

    # coord mode
    dp = 2 if mode == "coord2" else 3
    lat_s = _lat_str(dp)
    lon_s = _lon_str(dp)
    stmt = (
        select(
            lat_s.label("clat"),
            lon_s.label("clon"),
            func.count(Media.id).label("cnt"),
            func.avg(Media.lat).label("avg_lat"),
            func.avg(Media.lon).label("avg_lon"),
            func.max(Media.id).label("cover_id"),
            func.max(Media.place).label("place"),
            func.max(Media.region).label("region"),
            func.max(Media.country).label("country"),
        )
        .where(*base)
        .group_by(lat_s, lon_s)
        .order_by(func.count(Media.id).desc())
    )
    return [
        ClusterOut(
            cluster_key=f"{row.clat}_{row.clon}",
            lat=row.avg_lat, lon=row.avg_lon,
            count=row.cnt, cover_id=row.cover_id,
            place=row.place, region=row.region, country=row.country,
        )
        for row in db.execute(stmt).all()
    ]


@router.get("/{cluster_key}/albums", response_model=list[AlbumOut])
def list_albums(
    cluster_key: str,
    db: Session = Depends(get_db),
    start: datetime | None = Query(None),
    end: datetime | None = Query(None),
    types: list[str] = Query(default=["image", "video", "pano"]),
    favourite: bool = Query(False),
    tags: list[str] = Query(default=[]),
    person_id: int | None = Query(None),
) -> list[AlbumOut]:
    parsed = _parse_key(cluster_key)
    where = _where_for_key(parsed)
    if start: where.append(Media.taken_at >= start)
    if end:   where.append(Media.taken_at <= end)
    tc = _type_filter(types)
    if tc is not None: where.append(tc)
    if favourite: where.append(Media.is_favourite == 1)
    tg = _tag_filter(tags)
    if tg is not None: where.append(tg)
    if person_id is not None:
        where.append(Media.id.in_(
            select(Face.media_id).where(Face.person_id == person_id, Face.encoding != "[]")
        ))

    day_expr = func.strftime("%Y-%m-%d", Media.taken_at)
    stmt = (
        select(
            day_expr.label("day"),
            func.count(Media.id).label("cnt"),
            func.max(Media.id).label("cover_id"),
            func.min(Media.taken_at).label("date_from"),
            func.max(Media.taken_at).label("date_to"),
            func.max(Media.place).label("place"),
            func.max(Media.region).label("region"),
            func.sum(Media.is_favourite).label("fav_cnt"),
            func.max(Media.location_manual).label("any_manual"),
        )
        .where(*where)
        .group_by(text("day"))
        .order_by(text("day ASC"))
    )
    rows = db.execute(stmt).all()

    # Fetch any custom labels for this cluster in one query.
    day_keys = [r.day for r in rows if r.day]
    label_map: dict[str, AlbumLabel] = {}
    if day_keys:
        for al in db.scalars(
            select(AlbumLabel).where(
                AlbumLabel.cluster_key == cluster_key,
                AlbumLabel.album_key.in_(day_keys),
            )
        ).all():
            label_map[al.album_key] = al

    out: list[AlbumOut] = []
    for row in rows:
        if not row.day:
            continue
        try:
            dt = datetime.strptime(row.day, "%Y-%m-%d")
            label = dt.strftime("%A, %-d %B %Y")
        except (ValueError, AttributeError):
            label = row.day
        al = label_map.get(row.day)
        out.append(AlbumOut(
            album_key=row.day,
            label=label,
            custom_label=al.label if al else None,
            custom_tags=json.loads(al.tags) if al and al.tags else None,
            place=row.place or None,
            region=row.region or None,
            count=row.cnt,
            cover_id=row.cover_id,
            date_from=row.date_from,
            date_to=row.date_to,
            favourite_count=row.fav_cnt or 0,
            location_manual=bool(row.any_manual),
        ))
    return out


@router.get("/{cluster_key}/albums/{album_key}/media", response_model=list[MediaOut])
def album_media(
    cluster_key: str,
    album_key: str,
    db: Session = Depends(get_db),
    types: list[str] = Query(default=["image", "video", "pano"]),
    favourite: bool = Query(False),
    tags: list[str] = Query(default=[]),
    person_id: int | None = Query(None),
) -> list[Media]:
    parsed = _parse_key(cluster_key)
    where = _where_for_key(parsed)
    where.append(func.strftime("%Y-%m-%d", Media.taken_at) == album_key)
    tc = _type_filter(types)
    if tc is not None: where.append(tc)
    if favourite: where.append(Media.is_favourite == 1)
    tg = _tag_filter(tags)
    if tg is not None: where.append(tg)
    if person_id is not None:
        where.append(Media.id.in_(
            select(Face.media_id).where(Face.person_id == person_id, Face.encoding != "[]")
        ))
    stmt = select(Media).where(*where).order_by(Media.taken_at)
    return list(db.scalars(stmt).all())


@router.post("/{cluster_key}/albums/{album_key}/favourite")
def set_album_favourite(
    cluster_key: str,
    album_key: str,
    favourite: bool = Query(True),
    db: Session = Depends(get_db),
) -> dict:
    """Mark or unmark all media in an album as favourite."""
    parsed = _parse_key(cluster_key)
    where = _where_for_key(parsed)
    where.append(func.strftime("%Y-%m-%d", Media.taken_at) == album_key)
    result = db.execute(update(Media).where(*where).values(is_favourite=int(favourite)))
    db.commit()
    return {"updated": result.rowcount}


@router.put("/{cluster_key}/albums/{album_key}/label", response_model=AlbumLabelOut)
def put_album_label(
    cluster_key: str,
    album_key: str,
    body: AlbumLabelUpdate,
    db: Session = Depends(get_db),
) -> AlbumLabelOut:
    al = db.get(AlbumLabel, (cluster_key, album_key))
    if al is None:
        al = AlbumLabel(cluster_key=cluster_key, album_key=album_key)
        db.add(al)
    al.label = body.label or None
    al.tags = json.dumps(body.tags) if body.tags else None
    db.commit()

    # Propagate new tags to every media item in the album (merge, don't replace).
    if body.tags:
        parsed = _parse_key(cluster_key)
        where = _where_for_key(parsed)
        where.append(func.strftime("%Y-%m-%d", Media.taken_at) == album_key)
        for m in db.scalars(select(Media).where(*where)).all():
            existing = set(json.loads(m.tags or "[]"))
            merged = existing | set(body.tags)
            m.tags = json.dumps(sorted(merged))
        db.commit()

    return AlbumLabelOut(
        cluster_key=al.cluster_key,
        album_key=al.album_key,
        label=al.label,
        tags=json.loads(al.tags) if al.tags else None,
    )
