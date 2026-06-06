# Single Mneme image: build the React frontend, then serve it (and the API)
# from the FastAPI backend. One process, one port.

# --- stage 1: build the frontend ---
FROM node:20-alpine AS frontend
WORKDIR /web
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build   # -> /web/dist

# --- stage 2: compile Python deps (dlib/face_recognition needs cmake + BLAS) ---
FROM python:3.12-slim AS py-deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        cmake \
        libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
# setuptools must exist before face_recognition_models; it uses pkg_resources.
RUN pip install --no-cache-dir setuptools && \
    pip install --no-cache-dir -r requirements.txt

# --- stage 3: backend + bundled static UI ---
FROM python:3.12-slim

# exiftool: metadata (GPS + timestamps) for images and video.
# ffmpeg: video thumbnail frames + HEVC transcoding.
# libopenblas0: dlib runtime BLAS dependency.
# libgomp1: OpenMP runtime that dlib links against.
# libgfortran5: Fortran runtime needed by OpenBLAS.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libimage-exiftool-perl \
        ffmpeg \
        libopenblas0 \
        libgomp1 \
        libgfortran5 \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled Python packages from the builder stage.
COPY --from=py-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=py-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

WORKDIR /app

COPY backend/app ./app
COPY --from=frontend /web/dist ./static

ENV MNEME_MEDIA_DIR=/media \
    MNEME_DATA_DIR=/data \
    MNEME_STATIC_DIR=/app/static \
    PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
