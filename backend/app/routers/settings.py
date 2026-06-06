from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from .. import settings_store
from ..config import get_settings
from ..mapstyles import MAP_STYLES, maptiler_styles, protomaps_styles
from ..schemas import DirEntry, FsListing, MapStyle, SettingsOut, SettingsUpdate

router = APIRouter(prefix="/api", tags=["settings"])
cfg = get_settings()


@router.get("/map-styles", response_model=list[MapStyle])
def map_styles() -> list[dict]:
    cfg = settings_store.load()
    styles = list(MAP_STYLES)
    if cfg.get("protomaps_key"):
        styles = protomaps_styles(cfg["protomaps_key"]) + styles
    if cfg.get("maptiler_key"):
        styles = maptiler_styles(cfg["maptiler_key"]) + styles
    for cm in reversed(cfg.get("custom_maps", [])):
        styles = [{"id": cm["id"], "label": cm["label"], "type": "vector", "url": cm["url"], "attribution": ""}] + styles
    return styles


@router.get("/settings", response_model=SettingsOut)
def get_settings_endpoint() -> dict:
    return settings_store.load()


@router.put("/settings", response_model=SettingsOut)
def update_settings(body: SettingsUpdate) -> dict:
    updates: dict = {}
    if body.map_style is not None:
        updates["map_style"] = body.map_style
    if body.scan_interval_hours is not None:
        updates["scan_interval_hours"] = body.scan_interval_hours
    if body.protomaps_key is not None:
        updates["protomaps_key"] = body.protomaps_key
    if body.maptiler_key is not None:
        updates["maptiler_key"] = body.maptiler_key
    if body.custom_maps is not None:
        updates["custom_maps"] = [m.model_dump() for m in body.custom_maps]
    if body.scan_roots is not None:
        # Each root must exist, be a directory, and sit under the browse root.
        cleaned: list[str] = []
        base = cfg.browse_root.resolve()
        for raw in body.scan_roots:
            p = Path(raw).resolve()
            if not p.is_dir():
                raise HTTPException(status_code=400, detail=f"Not a directory: {raw}")
            try:
                p.relative_to(base)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"Path must be inside {base}: {raw}",
                )
            cleaned.append(str(p))
        updates["scan_roots"] = cleaned or [str(cfg.media_dir)]
    return settings_store.save(updates)


@router.get("/fs", response_model=FsListing)
def browse(path: str | None = Query(None)) -> FsListing:
    """List sub-directories of `path`, confined to the browse root."""
    base = cfg.browse_root.resolve()
    target = Path(path).resolve() if path else base

    # Never allow escaping the browse root.
    try:
        target.relative_to(base)
    except ValueError:
        target = base
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Not a directory")

    dirs: list[DirEntry] = []
    try:
        for child in sorted(target.iterdir(), key=lambda c: c.name.lower()):
            if child.is_dir() and not child.name.startswith("."):
                dirs.append(DirEntry(name=child.name, path=str(child)))
    except OSError:
        pass

    parent = None
    if target != base:
        parent = str(target.parent)
    return FsListing(path=str(target), parent=parent, dirs=dirs)
