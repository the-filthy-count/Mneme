"""Library scanning: walk configured roots, extract metadata, build thumbnails."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import threading
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pillow_heif
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, select

from .config import get_settings
from .database import SessionLocal
from .geo import reverse_geocode
from .models import Media
from . import settings_store

pillow_heif.register_heif_opener()

settings = get_settings()

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".tif", ".tiff", ".bmp", ".heic", ".heif"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".3gp", ".mts"}
ALL_EXTS = IMAGE_EXTS | VIDEO_EXTS

_HEVC_CODECS = frozenset({"hev1", "hvc1", "hevc"})
_TRANSCODE_DIR = settings.data_dir / "transcoded"


def _is_hevc(codec: str | None) -> bool:
    if not codec:
        return False
    c = codec.strip().lower()
    return c in _HEVC_CODECS or c.startswith("hev") or c.startswith("hvc")


def _transcode_name(abs_path: str) -> str:
    digest = hashlib.sha1(abs_path.encode("utf-8")).hexdigest()
    return f"{digest}_h264.mp4"


def _transcode_h264(src: Path) -> str | None:
    """Transcode an HEVC video to H.264 MP4 for browser compatibility.

    Returns the cache filename (relative to _TRANSCODE_DIR), or None on failure.
    """
    _TRANSCODE_DIR.mkdir(parents=True, exist_ok=True)
    name = _transcode_name(str(src))
    dest = _TRANSCODE_DIR / name
    if dest.exists():
        return name
    tmp = _TRANSCODE_DIR / f"{name}.tmp"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(src),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        "-f", "mp4",
        str(tmp),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=600)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        tmp.unlink(missing_ok=True)
        return None
    if proc.returncode == 0 and tmp.exists():
        tmp.rename(dest)
        return name
    tmp.unlink(missing_ok=True)
    return None


# Mutable scan state shared with the API. Guarded by _lock for writes.
_lock = threading.Lock()
scan_state: dict = {
    "state": "idle",
    "total": 0,
    "processed": 0,
    "added": 0,
    "updated": 0,
    "removed": 0,
    "message": None,
    "started_at": None,
    "finished_at": None,
}


def _set(**kwargs) -> None:
    with _lock:
        scan_state.update(kwargs)


def _thumb_name(abs_path: str) -> str:
    digest = hashlib.sha1(abs_path.encode("utf-8")).hexdigest()
    return f"{digest}.jpg"


# ---------------------------------------------------------------------------
# Metadata extraction (exiftool)
# ---------------------------------------------------------------------------

_DATE_TAGS = (
    "DateTimeOriginal",
    "CreateDate",
    "CreationDate",
    "MediaCreateDate",
    "TrackCreateDate",
    "ModifyDate",
)


def _parse_duration(value: object) -> float | None:
    """Convert exiftool Duration to seconds (float).

    Handles plain numbers, 'HH:MM:SS[.nnn]', 'MM:SS', and 'Xh Ym Zs' strings.
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    # HH:MM:SS or MM:SS (possibly with fractional seconds)
    if ":" in text:
        parts = text.split(":")
        try:
            seconds = 0.0
            for part in parts:
                seconds = seconds * 60 + float(part)
            return seconds
        except ValueError:
            pass
    # Plain number as string e.g. "80.505"
    try:
        return float(text)
    except ValueError:
        return None


def _parse_exif_date(value: str) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    text = text.split("+")[0].split("Z")[0].strip()
    text = text.split(".")[0].strip()  # drop subseconds
    for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


_FILENAME_DATE_PATTERNS = [
    # PXL_20250305_120338185.mp4 / IMG_20250305_120338.jpg / VID_20250305_120338.mp4
    re.compile(r"(?:^|_)(\d{8})_(\d{6})", re.IGNORECASE),
    # Screenshot_20250305-120338_app.jpg
    re.compile(r"(\d{8})-(\d{6})"),
    # 2025-03-05 12.03.38.mp4  or  2025-03-05_12-03-38.mp4
    re.compile(r"(\d{4})[-_](\d{2})[-_](\d{2})[_ T](\d{2})[._-](\d{2})[._-](\d{2})"),
]


