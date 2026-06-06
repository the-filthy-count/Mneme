"""Generate a small set of geotagged demo photos for trying Mneme.

Run inside the backend container (it has Pillow + exiftool):

    docker compose run --rm --entrypoint python backend -m app.demo /media
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# (label, lat, lon, "YYYY:MM:DD HH:MM:SS", background color)
PLACES = [
    ("Lisbon", 38.7223, -9.1393, "2019:06:14 11:20:00", (216, 122, 74)),
    ("Lisbon — Belém", 38.6979, -9.2065, "2019:06:15 16:05:00", (224, 160, 96)),
    ("Reykjavík", 64.1466, -21.9426, "2020:02:08 13:40:00", (96, 150, 196)),
    ("Kyoto", 35.0116, 135.7681, "2021:04:03 09:15:00", (196, 110, 150)),
    ("Kyoto — Arashiyama", 35.0094, 135.6669, "2021:04:04 07:50:00", (120, 168, 110)),
    ("New York", 40.7128, -74.0060, "2022:11:22 18:30:00", (90, 100, 130)),
    ("Cape Town", -33.9249, 18.4241, "2023:01:09 12:10:00", (210, 150, 70)),
    ("Sydney", -33.8688, 151.2093, "2023:12:27 19:45:00", (80, 160, 180)),
    ("Patagonia", -50.9423, -73.4068, "2024:03:18 08:05:00", (130, 170, 200)),
    ("Marrakech", 31.6295, -7.9811, "2024:09:30 17:20:00", (200, 120, 80)),
]


def _make_image(path: Path, label: str, color: tuple[int, int, int]) -> None:
    img = Image.new("RGB", (1200, 800), color)
    draw = ImageDraw.Draw(img)
    # Simple gradient overlay for a photo-ish look.
    for y in range(800):
        alpha = int(60 * (y / 800))
        draw.line([(0, y), (1200, y)], fill=(max(color[0] - alpha, 0),
                                             max(color[1] - alpha, 0),
                                             max(color[2] - alpha, 0)))
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64)
    except OSError:
        font = ImageFont.load_default()
    draw.text((60, 660), label, fill=(255, 255, 255), font=font)
    img.save(path, "JPEG", quality=88)


def _tag(path: Path, lat: float, lon: float, when: str) -> None:
    subprocess.run(
        [
            "exiftool", "-overwrite_original", "-q",
            f"-DateTimeOriginal={when}",
            f"-CreateDate={when}",
            f"-GPSLatitude={abs(lat)}",
            f"-GPSLatitudeRef={'N' if lat >= 0 else 'S'}",
            f"-GPSLongitude={abs(lon)}",
            f"-GPSLongitudeRef={'E' if lon >= 0 else 'W'}",
            str(path),
        ],
        check=False,
    )


def main(dest: str) -> None:
    out = Path(dest)
    out.mkdir(parents=True, exist_ok=True)
    for i, (label, lat, lon, when, color) in enumerate(PLACES):
        safe = label.replace(" ", "_").replace("—", "-")
        path = out / f"{i:02d}_{safe}.jpg"
        _make_image(path, label, color)
        _tag(path, lat, lon, when)
        print(f"wrote {path.name}  ({lat:.4f}, {lon:.4f})  {when}")
    print(f"\nDone — {len(PLACES)} demo photos in {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/media")
