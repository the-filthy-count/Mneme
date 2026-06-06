"""Background auto-scan scheduler.

Runs a daemon thread that wakes every 60 s, reads the current interval from
settings, and triggers a library scan when the interval has elapsed since the
last completed scan.  interval_hours == 0 disables auto-scanning.
"""

from __future__ import annotations

import threading
import time
from datetime import datetime, timedelta

from . import scanner, settings_store

_START = datetime.now()


def _loop() -> None:
    # Brief initial delay so the app is fully initialised before the first check.
    time.sleep(30)

    while True:
        try:
            data = settings_store.load()
            interval_h = int(data.get("scan_interval_hours", 24))

            if interval_h > 0:
                finished_at = scanner.scan_state.get("finished_at")
                reference = finished_at if finished_at is not None else _START
                due_at = reference + timedelta(hours=interval_h)

                if datetime.now() >= due_at:
                    scanner.start_scan()
        except Exception:  # noqa: BLE001 — never let the scheduler thread die
            pass

        time.sleep(60)


def start() -> None:
    threading.Thread(target=_loop, daemon=True, name="auto-scan").start()
