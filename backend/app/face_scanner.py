"""Background face detection and clustering job."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
from collections import Counter
from pathlib import Path

import numpy as np
from PIL import Image
from sqlalchemy import select, update

from .config import get_settings
from .database import SessionLocal
from .models import Face, Media, Person

logger = logging.getLogger(__name__)
settings = get_settings()

_FACES_DIR = settings.data_dir / "faces"
_THUMB_DIR = settings.data_dir / "thumbnails"
_FACE_THUMB_SIZE = 120
_CLUSTER_THRESHOLD = 0.55  # average-linkage Euclidean distance threshold to merge clusters

_status: dict = {
    "state": "idle",
    "total": 0,
    "processed": 0,
    "detected": 0,
    "message": None,
}
_lock = threading.Lock()
_thread: threading.Thread | None = None


def get_status() -> dict:
    with _lock:
        return dict(_status)


def _set(**kw) -> None:
    with _lock:
        _status.update(kw)


def _crop_face(img: Image.Image, box: tuple) -> Image.Image:
    top, right, bottom, left = box
    h, w = bottom - top, right - left
    pad = int(max(h, w) * 0.3)
    l = max(0, left - pad)
    t = max(0, top - pad)
    r = min(img.width, right + pad)
    b = min(img.height, bottom + pad)
    return img.crop((l, t, r, b)).resize((_FACE_THUMB_SIZE, _FACE_THUMB_SIZE), Image.LANCZOS)


def _sentinel(media_id: int) -> Face:
    """Face row that marks an image as scanned but faceless."""
    return Face(media_id=media_id, box_top=0, box_right=0, box_bottom=0, box_left=0, encoding="[]")


def _ensure_pkg_resources() -> None:
    """Shim pkg_resources if setuptools isn't installed.

    face_recognition_models uses pkg_resources.resource_filename but
    setuptools (which provides it) is absent from python:3.12-slim. We
    inject a minimal replacement backed by importlib.resources so that
    face_recognition imports cleanly without needing setuptools at all.
    """
    try:
        import pkg_resources  # noqa: F401
        return
    except ImportError:
        pass
    import sys
    import types
    import importlib.resources as _ir

    _pkr = types.ModuleType("pkg_resources")

    def resource_filename(package_or_requirement, resource_name: str) -> str:
        pkg = package_or_requirement if isinstance(package_or_requirement, str) else package_or_requirement.__name__
        return str(_ir.files(pkg).joinpath(resource_name))

    _pkr.resource_filename = resource_filename  # type: ignore[attr-defined]
    sys.modules["pkg_resources"] = _pkr
    print("[face_scanner] pkg_resources shim installed", flush=True)


def _run_scan() -> None:
    print("[face_scanner] _run_scan started", flush=True)
    _ensure_pkg_resources()
    try:
        import face_recognition  # type: ignore[import]
        print("[face_scanner] face_recognition imported ok", flush=True)
    except (ImportError, SystemExit) as exc:
        msg = f"face_recognition failed to import: {exc}"
        print(f"[face_scanner] {msg}", flush=True)
        _set(state="error", message=msg)
        return
    except BaseException as exc:
        msg = f"face_recognition crashed on import: {exc}"
        print(f"[face_scanner] {msg}", flush=True)
        _set(state="error", message=msg)
        return

    try:
        _FACES_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[face_scanner] faces dir ok: {_FACES_DIR}", flush=True)
    except Exception as exc:
        msg = f"Cannot create faces directory: {exc}"
        print(f"[face_scanner] {msg}", flush=True)
        _set(state="error", message=msg)
        return

    db = None
    try:
        db = SessionLocal()
        print("[face_scanner] db session ok", flush=True)

        processed_ids = set(db.scalars(select(Face.media_id).distinct()).all())

        all_images = list(db.scalars(
            select(Media).where(Media.media_type == "image", Media.thumb_name.is_not(None))
        ).all())
        to_process = [m for m in all_images if m.id not in processed_ids]

        print(f"[face_scanner] {len(to_process)} images to scan (of {len(all_images)} total)", flush=True)
        _set(state="scanning", total=len(to_process), processed=0, detected=0, message=None)

        new_faces = 0
        for i, media in enumerate(to_process):
            _set(processed=i)
            if i % 500 == 0:
                print(f"[face_scanner] progress {i}/{len(to_process)}, faces so far: {new_faces}", flush=True)

            # Use the local thumbnail — much faster than opening the full-res original over NFS.
            src = _THUMB_DIR / media.thumb_name
            if not src.exists():
                db.add(_sentinel(media.id))
                db.commit()
                continue

            try:
                img = Image.open(src).convert("RGB")
                arr = np.array(img)

                locations = face_recognition.face_locations(arr, model="hog")

                if not locations:
                    db.add(_sentinel(media.id))
                    db.commit()
                    continue

                encodings = face_recognition.face_encodings(arr, locations)

                for (top, right, bottom, left), enc in zip(locations, encodings):
                    thumb_name = None
                    try:
                        crop = _crop_face(img, (top, right, bottom, left))
                        digest = hashlib.sha1(
                            f"{media.id}_{top}_{right}_{bottom}_{left}".encode()
                        ).hexdigest()[:12]
                        thumb_name = f"face_{digest}.jpg"
                        crop.save(_FACES_DIR / thumb_name, "JPEG", quality=85)
                    except Exception as e:
                        logger.debug("Crop save failed for media %d: %s", media.id, e)

                    db.add(Face(
                        media_id=media.id,
                        box_top=top, box_right=right, box_bottom=bottom, box_left=left,
                        encoding=json.dumps(enc.tolist()),
                        thumb_name=thumb_name,
                    ))
                    new_faces += 1

                db.commit()

            except Exception as e:
                logger.warning("Face detection failed for %s: %s", media.thumb_name, e)
                try:
                    db.add(_sentinel(media.id))
                    db.commit()
                except Exception:
                    db.rollback()

        _set(processed=len(to_process), detected=new_faces)
        _do_cluster(db)
        _set(state="done", message=f"Scanned {len(to_process)} images, found {new_faces} new faces")

    except Exception as e:
        import traceback
        print(f"[face_scanner] EXCEPTION: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        _set(state="error", message=str(e))
    finally:
        if db is not None:
            db.close()


def _do_cluster(db) -> None:
    """Cluster face encodings using AgglomerativeClustering with average linkage.

    Average linkage merges two groups when their AVERAGE pairwise distance is
    below _CLUSTER_THRESHOLD.  More robust than complete linkage (which splits
    the same person photographed under varying conditions) while still resisting
    the chain effect of single linkage / connected-components.
    Memory cost: O(n²) float32 ≈ n=10k → ~400 MB.
    """
    try:
        from sklearn.cluster import AgglomerativeClustering      # type: ignore[import]
        from sklearn.metrics.pairwise import euclidean_distances  # type: ignore[import]
    except ImportError:
        logger.warning("scikit-learn not installed; skipping clustering")
        return

    _set(state="clustering")

    faces = list(db.scalars(select(Face).where(Face.encoding != "[]")).all())
    if not faces:
        return

    people_by_id = {p.id: p for p in db.scalars(select(Person)).all()}

    ids = [f.id for f in faces]
    old_pids = [f.person_id for f in faces]
    matrix = np.array([json.loads(f.encoding) for f in faces], dtype=np.float32)

    n = len(matrix)
    if n == 1:
        labels = np.array([0])
    else:
        dist_matrix = euclidean_distances(matrix).astype(np.float32)
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=_CLUSTER_THRESHOLD,
            linkage="average",
            metric="precomputed",
        )
        labels = clustering.fit_predict(dist_matrix)

    unique_labels = sorted(set(lbl for lbl in labels if lbl >= 0))

    # Pass 1: exclusive majority-vote — each existing person_id claimed by at most one label.
    label_to_pid: dict[int, int] = {}
    claimed_pids: set[int] = set()

    for lbl in unique_labels:
        mask = [j for j, l in enumerate(labels) if l == lbl]
        old = [old_pids[j] for j in mask if old_pids[j] is not None]
        if old:
            best = Counter(old).most_common(1)[0][0]
            if best not in claimed_pids and best in people_by_id:
                label_to_pid[lbl] = best
                claimed_pids.add(best)

    # Pass 2: fragments — labels whose faces mostly belonged to an already-claimed person
    # (i.e. the algorithm split a previously-merged person) fold back into that person
    # rather than becoming a new unnamed cluster.
    for lbl in unique_labels:
        if lbl in label_to_pid:
            continue
        mask = [j for j, l in enumerate(labels) if l == lbl]
        old = [old_pids[j] for j in mask if old_pids[j] is not None]
        if old:
            best = Counter(old).most_common(1)[0][0]
            if best in people_by_id:
                label_to_pid[lbl] = best  # merge fragment back into existing person

    # Pass 3: genuinely new clusters get a fresh Person row.
    used_pids: set[int] = set(label_to_pid.values())
    next_num = (max(people_by_id.keys(), default=0) + 1)

    for lbl in unique_labels:
        if lbl not in label_to_pid:
            p = Person(name=f"Person {next_num}")
            db.add(p)
            db.flush()
            label_to_pid[lbl] = p.id
            used_pids.add(p.id)
            next_num += 1

    face_map = {f.id: f for f in faces}
    cover_assigned: set[int] = set()

    for fid, lbl in zip(ids, labels):
        f = face_map[fid]
        if lbl >= 0:
            pid = label_to_pid[lbl]
            f.person_id = pid
            if pid not in cover_assigned and f.thumb_name:
                person = db.get(Person, pid)
                if person:
                    person.cover_thumb = f.thumb_name
                cover_assigned.add(pid)
        else:
            f.person_id = None

    for pid in list(people_by_id.keys()):
        if pid not in used_pids:
            db.delete(people_by_id[pid])

    db.commit()


def reset_state() -> None:
    """Force the scanner back to idle — call this when resetting face data."""
    with _lock:
        _status.update({"state": "idle", "total": 0, "processed": 0, "detected": 0, "message": None})


def start_scan() -> dict:
    global _thread
    with _lock:
        thread_alive = _thread is not None and _thread.is_alive()
        if _status["state"] in ("scanning", "clustering") and thread_alive:
            return dict(_status)
        _status.update({"state": "scanning", "total": 0, "processed": 0, "detected": 0, "message": None})
    _thread = threading.Thread(target=_run_scan, daemon=True)
    _thread.start()
    return get_status()


def start_recluster() -> dict:
    global _thread
    with _lock:
        if _status["state"] in ("scanning", "clustering"):
            return dict(_status)
        _status.update({"state": "clustering", "total": 0, "processed": 0, "detected": 0, "message": None})

    def _run() -> None:
        db = None
        try:
            db = SessionLocal()
            _do_cluster(db)
            _set(state="done", message="Clustering complete")
        except Exception as e:
            logger.exception("Recluster failed")
            _set(state="error", message=str(e))
        finally:
            if db is not None:
                db.close()

    _thread = threading.Thread(target=_run, daemon=True)
    _thread.start()
    return get_status()
