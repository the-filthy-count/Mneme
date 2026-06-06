from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import init_db, migrate_db
from .routers import media, scan, settings as settings_router
from .routers import clusters, duplicates, faces, journal
from . import scheduler

settings = get_settings()

app = FastAPI(title="Mneme", description="A spatial-temporal map of lived experience.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan.router)
app.include_router(media.router)
app.include_router(clusters.router)
app.include_router(settings_router.router)
app.include_router(faces.router)
app.include_router(duplicates.router)
app.include_router(journal.router)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    migrate_db()
    scheduler.start()


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "media_dir": str(settings.media_dir)}


# Serve the built single-page frontend (when present in the combined image).
# Mounted last so it never shadows the /api routes or the docs. html=True
# serves index.html at "/" and static assets by path.
if settings.static_dir.is_dir():
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="ui")
