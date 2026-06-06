from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, overridable via MNEME_* environment variables."""

    model_config = SettingsConfigDict(env_prefix="MNEME_", env_file=".env", extra="ignore")

    # Directory containing the photo/video library (mounted read-only in Docker).
    media_dir: Path = Path("/media")
    # Root the directory browser / scan roots are confined to. Defaults to "/"
    # so any volume you mount into the container can be navigated and added in
    # Settings. (File serving stays restricted to the configured scan roots.)
    browse_root: Path = Path("/")
    # Writable directory for the SQLite db and generated thumbnails.
    data_dir: Path = Path("/data")
    # Built frontend (index.html + assets). Served by FastAPI in the single
    # combined image; absent in backend-only dev (then only the API runs).
    static_dir: Path = Path("/app/static")
    # Longest edge of generated thumbnails, in pixels.
    thumbnail_size: int = 512
    # Default basemap style id (see app/mapstyles.py).
    default_map_style: str = "esri-satellite"
    # CORS origins allowed to call the API (frontend dev server, etc.).
    cors_origins: list[str] = ["*"]

    @property
    def db_path(self) -> Path:
        return self.data_dir / "mneme.db"

    @property
    def thumb_dir(self) -> Path:
        return self.data_dir / "thumbnails"

    @property
    def settings_file(self) -> Path:
        return self.data_dir / "settings.json"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.thumb_dir.mkdir(parents=True, exist_ok=True)
    return settings
