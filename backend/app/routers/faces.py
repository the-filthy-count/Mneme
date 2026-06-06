"""People and face-recognition endpoints."""
from pathlib import Path

import shutil

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from .. import face_scanner
from ..config import get_settings
from ..database import get_db
from ..models import Face, Media, Person
from ..schemas import FaceScanStatus, MediaOut, PeopleMerge, PersonOut, PersonRename

router = APIRouter(prefix="/api/faces", tags=["faces"])
settings = get_settings()

_FACES_DIR = settings.data_dir / "faces"


@router.get("/debug")
def face_debug() -> dict:
    """Diagnostic: import check, model file existence, live detection test."""
    import os
    face_scanner._ensure_pkg_resources()
    result: dict = {"status": face_scanner.get_status()}
    try:
        import face_recognition  # type: ignore[import]
        result["face_recognition"] = "ok"
    except (ImportError, SystemExit, BaseException) as e:
        result["face_recognition"] = str(e)
        return result
    try:
        import sklearn  # type: ignore[import]
        result["sklearn"] = "ok"
    except Exception as e:
        result["sklearn"] = str(e)

    # Check that dlib model files are present and readable.
    try:
        import face_recognition_models  # type: ignore[import]
        for attr in ("pose_predictor_model_location", "face_recognition_model_location", "cnn_face_detector_model_location"):
            path = getattr(face_recognition_models, attr)()
            result[attr] = {"path": path, "exists": os.path.isfile(path)}
    except Exception as e:
        result["model_check"] = str(e)

    # Live detection test: 100×100 black image should return zero faces without crashing.
    try:
        import numpy as np
        blank = np.zeros((100, 100, 3), dtype=np.uint8)
        locs = face_recognition.face_locations(blank, model="hog")
        result["detection_test"] = f"ok (found {len(locs)} faces in blank image)"
    except Exception as e:
        result["detection_test"] = f"FAILED: {e}"

    result["faces_dir"] = str(_FACES_DIR)
    result["faces_dir_exists"] = _FACES_DIR.exists()
    t = face_scanner._thread
    result["thread_alive"] = t is not None and t.is_alive()
    return result


@router.get("/stats")
def face_stats(db: Session = Depends(get_db)) -> dict:
    from sqlalchemy import distinct
    total_images = db.scalar(
        select(func.count(Media.id)).where(Media.media_type == "image")
    ) or 0
    scanned_images = db.scalar(
        select(func.count(distinct(Face.media_id)))
    ) or 0
    total_faces = db.scalar(
        select(func.count(Face.id)).where(Face.encoding != "[]")
    ) or 0
    total_people = db.scalar(select(func.count(Person.id))) or 0
    return {
        "total_images": total_images,
        "scanned_images": scanned_images,
        "total_faces": total_faces,
        "total_people": total_people,
    }


@router.post("/reset")
def reset_face_data(db: Session = Depends(get_db)) -> dict:
    """Delete all face rows, person rows, face thumbnail files, and reset scanner state."""
    face_scanner.reset_state()
    db.execute(delete(Face))
    db.execute(delete(Person))
    db.commit()
    if _FACES_DIR.exists():
        shutil.rmtree(_FACES_DIR)
    return {"reset": True}


@router.post("/scan", response_model=FaceScanStatus)
def trigger_face_scan() -> FaceScanStatus:
    return FaceScanStatus(**face_scanner.start_scan())


@router.get("/scan/status", response_model=FaceScanStatus)
def face_scan_status() -> FaceScanStatus:
    return FaceScanStatus(**face_scanner.get_status())


@router.post("/cluster", response_model=FaceScanStatus)
def trigger_recluster() -> FaceScanStatus:
    return FaceScanStatus(**face_scanner.start_recluster())


@router.get("/thumbnail/{filename}")
def face_thumbnail(filename: str) -> FileResponse:
    if "/" in filename or "\\" in filename or not filename.endswith(".jpg"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    path = _FACES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(str(path), media_type="image/jpeg")


@router.get("/people", response_model=list[PersonOut])
def list_people(db: Session = Depends(get_db)) -> list[PersonOut]:
    counts = dict(db.execute(
        select(Face.person_id, func.count(Face.id).label("cnt"))
        .where(Face.person_id.is_not(None), Face.encoding != "[]")
        .group_by(Face.person_id)
    ).all())
    people = list(db.scalars(select(Person)).all())
    return sorted(
        [PersonOut(id=p.id, name=p.name, cover_thumb=p.cover_thumb, face_count=counts.get(p.id, 0))
         for p in people if counts.get(p.id, 0) > 0],
        key=lambda p: p.face_count,
        reverse=True,
    )


@router.get("/people/{person_id}/faces")
def list_person_faces(person_id: int, db: Session = Depends(get_db)) -> list[dict]:
    if db.get(Person, person_id) is None:
        raise HTTPException(status_code=404, detail="Not found")
    faces = list(db.scalars(
        select(Face).where(Face.person_id == person_id, Face.encoding != "[]")
    ).all())
    return [{"id": f.id, "media_id": f.media_id, "thumb_name": f.thumb_name} for f in faces]


@router.get("/people/{person_id}/media", response_model=list[MediaOut])
def list_person_media(person_id: int, db: Session = Depends(get_db)) -> list[Media]:
    if db.get(Person, person_id) is None:
        raise HTTPException(status_code=404, detail="Not found")
    media_ids = list(db.scalars(
        select(Face.media_id).where(Face.person_id == person_id, Face.encoding != "[]").distinct()
    ).all())
    if not media_ids:
        return []
    return list(db.scalars(
        select(Media).where(Media.id.in_(media_ids)).order_by(Media.taken_at)
    ).all())


@router.patch("/people/{person_id}", response_model=PersonOut)
def rename_person(person_id: int, body: PersonRename, db: Session = Depends(get_db)) -> PersonOut:
    person = db.get(Person, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="Not found")
    person.name = body.name.strip()
    db.commit()
    face_count = db.scalar(
        select(func.count(Face.id)).where(Face.person_id == person_id, Face.encoding != "[]")
    ) or 0
    return PersonOut(id=person.id, name=person.name, cover_thumb=person.cover_thumb, face_count=face_count)


@router.post("/people/merge")
def merge_people(body: PeopleMerge, db: Session = Depends(get_db)) -> dict:
    """Reassign all faces from source_id to target_id, then delete source."""
    if body.target_id == body.source_id:
        raise HTTPException(status_code=400, detail="target_id and source_id must differ")
    target = db.get(Person, body.target_id)
    source = db.get(Person, body.source_id)
    if not target or not source:
        raise HTTPException(status_code=404, detail="Person not found")
    db.execute(update(Face).where(Face.person_id == body.source_id).values(person_id=body.target_id))
    db.delete(source)
    db.commit()
    return {"merged": True, "target_id": body.target_id}
