"""
hdf5_ingest.py — Device B (cloud) receive side.

Adds two things to the existing hdf5_service.py setup:

  1. API-key middleware — all /hdf5/* routes require X-Api-Key header
  2. POST /hdf5/ingest — receives a raw .h5 file body, writes it to a temp
     file, parses it with h5py, and saves datasets to the DB.

Wire into main.py / main_pc.py:

    from hdf5_ingest import ingest_router, ApiKeyMiddleware

    app.add_middleware(ApiKeyMiddleware)       # protects /hdf5/* routes
    app.include_router(ingest_router)

Environment variables
─────────────────────
    DEVICE_B_API_KEY   shared secret that local_agent.py must send
                       default: "change-me"  (MUST be overridden in prod)
    HDF5_UPLOAD_DIR    where incoming files are saved before parsing
                       default: /tmp/hdf5_uploads
    HDF5_KEEP_UPLOADS  set to "1" to keep the raw file after parsing
                       default: files are removed after successful parse
"""

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY        = os.getenv("DEVICE_B_API_KEY", "change-me")
# Default to the OS temp dir so this works on every platform and every cloud
# host (Render, Railway, Fly, etc.) without setting any env vars.
# Override with HDF5_UPLOAD_DIR only when you want a persistent volume path.
_default_upload_dir = Path(tempfile.gettempdir()) / "hdf5_uploads"
UPLOAD_DIR     = Path(os.getenv("HDF5_UPLOAD_DIR", str(_default_upload_dir)))
KEEP_UPLOADS   = os.getenv("HDF5_KEEP_UPLOADS", "0") == "1"
MAX_UPLOAD_MB  = int(os.getenv("HDF5_MAX_UPLOAD_MB", "500"))


def _ensure_upload_dir() -> Path:
    """Create UPLOAD_DIR on first use instead of at import time.
    This prevents crashes during uvicorn module loading when the configured
    path doesn't exist yet (e.g. a Render deploy where the env var still
    points to a developer's local machine path).
    """
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        raise RuntimeError(
            f"Cannot create HDF5_UPLOAD_DIR={UPLOAD_DIR}. "
            "On cloud hosts set HDF5_UPLOAD_DIR to a writable path such as "
            "/tmp/hdf5_uploads or a mounted persistent disk."
        ) from exc
    return UPLOAD_DIR

ingest_router = APIRouter(prefix="/hdf5", tags=["HDF5 Ingest"])

# ---------------------------------------------------------------------------
# API-key middleware
# ---------------------------------------------------------------------------

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """
    Rejects any request to /hdf5/* that doesn't carry the correct
    X-Api-Key header.  All other routes are unaffected.

    Add to your app BEFORE include_router:
        app.add_middleware(ApiKeyMiddleware)
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/hdf5"):
            key = request.headers.get("X-Api-Key", "")
            if not key or key != API_KEY:
                log.warning(
                    "Rejected request — bad/missing API key  path=%s  ip=%s",
                    request.url.path,
                    request.client.host if request.client else "unknown",
                )
                return Response(
                    content='{"detail":"Unauthorized"}',
                    status_code=401,
                    media_type="application/json",
                )
        return await call_next(request)


# ---------------------------------------------------------------------------
# /hdf5/ingest — receive a raw file body, parse, save to DB
# ---------------------------------------------------------------------------

@ingest_router.post("/ingest", summary="Receive an HDF5 file from Device A")
async def ingest(request: Request):
    """
    Accepts a raw application/octet-stream body (the .h5 file).
    Filename is taken from the X-Filename header.

    Device A sends:
        POST /hdf5/ingest
        X-Api-Key: <secret>
        X-Filename: run001.h5
        Content-Type: application/octet-stream
        <binary HDF5 bytes>
    """
    from hdf5_db import Hdf5Repository, _session_factory   # import here to avoid circular deps
    from hdf5_watcher import _parse_hdf5

    filename = request.headers.get("X-Filename", "upload.h5")
    # Sanitise filename — no path traversal
    filename = Path(filename).name or "upload.h5"
    if not filename.endswith((".h5", ".hdf5")):
        raise HTTPException(status_code=400, detail="Only .h5 / .hdf5 files accepted")

    # Stream body to a temp file (avoids loading the whole file into RAM)
    upload_dir = _ensure_upload_dir()
    tmp_path = upload_dir / f"tmp_{os.getpid()}_{filename}"
    bytes_written = 0
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024

    try:
        with open(tmp_path, "wb") as fh:
            async for chunk in request.stream():
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    fh.close()
                    tmp_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_MB} MB",
                    )
                fh.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        log.exception("Error writing upload to disk")
        raise HTTPException(status_code=500, detail=f"Failed to receive file: {exc}")

    log.info("Received  file=%s  size=%.1f KB", filename, bytes_written / 1024)

    # Move to a stable name now that we have the full file
    final_path = upload_dir / filename
    # If a file with this name already exists, make it unique
    if final_path.exists():
        import time
        final_path = UPLOAD_DIR / f"{int(time.time())}_{filename}"
    tmp_path.rename(final_path)

    # Parse with h5py
    try:
        datasets = _parse_hdf5(final_path)
    except Exception as exc:
        log.error("Failed to parse %s: %s", filename, exc)
        if not KEEP_UPLOADS:
            final_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"HDF5 parse error: {exc}")

    dataset_count = sum(1 for k in datasets if not k.endswith(".__attrs__"))

    # Save to DB
    try:
        async with _session_factory() as session:
            repo = Hdf5Repository(session)
            if await repo.is_seen(str(final_path.resolve())):
                log.info("Duplicate upload ignored  file=%s", filename)
                if not KEEP_UPLOADS:
                    final_path.unlink(missing_ok=True)
                return JSONResponse({
                    "status":    "duplicate",
                    "filename":  filename,
                    "detail":    "File already processed",
                })
            row = await repo.save_file_result(final_path, datasets)
    except Exception as exc:
        log.exception("DB write failed for %s", filename)
        if not KEEP_UPLOADS:
            final_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not KEEP_UPLOADS:
        final_path.unlink(missing_ok=True)

    log.info("Ingest complete  file=%s  datasets=%d  db_id=%d", filename, dataset_count, row.id)
    return JSONResponse({
        "status":        "ok",
        "filename":      filename,
        "file_id":       row.id,
        "dataset_count": dataset_count,
        "size_bytes":    bytes_written,
    })


# ---------------------------------------------------------------------------
# /hdf5/ping — health check that Device A can use to verify connectivity
# ---------------------------------------------------------------------------

@ingest_router.get("/ping", summary="Connectivity check (requires API key)")
async def ping():
    return JSONResponse({"ok": True, "message": "Device B reachable"})