def _parse_filename_date(filename: str) -> datetime | None:
    stem = Path(filename).stem
    for pat in _FILENAME_DATE_PATTERNS:
        m = pat.search(stem)
        if not m:
            continue
        g = m.groups()
        try:
            if len(g) == 2:
                # groups: YYYYMMDD, HHMMSS
                d, t = g[0], g[1]
                return datetime(int(d[:4]), int(d[4:6]), int(d[6:8]),
                                int(t[:2]), int(t[2:4]), int(t[4:6]))
            elif len(g) == 6:
                return datetime(int(g[0]), int(g[1]), int(g[2]),
                                int(g[3]), int(g[4]), int(g[5]))
        except (ValueError, IndexError):
            continue
    return None


_PANO_TAGS = (
    "ProjectionType",
    "UsePanoramaViewer",
    "FullPanoWidthPixels",
)


def _detect_projection(rec: dict) -> str | None:
    """Return 'equirectangular' if exiftool metadata indicates a spherical/pano file."""
    proj = str(rec.get("ProjectionType") or "").lower().replace("-", "").replace(" ", "")
    if proj in ("equirectangular", "spherical", "equirect"):
        return "equirectangular"
    if str(rec.get("UsePanoramaViewer") or "").strip().lower() == "true":
        return "equirectangular"
    if rec.get("FullPanoWidthPixels"):
        return "equirectangular"
    return None


def extract_metadata(paths: list[Path]) -> dict[str, dict]:
    """Batch-extract metadata for a list of files using exiftool."""
    if not paths:
        return {}
    cmd = [
        "exiftool",
        "-json",
        "-n",  # numeric values (signed decimal GPS)
        "-fast2",
        "-GPSLatitude",
        "-GPSLongitude",
        "-GPSLatitudeRef",
        "-GPSLongitudeRef",
        "-ImageWidth",
        "-ImageHeight",
        "-Duration#",
        "-MIMEType",
        *(f"-{tag}" for tag in _DATE_TAGS),
        *(f"-{tag}" for tag in _PANO_TAGS),
        *[str(p) for p in paths],
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {}
    if not proc.stdout.strip():
        return {}
    try:
        records = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {}

    out: dict[str, dict] = {}
    for rec in records:
        source = rec.get("SourceFile")
        if not source:
            continue
        taken = None
        for tag in _DATE_TAGS:
            taken = _parse_exif_date(rec.get(tag, ""))
            if taken:
                break
        lat = rec.get("GPSLatitude")
        lon = rec.get("GPSLongitude")
        lat_f = float(lat) if isinstance(lat, (int, float)) else None
        lon_f = float(lon) if isinstance(lon, (int, float)) else None
        # Ref tags tell us hemisphere. Apply sign explicitly so that files
        # lacking Ref tags (older cameras) get correct signed values even when
        # exiftool -n returns an unsigned positive number.
        lat_ref = str(rec.get("GPSLatitudeRef") or "").strip().upper()[:1]
        lon_ref = str(rec.get("GPSLongitudeRef") or "").strip().upper()[:1]
        if lat_f is not None and lat_ref == "S":
            lat_f = -abs(lat_f)
        if lon_f is not None and lon_ref == "W":
            lon_f = -abs(lon_f)
        # Reject Null Island (0,0) — some cameras write zeroes when GPS has no fix.
        if lat_f is not None and lon_f is not None:
            if abs(lat_f) < 0.001 and abs(lon_f) < 0.001:
                lat_f = lon_f = None
        out[str(Path(source))] = {
            "taken_at": taken,
            "lat": lat_f,
            "lon": lon_f,
            "width": rec.get("ImageWidth"),
            "height": rec.get("ImageHeight"),
            "duration": _parse_duration(rec.get("Duration")),
            "mime": rec.get("MIMEType"),
            "projection": _detect_projection(rec),
        }
    return out


# ---------------------------------------------------------------------------
# Thumbnail generation
# ---------------------------------------------------------------------------


def _make_image_thumb(src: Path, dest: Path) -> bool:
    try:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)  # honour camera orientation
            im = im.convert("RGB")
            im.thumbnail((settings.thumbnail_size, settings.thumbnail_size))
            im.save(dest, "JPEG", quality=82)
        return True
    except (UnidentifiedImageError, OSError, ValueError):
        return False


