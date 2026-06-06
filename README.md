# Mneme

> *your life rendered as a spatial-temporal map of lived experience*

Mneme is a personal memory system that maps your photos and videos across
**space** and **time**. Every moment is anchored to a place on an interactive
world map and a point on a continuous timeline. Instead of digging through
folders, you explore your memories by **zooming into a location** to see
everything you experienced there, or **scrubbing through time** to relive a
period of your life.

![architecture](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20Leaflet%2FMapLibre-5b9dd9)

---

## How it works

Mneme ships as a **single Docker image**: the FastAPI backend serves both the
API and the built React UI on one port.

```
                       ┌──────────────────────────────────┐
   your photo library  │       Mneme (one container)      │
   (mounted read-only) │                                  │
        /media  ─────▶  │  scanner ──▶ SQLite index        │
                       │   • exiftool: GPS + time          │
                       │   • reverse-geocode (offline)     │
                       │   • Pillow / ffmpeg: thumbs       │
                       │                                  │
                       │  FastAPI ──▶ /api  +  React UI    │
                       └──────────────────────────────────┘
```

- **Backend** (`backend/`) — FastAPI. Walks the configured library folders,
  uses **exiftool** to pull embedded GPS coordinates and capture timestamps
  from both photos and videos, **reverse-geocodes** coordinates to place names
  fully offline (`reverse_geocoder` + `pycountry`, no API key), generates
  thumbnails (Pillow for images, ffmpeg for video frames), stores everything in
  a SQLite index, and **serves the built frontend** as static files.
- **Frontend** (`frontend/`) — React + Vite, built into static assets that the
  backend serves. A **Shortbread vector** world map (free VersaTiles tiles via
  MapLibre-in-Leaflet) with clustered photo markers, a draggable **timeline**
  plus a **date picker** to filter the map in time, and a **Places** panel to
  fly to anywhere you've been. A **settings menu** lets you switch basemap
  styles and choose which library folders to index (browse any mounted volume,
  or add a folder by path).

Photos without GPS still appear on the timeline and in the counts — they're
simply not placed on the map.

### Map styles

The default basemap is the **Shortbread** OpenStreetMap vector schema, served
key-free by [VersaTiles](https://versatiles.org) and rendered with MapLibre GL
inside Leaflet (so marker clustering still works). Switch styles in Settings:
Eclipse (dark, default), Colorful, Graybeard, Neutrino, or a plain
OpenStreetMap raster fallback.

---

## Quick start

1. **Point Mneme at your library.** Copy the env template and edit it:

   ```bash
   cp .env.example .env
   # set MNEME_LIBRARY to the absolute path of your photos/videos
   ```

2. **Launch:**

   ```bash
   docker compose up --build
   ```

3. Open **http://localhost:6363** (or whatever `MNEME_PORT` you set).

> **Run without the source** — to use the prebuilt image instead of building
> locally, skip the clone and run:
> ```bash
> MNEME_LIBRARY=/path/to/photos docker compose -f docker-compose.pull.yml up -d
> ```
> (uses `thefilthycount/mneme:latest`; update with `… pull`).

4. Click **“Scan library”** in the sidebar. Progress shows live; when it
   finishes, your memories appear on the map and timeline.

Re-running a scan is incremental — unchanged files are skipped, new ones are
added, and deleted files drop out of the index.

### Try it with demo data

No library handy? Generate a set of geotagged sample photos that span several
cities and years:

```bash
# build the image, then write ~10 geotagged demo photos into ./sample-library
docker compose build
docker run --rm -v "$(pwd)/sample-library:/out" --entrypoint python mneme:latest -m app.demo /out
docker compose up
# then open the UI and click "Scan library"
```

(The default compose file mounts `./sample-library` when `MNEME_LIBRARY`
is unset, so the demo photos land there.)

---

## Configuration

| Variable          | Where           | Default            | Meaning                                   |
|-------------------|-----------------|--------------------|-------------------------------------------|
| `MNEME_LIBRARY`   | `.env` / compose| `./sample-library` | Host path to your library (mounted RO)    |
| `MNEME_PORT`      | `.env` / compose| `6363`             | Host port for the web UI                  |
| `MNEME_MEDIA_DIR` | backend env     | `/media`           | In-container library path                 |
| `MNEME_DATA_DIR`  | backend env     | `/data`            | In-container index + thumbnail cache      |
| `MNEME_BROWSE_ROOT` | backend env   | `/`                | Folder the settings directory-picker may navigate (file serving stays limited to scan roots) |
| `MNEME_THUMBNAIL_SIZE` | backend env| `512`              | Longest edge of generated thumbnails (px) |

Map style and the active scan directories are set in the **Settings** menu
(gear icon) and persist in the data volume.

The index and thumbnails live in the `mneme-data` Docker volume, so they
persist across restarts and rebuilds.

---

## Development (without Docker)

**Backend:**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# exiftool + ffmpeg must be on your PATH
MNEME_MEDIA_DIR=/path/to/photos MNEME_DATA_DIR=./data \
  uvicorn app.main:app --reload
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

---

## API

| Method | Path                         | Description                                  |
|--------|------------------------------|----------------------------------------------|
| `POST` | `/api/scan`                  | Start a background scan                       |
| `GET`  | `/api/scan/status`           | Live scan progress                            |
| `GET`  | `/api/media`                 | List media (filters: `start`, `end`, bbox)    |
| `GET`  | `/api/media/{id}`            | Single item metadata                          |
| `GET`  | `/api/media/{id}/thumbnail`  | Cached thumbnail                              |
| `GET`  | `/api/media/{id}/file`       | Original file                                 |
| `GET`  | `/api/stats`                 | Totals + monthly histogram for the timeline   |
| `GET`  | `/api/places`                | Geotagged media aggregated into named places  |
| `GET`  | `/api/settings`              | Current map style + scan directories          |
| `PUT`  | `/api/settings`              | Update map style / scan directories           |
| `GET`  | `/api/map-styles`            | Available basemap styles                       |
| `GET`  | `/api/fs`                    | Browse directories under the library root      |

Interactive docs at `http://localhost:6363/docs` while running.

---

## Roadmap ideas

- ~~Reverse-geocoding so places get human names~~ ✅ done (offline).
- ~~Selectable basemap styles + settable library folders~~ ✅ done (Settings).
- Trip detection — cluster moments in space+time into named journeys.
- Face/people grouping and search.
- Map ↔ timeline two-way brushing (drag a map region to filter the timeline).
- Place name search / filter the map by a chosen place.
