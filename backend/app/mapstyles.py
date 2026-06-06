"""Available basemap styles."""

OSM_ATTR = "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
VERSATILES = "https://tiles.versatiles.org/assets/styles"
PROTOMAPS_ATTR = "&copy; <a href='https://protomaps.com'>Protomaps</a> &copy; OpenStreetMap contributors"
PROTOMAPS_BASE = "https://api.protomaps.com/styles/v5"

PROTOMAPS_THEMES = ["light", "dark", "white", "black", "grayscale"]
CARTO_ATTR = f"{OSM_ATTR} &copy; <a href='https://carto.com/'>CartoDB</a>"
ESRI_ATTR = "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
ESRI_BASE = "https://server.arcgisonline.com/ArcGIS/rest/services"

MAP_STYLES = [
    # ── Vector (VersaTiles / Shortbread schema) ──────────────────────────────
    {
        "id": "shortbread-eclipse",
        "label": "Eclipse (dark)",
        "type": "vector",
        "url": f"{VERSATILES}/eclipse/style.json",
    },
    {
        "id": "shortbread-colorful",
        "label": "Colorful",
        "type": "vector",
        "url": f"{VERSATILES}/colorful/style.json",
    },
    {
        "id": "shortbread-neutrino",
        "label": "Neutrino (minimal)",
        "type": "vector",
        "url": f"{VERSATILES}/neutrino/style.json",
    },
    {
        "id": "shortbread-graybeard",
        "label": "Graybeard",
        "type": "vector",
        "url": f"{VERSATILES}/graybeard/style.json",
    },
    # ── Raster — general ─────────────────────────────────────────────────────
    {
        "id": "osm-raster",
        "label": "OpenStreetMap",
        "type": "raster",
        "url": "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        "subdomains": "abc",
        "attribution": OSM_ATTR,
    },
    {
        "id": "osm-humanitarian",
        "label": "Humanitarian",
        "type": "raster",
        "url": "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
        "subdomains": "abc",
        "attribution": f"{OSM_ATTR} &mdash; Tiles by <a href='https://www.hotosm.org/'>HOT</a>",
    },
    {
        "id": "carto-dark",
        "label": "CartoDB Dark Matter",
        "type": "raster",
        "url": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "subdomains": "abcd",
        "attribution": CARTO_ATTR,
    },
    {
        "id": "carto-light",
        "label": "CartoDB Positron",
        "type": "raster",
        "url": "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "subdomains": "abcd",
        "attribution": CARTO_ATTR,
    },

    # ── Raster — specialist ───────────────────────────────────────────────────
    {
        "id": "cyclosm",
        "label": "CyclOSM",
        "type": "raster",
        "url": "https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png",
        "subdomains": "abc",
        "attribution": f"{OSM_ATTR} &mdash; <a href='https://www.cyclosm.org'>CyclOSM</a>",
    },
    {
        "id": "opentopomap",
        "label": "OpenTopoMap",
        "type": "raster",
        "url": "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        "subdomains": "",
        "attribution": f"{OSM_ATTR} &mdash; <a href='https://opentopomap.org'>OpenTopoMap</a>",
    },

    # ── Satellite — night ────────────────────────────────────────────────────
    {
        "id": "nasa-night",
        "label": "Earth at Night (NASA)",
        "type": "raster",
        "url": "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
        "subdomains": "",
        "attribution": "Imagery provided by services from the Global Imagery Browse Services (GIBS), operated by the NASA/GSFC/Earth Science Data and Information System (ESDIS) with funding provided by NASA/HQ.",
        "maxZoom": 8,
    },

    # ── Esri raster ───────────────────────────────────────────────────────────
    {
        "id": "esri-satellite",
        "label": "Satellite (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/World_Imagery/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": ESRI_ATTR,
    },
    {
        "id": "esri-topo",
        "label": "Topo (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/World_Topo_Map/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": ESRI_ATTR,
    },
    {
        "id": "esri-street",
        "label": "Street Map (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/World_Street_Map/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": ESRI_ATTR,
    },
    {
        "id": "esri-natgeo",
        "label": "National Geographic (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/NatGeo_World_Map/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": f"{ESRI_ATTR} &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC",
    },
    {
        "id": "esri-ocean",
        "label": "Ocean (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/Ocean/World_Ocean_Base/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": f"{ESRI_ATTR} &mdash; Sources: GEBCO, NOAA, CHS, OSU, UNH, CSUMB, National Geographic, DeLorme, NAVTEQ, Esri",
    },
    {
        "id": "esri-relief",
        "label": "Shaded Relief (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/World_Shaded_Relief/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": f"{ESRI_ATTR} &mdash; Source: Esri, USGS, NOAA",
    },
    {
        "id": "esri-physical",
        "label": "Physical Map (Esri)",
        "type": "raster",
        "url": f"{ESRI_BASE}/World_Physical_Map/MapServer/tile/{{z}}/{{y}}/{{x}}",
        "subdomains": "",
        "attribution": f"{ESRI_ATTR} &mdash; Source: US National Park Service",
    },
]

PROTOMAPS_STYLE_IDS = {f"protomaps-{t}" for t in PROTOMAPS_THEMES}

MAPTILER_ATTR = "&copy; <a href='https://www.maptiler.com/copyright/'>MapTiler</a> &copy; OpenStreetMap contributors"
MAPTILER_BASE = "https://api.maptiler.com/maps"
MAPTILER_THEMES = [
    ("streets-v2",    "Streets"),
    ("openstreetmap", "OpenStreetMap"),
    ("outdoor-v2",    "Outdoor"),
    ("topo-v2",       "Topo"),
    ("dataviz",       "Dataviz"),
    ("landscape",     "Landscape"),
    ("aquarelle",     "Aquarelle"),
    ("backdrop",      "Backdrop"),
    ("basic-v2",      "Base"),
    ("ocean",         "Ocean"),
    ("hybrid",        "Satellite Hybrid"),
    ("satellite",     "Satellite Plain"),
    ("toner-v2",      "Toner"),
    ("winter-v2",     "Winter"),
    ("bright-v2",     "Bright"),
]
MAPTILER_STYLE_IDS = {f"maptiler-{slug}" for slug, _ in MAPTILER_THEMES}

STYLE_IDS = {s["id"] for s in MAP_STYLES} | PROTOMAPS_STYLE_IDS | MAPTILER_STYLE_IDS


def protomaps_styles(key: str) -> list[dict]:
    return [
        {
            "id": f"protomaps-{t}",
            "label": f"{t.capitalize()} (Protomaps)",
            "type": "vector",
            "url": f"{PROTOMAPS_BASE}/{t}/en.json?key={key}",
            "attribution": PROTOMAPS_ATTR,
        }
        for t in PROTOMAPS_THEMES
    ]


def maptiler_styles(key: str) -> list[dict]:
    return [
        {
            "id": f"maptiler-{slug}",
            "label": f"{label} (MapTiler)",
            "type": "vector",
            "url": f"{MAPTILER_BASE}/{slug}/style.json?key={key}",
            "attribution": MAPTILER_ATTR,
        }
        for slug, label in MAPTILER_THEMES
    ]
