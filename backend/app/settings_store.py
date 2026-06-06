"""Persisted, user-editable runtime settings (map style + scan roots).

Stored as JSON in DATA_DIR so it survives restarts. Distinct from config.py,
which holds deploy-time defaults from the environment.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from .config import get_settings
from .mapstyles import STYLE_IDS

_cfg = get_settings()
_lock = threading.Lock()


def _defaults() -> dict:
    return {
        "map_style": _cfg.default_map_style,
        "scan_roots": [str(_cfg.media_dir)],
        "scan_interval_hours": 24,
        "protomaps_key": "",
        "maptiler_key": "",
        "custom_maps": [],
    }


def load() -> dict:
    with _lock:
        data = _defaults()
        if _cfg.settings_file.exists():
            try:
                data.update(json.loads(_cfg.settings_file.read_text()))
            except (json.JSONDecodeError, OSError):
                pass
        # Sanitise.
        custom_ids = {m["id"] for m in data.get("custom_maps", []) if isinstance(m, dict) and "id" in m}
        if data.get("map_style") not in (STYLE_IDS | custom_ids):
            data["map_style"] = _cfg.default_map_style
        roots = data.get("scan_roots") or [str(_cfg.media_dir)]
        data["scan_roots"] = [str(r) for r in roots]
        return data


def save(updates: dict) -> dict:
    with _lock:
        data = _defaults()
        if _cfg.settings_file.exists():
            try:
                data.update(json.loads(_cfg.settings_file.read_text()))
            except (json.JSONDecodeError, OSError):
                pass
        if "map_style" in updates and updates["map_style"] in STYLE_IDS:
            data["map_style"] = updates["map_style"]
        if "scan_roots" in updates and isinstance(updates["scan_roots"], list):
            data["scan_roots"] = [str(r) for r in updates["scan_roots"]]
        if "scan_interval_hours" in updates:
            data["scan_interval_hours"] = max(0, int(updates["scan_interval_hours"]))
        if "protomaps_key" in updates:
            data["protomaps_key"] = str(updates["protomaps_key"] or "")
        if "maptiler_key" in updates:
            data["maptiler_key"] = str(updates["maptiler_key"] or "")
        if "custom_maps" in updates and isinstance(updates["custom_maps"], list):
            data["custom_maps"] = [
                {"id": str(m["id"]), "label": str(m["label"]), "url": str(m["url"])}
                for m in updates["custom_maps"]
                if isinstance(m, dict) and m.get("id") and m.get("label") and m.get("url")
            ]
        _cfg.settings_file.parent.mkdir(parents=True, exist_ok=True)
        _cfg.settings_file.write_text(json.dumps(data, indent=2))
        return data


def scan_roots() -> list[Path]:
    return [Path(r) for r in load()["scan_roots"]]