def _make_video_thumb(src: Path, dest: Path) -> bool:
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-ss", "1", "-i", str(src),
        "-frames:v", "1",
        "-vf", f"scale='min({settings.thumbnail_size},iw)':-2",
        str(dest),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=120)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False
    return proc.returncode == 0 and dest.exists()


def _probe_video_codec(src: Path) -> str | None:
    """Return the primary video stream codec name via ffprobe (e.g. 'hevc', 'h264')."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(src),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    return proc.stdout.strip().lower() or None


def _compute_phash(img: Image.Image) -> str:
    """64-bit DCT perceptual hash as a 64-char binary string."""
    from scipy.fftpack import dct
    img = img.convert("L").resize((32, 32), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32)
    d = dct(dct(arr, axis=0), axis=1)
    low = d[:8, :8].flatten()
    avg = (low.sum() - low[0]) / 63.0
    return "".join("1" if v > avg else "0" for v in low)


def build_thumbnail(abs_path: Path, media_type: str) -> str | None:
    dest = settings.thumb_dir / _thumb_name(str(abs_path))
    ok = _make_image_thumb(abs_path, dest) if media_type == "image" else _make_video_thumb(abs_path, dest)
    return dest.name if ok else None


# ---------------------------------------------------------------------------
# Scan orchestration
# ---------------------------------------------------------------------------


def _discover(roots: list[Path]) -> list[Path]:
    found: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in ALL_EXTS and not p.name.startswith("."):
                key = str(p.resolve())
                if key not in seen:
                    seen.add(key)
                    found.append(p)
    return found


def run_scan() -> None:
    """Full scan pass across all configured roots. Runs in a background thread."""
    _set(state="scanning", total=0, processed=0, added=0, updated=0, removed=0,
         message=None, started_at=datetime.now(timezone.utc).replace(tzinfo=None),
         finished_at=None)
    try:
        roots = settings_store.scan_roots()
        files = _discover(roots)
        _set(total=len(files))
        seen_paths: set[str] = set()
        added = updated = processed = 0

        batch: list[Path] = []
        BATCH = 80

        with SessionLocal() as db:
            existing = {m.path: m for m in db.scalars(select(Media)).all()}

            def flush(batch_paths: list[Path]) -> tuple[int, int]:
                a = u = 0
                meta = extract_metadata(batch_paths)

                # Reverse-geocode all geotagged files in this batch at once.
                coords: list[tuple[float, float]] = []
                coord_keys: list[str] = []
                for ap in batch_paths:
                    m = meta.get(str(ap), {})
                    if m.get("lat") is not None and m.get("lon") is not None:
                        coords.append((m["lat"], m["lon"]))
                        coord_keys.append(str(ap))
                geo_by_key: dict[str, dict] = {}
                if coords:
                    for key, loc in zip(coord_keys, reverse_geocode(coords)):
                        geo_by_key[key] = loc

                for abs_path in batch_paths:
                    key = str(abs_path)
                    ext = abs_path.suffix.lower()
                    mtype = "image" if ext in IMAGE_EXTS else "video"
                    m = meta.get(key, {})
                    taken = m.get("taken_at")
                    try:
                        stat = abs_path.stat()
                    except OSError:
                        continue
                    if taken is None:
                        taken = _parse_filename_date(abs_path.name)
                    if taken is None:
                        taken = datetime.fromtimestamp(stat.st_mtime)
                    thumb = build_thumbnail(abs_path, mtype)
                    loc = geo_by_key.get(key, {})
                    row = existing.get(key)
                    is_new = row is None
                    if row is None:
                        row = Media(path=key)
                        db.add(row)
                        existing[key] = row
                        a += 1
                    else:
                        u += 1
                    row.filename = abs_path.name
                    row.media_type = mtype
                    row.mime = m.get("mime")
                    row.taken_at = taken
                    if not row.location_manual:
                        row.lat = m.get("lat")
                        row.lon = m.get("lon")
                        row.place = loc.get("place")
                        row.region = loc.get("region")
                        row.country_code = loc.get("country_code")
                        row.country = loc.get("country")
                    row.width = m.get("width")
                    row.height = m.get("height")
                    row.duration = m.get("duration")
                    row.projection = m.get("projection")
                    row.size_bytes = stat.st_size
                    row.thumb_name = thumb
                    row.file_mtime = stat.st_mtime
                    row.indexed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    if thumb:
                        try:
                            row.phash = _compute_phash(Image.open(settings.thumb_dir / thumb))
                        except Exception:
                            pass

                    # Codec detection and HEVC→H.264 transcoding.
                    if mtype == "video":
                        codec = _probe_video_codec(abs_path)
                        row.video_codec = codec
                        if _is_hevc(codec):
                            # Clear any stale transcode from a modified file.
                            if not is_new and row.transcode_path:
                                (_TRANSCODE_DIR / row.transcode_path).unlink(missing_ok=True)
                                row.transcode_path = None
                            row.transcode_path = _transcode_h264(abs_path)
                        elif not is_new:
                            row.transcode_path = None
                    else:
                        row.video_codec = None
                db.commit()
                return a, u

            for path in files:
                key = str(path)
                seen_paths.add(key)
                try:
                    mtime = path.stat().st_mtime
                except OSError:
                    continue
                row = existing.get(key)
                if row is not None and row.file_mtime == mtime and row.thumb_name and row.taken_at is not None:
                    # Only re-process a video if it's confirmed HEVC and still lacks a transcode.
                    # Codec detection for pre-existing videos happens on their next content change.
                    needs_transcode = _is_hevc(row.video_codec) and not row.transcode_path
                    if not needs_transcode:
                        processed += 1
                        _set(processed=processed)
                        continue
                batch.append(path)
                if len(batch) >= BATCH:
                    da, du = flush(batch)
                    added += da
                    updated += du
                    processed += len(batch)
                    _set(processed=processed, added=added, updated=updated)
                    batch = []

            if batch:
                da, du = flush(batch)
                added += da
                updated += du
                processed += len(batch)
                _set(processed=processed, added=added, updated=updated)

            # Drop rows whose files are no longer in any scan root.
            removed = 0
            for key, row in list(existing.items()):
                if key not in seen_paths:
                    if row.thumb_name:
                        (settings.thumb_dir / row.thumb_name).unlink(missing_ok=True)
                    if row.transcode_path:
                        (_TRANSCODE_DIR / row.transcode_path).unlink(missing_ok=True)
                    db.delete(row)
                    removed += 1
            if removed:
                db.commit()

            # Back-fill phash for items that were skipped (already up-to-date
            # but had no phash yet because this column is newly introduced).
            no_phash = list(db.scalars(
                select(Media).where(Media.thumb_name.is_not(None), Media.phash.is_(None))
            ).all())
            for i, item in enumerate(no_phash):
                src = settings.thumb_dir / item.thumb_name
                if src.exists():
                    try:
                        item.phash = _compute_phash(Image.open(src))
                    except Exception:
                        pass
                if i % 500 == 499:
                    db.commit()
            if no_phash:
                db.commit()

        _set(state="done", removed=removed,
             finished_at=datetime.now(timezone.utc).replace(tzinfo=None))
        # Automatically scan any images not yet analysed for faces.
        from . import face_scanner
        face_scanner.start_scan()
    except Exception as exc:  # noqa: BLE001 - surface any failure to the UI
        _set(state="error", message=str(exc),
             finished_at=datetime.now(timezone.utc).replace(tzinfo=None))


def reset_index() -> bool:
    """Clear the entire index: drop all media rows and delete thumbnails.

    Returns False if a scan is currently running.
    """
    with _lock:
        if scan_state["state"] == "scanning":
            return False
    with SessionLocal() as db:
        db.execute(delete(Media))
        db.commit()
    for f in settings.thumb_dir.glob("*.jpg"):
        f.unlink(missing_ok=True)
    for f in _TRANSCODE_DIR.glob("*.mp4"):
        f.unlink(missing_ok=True)
    _set(state="idle", total=0, processed=0, added=0, updated=0, removed=0,
         message=None, started_at=None, finished_at=None)
    return True


_scan_thread: threading.Thread | None = None


def start_scan() -> bool:
    """Kick off a scan in the background. Returns False if one is already running."""
    global _scan_thread
    with _lock:
        if scan_state["state"] == "scanning":
            return False
    _scan_thread = threading.Thread(target=run_scan, daemon=True)
    _scan_thread.start()
    return True
