from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Media(Base):
    """A single photo or video discovered in the library."""

    __tablename__ = "media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Absolute path inside the container; the stable identity across scan roots.
    path: Mapped[str] = mapped_column(String, unique=True, index=True)
    filename: Mapped[str] = mapped_column(String)
    media_type: Mapped[str] = mapped_column(String, index=True)  # "image" | "video"
    mime: Mapped[str | None] = mapped_column(String, nullable=True)

    # When the moment happened (EXIF/QuickTime time, falling back to file mtime).
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # Where it happened. Null when the file has no embedded GPS.
    lat: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True, index=True)
    # True when lat/lon was set (or overridden) via the app's placement tool.
    # Scanner skips overwriting lat/lon when this is set.
    location_manual: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    # Reverse-geocoded location (offline), populated for geotagged media.
    place: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    region: Mapped[str | None] = mapped_column(String, nullable=True)
    country_code: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)

    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)  # seconds, video
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Cached thumbnail filename (relative to the thumbnails dir), if generated.
    thumb_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # File mtime at index time, so re-scans can detect changes cheaply.
    file_mtime: Mapped[float | None] = mapped_column(Float, nullable=True)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Spherical/panoramic projection type, e.g. "equirectangular". Null for flat media.
    projection: Mapped[str | None] = mapped_column(String, nullable=True)

    # User annotations (set via PATCH /api/media/{id}).
    comment: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON array
    is_favourite: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    # Video codec (e.g. "hvc1", "avc1"); used to detect HEVC for transcoding.
    video_codec: Mapped[str | None] = mapped_column(String, nullable=True)
    # Filename (relative to data_dir/transcoded/) of the H.264 transcode, if created.
    transcode_path: Mapped[str | None] = mapped_column(String, nullable=True)
    # 64-char binary perceptual hash (DCT-based) computed from the thumbnail.
    phash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)


class Person(Base):
    """A named individual identified by face clustering."""

    __tablename__ = "people"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String)
    cover_thumb: Mapped[str | None] = mapped_column(String, nullable=True)


class Face(Base):
    """A single detected face crop within a Media item."""

    __tablename__ = "faces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    media_id: Mapped[int] = mapped_column(Integer, index=True)
    # Bounding box in detection-resolution coordinates (top, right, bottom, left).
    box_top: Mapped[int] = mapped_column(Integer, default=0)
    box_right: Mapped[int] = mapped_column(Integer, default=0)
    box_bottom: Mapped[int] = mapped_column(Integer, default=0)
    box_left: Mapped[int] = mapped_column(Integer, default=0)
    # 128-d face encoding as JSON array, or "[]" for a sentinel (no face found).
    encoding: Mapped[str] = mapped_column(String)
    # Assigned person after DBSCAN clustering.
    person_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    # Face-crop JPEG filename relative to data_dir/faces/.
    thumb_name: Mapped[str | None] = mapped_column(String, nullable=True)


class JournalEntry(Base):
    """One journal entry per calendar day, with rich-text body and a title."""

    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[str] = mapped_column(String(10), unique=True, index=True)  # "YYYY-MM-DD"
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)


class JournalMedia(Base):
    """Ordered list of media items attached to a journal entry (by date)."""

    __tablename__ = "journal_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[str] = mapped_column(String(10), index=True)
    media_id: Mapped[int] = mapped_column(Integer, index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)


class AlbumLabel(Base):
    """User-supplied name and tags for a day album within a cluster."""

    __tablename__ = "album_labels"

    cluster_key: Mapped[str] = mapped_column(String, primary_key=True)
    album_key: Mapped[str] = mapped_column(String, primary_key=True)  # "YYYY-MM-DD"
    label: Mapped[str | None] = mapped_column(String, nullable=True)
    tags: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON array
