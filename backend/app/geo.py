"""Offline reverse-geocoding: coordinates -> (place, region, country).

Uses the `reverse_geocoder` package, which bundles a ~150k-city dataset and
runs entirely locally (no network, no API key). Country names come from
`pycountry`. The geocoder is loaded lazily and reused across calls.
"""

from __future__ import annotations

import math
import threading

import pycountry
import reverse_geocoder as rg

_geocoder: rg.RGeocoder | None = None
_lock = threading.Lock()

# Maximum acceptable distance between the query point and the matched city.
# The reverse_geocoder KD-tree occasionally returns absurd nearest-neighbour
# results (e.g. Singapore → Saipan, ~4 200 km).  Any match further than this
# is discarded so photos keep their coordinates but get no place label.
_MAX_MATCH_KM = 200


def _get_geocoder() -> rg.RGeocoder:
    global _geocoder
    if _geocoder is None:
        with _lock:
            if _geocoder is None:
                _geocoder = rg.RGeocoder(mode=1, verbose=False)
    return _geocoder


def _country_name(cc: str | None) -> str | None:
    if not cc:
        return None
    try:
        country = pycountry.countries.get(alpha_2=cc.upper())
        return country.name if country else cc
    except (KeyError, AttributeError):
        return cc


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(min(a, 1.0)))


def reverse_geocode(coords: list[tuple[float, float]]) -> list[dict]:
    """Resolve a batch of (lat, lon) tuples to location dicts.

    Returns a list aligned with the input. Empty input -> empty list.
    Each dict has: place, region, country_code, country.
    Results where the matched city is implausibly far from the query point
    are returned as all-None to avoid labelling Singapore as Saipan, etc.
    """
    if not coords:
        return []
    results = _get_geocoder().query(coords)
    out: list[dict] = []
    for (q_lat, q_lon), r in zip(coords, results):
        try:
            city_lat = float(r["lat"])
            city_lon = float(r["lon"])
            dist_km = _haversine_km(q_lat, q_lon, city_lat, city_lon)
        except (KeyError, TypeError, ValueError):
            dist_km = 0.0

        if dist_km > _MAX_MATCH_KM:
            out.append({"place": None, "region": None, "country_code": None, "country": None})
            continue

        cc = r.get("cc") or None
        out.append({
            "place": r.get("name") or None,
            "region": r.get("admin1") or None,
            "country_code": cc,
            "country": _country_name(cc),
        })
    return out
