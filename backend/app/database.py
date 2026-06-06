from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

settings = get_settings()

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    # Import models so they are registered on the metadata before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def migrate_db() -> None:
    """Apply lightweight migrations to existing databases."""
    with engine.connect() as conn:
        # Add annotation columns introduced later.
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(media)"))}
        for col, ddl in [
            ("comment", "TEXT"),
            ("tags", "TEXT"),
            ("projection", "TEXT"),
            ("is_favourite", "INTEGER NOT NULL DEFAULT 0"),
            ("video_codec", "TEXT"),
            ("transcode_path", "TEXT"),
            ("phash", "TEXT"),
            ("location_manual", "BOOLEAN NOT NULL DEFAULT 0"),
        ]:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE media ADD COLUMN {col} {ddl}"))

        # Null out Null-Island coordinates (lat≈0, lon≈0) written by cameras
        # that store zeroes when GPS has no fix.  Reverse-geocodes to Ghana.
        conn.execute(text(
            "UPDATE media SET lat = NULL, lon = NULL, place = NULL, "
            "region = NULL, country_code = NULL, country = NULL "
            "WHERE lat IS NOT NULL AND lon IS NOT NULL "
            "AND abs(lat) < 0.001 AND abs(lon) < 0.001"
        ))
        # Clear reverse-geocode labels for Northern Mariana Islands: the
        # reverse_geocoder KD-tree has a known bad match that places some
        # South-East Asian coordinates (e.g. Singapore) in Saipan/NMI.
        # Clearing the label lets a re-scan re-geocode them correctly with
        # the new distance-sanity check in geo.py.
        conn.execute(text(
            "UPDATE media SET place = NULL, region = NULL, "
            "country_code = NULL, country = NULL "
            "WHERE country_code = 'MP'"
        ))
        conn.commit()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
