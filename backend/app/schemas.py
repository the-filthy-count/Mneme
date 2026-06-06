import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class MediaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    filename: str
    media_type: str
    mime: str | None
    taken_at: datetime | None
    lat: float | None
    lon: float | None
    place: str | None
    region: str | None
    country_code: str | None
    country: str | None
    width: int | None
    height: int | None
    duration: float | None
    size_bytes: int | None
    projection: str | None = None
    comment: str | None = None
    tags: list[str] | None = None
    is_favourite: bool = False

    @field_validator("is_favourite", mode="before")
    @classmethod
    def coerce_favourite(cls, v: object) -> bool:
        return bool(v) if v is not None else False

    @field_validator("tags", mode="before")
    @classmethod
    def parse_tags(cls, v: object) -> list[str] | None:
        if v is None:
            return None
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else []
            except (json.JSONDecodeError, ValueError):
                return []
        return v  # type: ignore[return-value]


class MediaPatch(BaseModel):
    comment: str | None = None
    tags: list[str] | None = None
    is_favourite: bool | None = None
    taken_at: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    clear_location: bool = False


class UnlocatedGroup(BaseModel):
    date: str        # "YYYY-MM-DD" or "no-date"
    label: str       # human-readable, e.g. "15 October 2017"
    count: int
    cover_id: int | None
    images: int = 0
    videos: int = 0
    panos: int = 0
    has_suggestion: bool = False


class UnlocatedItem(BaseModel):
    id: int
    filename: str
    path: str
    media_type: str
    thumb_name: str | None


class LocationSuggestion(BaseModel):
    lat: float
    lon: float
    place: str | None
    region: str | None
    country: str | None
    source: str          # "same_day" | "same_dir"
    source_label: str    # human-readable description


class GeoSearchResult(BaseModel):
    lat: float
    lon: float
    display_name: str
    place: str


class LocateRequest(BaseModel):
    date: str        # matches UnlocatedGroup.date
    lat: float
    lon: float


class GeocodeResult(BaseModel):
    place: str | None
    region: str | None
    country_code: str | None
    country: str | None


class HistogramBucket(BaseModel):
    start: datetime
    count: int


class Stats(BaseModel):
    total: int
    geotagged: int
    geotagged_filtered: int = 0
    images: int
    videos: int
    panos: int
    favourites: int = 0
    tag_count: int = 0
    min_date: datetime | None
    max_date: datetime | None
    histogram: list[HistogramBucket]


class TagCount(BaseModel):
    tag: str
    count: int


class PlaceOut(BaseModel):
    place: str | None
    region: str | None
    country: str | None
    country_code: str | None
    count: int
    lat: float
    lon: float


class ClusterOut(BaseModel):
    cluster_key: str
    lat: float
    lon: float
    count: int
    cover_id: int | None
    place: str | None
    region: str | None
    country: str | None


class AlbumOut(BaseModel):
    album_key: str        # "YYYY-MM-DD"
    label: str            # formatted date, e.g. "Monday, 8 June 2009"
    custom_label: str | None = None
    custom_tags: list[str] | None = None
    place: str | None = None
    region: str | None = None
    count: int
    cover_id: int | None
    date_from: datetime | None
    date_to: datetime | None
    favourite_count: int = 0
    location_manual: bool = False  # any media in this album was manually relocated


class RelocateRequest(BaseModel):
    date: str   # "YYYY-MM-DD"
    lat: float
    lon: float


class RemoveLocationRequest(BaseModel):
    date: str   # "YYYY-MM-DD"


class AlbumLabelUpdate(BaseModel):
    label: str | None = None
    tags: list[str] | None = None


class AlbumLabelOut(BaseModel):
    cluster_key: str
    album_key: str
    label: str | None
    tags: list[str] | None


class MapStyle(BaseModel):
    id: str
    label: str
    type: str
    url: str
    subdomains: str = "abc"
    attribution: str = ""


class CustomMap(BaseModel):
    id: str
    label: str
    url: str


class SettingsOut(BaseModel):
    map_style: str
    scan_roots: list[str]
    scan_interval_hours: int = 24
    protomaps_key: str = ""
    maptiler_key: str = ""
    custom_maps: list[CustomMap] = []


class SettingsUpdate(BaseModel):
    map_style: str | None = None
    scan_roots: list[str] | None = None
    scan_interval_hours: int | None = None
    protomaps_key: str | None = None
    maptiler_key: str | None = None
    custom_maps: list[CustomMap] | None = None


class DirEntry(BaseModel):
    name: str
    path: str


class FsListing(BaseModel):
    path: str
    parent: str | None
    dirs: list[DirEntry]


class ScanStatus(BaseModel):
    state: str  # "idle" | "scanning" | "done" | "error"
    total: int
    processed: int
    added: int
    updated: int
    removed: int
    message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None


class PersonOut(BaseModel):
    id: int
    name: str
    cover_thumb: str | None
    face_count: int = 0


class PersonRename(BaseModel):
    name: str


class PeopleMerge(BaseModel):
    target_id: int
    source_id: int


class FaceScanStatus(BaseModel):
    state: str  # "idle" | "scanning" | "clustering" | "done" | "error"
    total: int = 0
    processed: int = 0
    detected: int = 0
    message: str | None = None
