from fastapi import APIRouter, HTTPException

from .. import scanner
from ..schemas import ScanStatus

router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.post("", response_model=ScanStatus)
def trigger_scan() -> ScanStatus:
    if not scanner.start_scan():
        raise HTTPException(status_code=409, detail="A scan is already in progress.")
    return ScanStatus(**scanner.scan_state)


@router.get("/status", response_model=ScanStatus)
def scan_status() -> ScanStatus:
    return ScanStatus(**scanner.scan_state)


@router.post("/reset", response_model=ScanStatus)
def reset_index() -> ScanStatus:
    if not scanner.reset_index():
        raise HTTPException(status_code=409, detail="Cannot reset while a scan is running.")
    return ScanStatus(**scanner.scan_state)
