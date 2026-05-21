"""
hdf5_ingest.py — Device B (cloud) receive side.

Completely standalone — no hdf5_db, no hdf5_watcher, no SQLAlchemy.
Receives the raw .h5 file from Device A and saves it to disk.

Wire into main.py:

    from routers.hdf5_ingest import ingest_router, ApiKeyMiddleware

    app.add_middleware(ApiKeyMiddleware)
    app.include_router(ingest_router)

Environment variables (all optional)
─────────────────────────────────────
    DEVICE_B_API_KEY   shared secret Device A sends in X-Api-Key header
                       default: "change-me"
    HDF5_SAVE_DIR      where received files are stored permanently
                       default: data/barytech  (relative to working dir)
    HDF5_MAX_MB        max accepted file size in MB
                       default: 500
"""

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY      = os.getenv("DEVICE_B_API_KEY", "change-me")
SAVE_DIR     = Path(os.getenv("HDF5_SAVE_DIR", "data/barytech"))
MAX_MB       = int(os.getenv("HDF5_MAX_MB", "500"))
MAX_BYTES    = MAX_MB * 1024 * 1024

ingest_router = APIRouter(prefix="/hdf5", tags=["HDF5 Ingest"])

# ---------------------------------------------------------------------------
# API-key middleware
# ---------------------------------------------------------------------------

class ApiKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/hdf5"):
            if request.headers.get("X-Api-Key", "") != API_KEY:
                log.warning("Rejected — bad API key  ip=%s  path=%s",
                            request.client.host if request.client else "?",
                            request.url.path)
                return Response('{"detail":"Unauthorized"}', status_code=401,
                                media_type="application/json")
        return await call_next(request)

# ---------------------------------------------------------------------------
# /hdf5/ingest
# ---------------------------------------------------------------------------

@ingest_router.post("/ingest", summary="Receive an HDF5 file from Device A")
async def ingest(request: Request):
    filename = Path(request.headers.get("X-Filename", "upload.h5")).name or "upload.h5"
    if not filename.endswith((".h5", ".hdf5")):
        return JSONResponse({"detail": "Only .h5/.hdf5 files accepted"}, status_code=400)

    # Create save dir lazily — safe on any host
    try:
        SAVE_DIR.mkdir(parents=True, exist_ok=True)
    except PermissionError as exc:
        log.error("Cannot create save dir %s: %s", SAVE_DIR, exc)
        return JSONResponse({"detail": f"Server misconfiguration: {exc}"}, status_code=500)

    # Stream body → temp file, then rename atomically
    tmp = SAVE_DIR / f".tmp_{os.getpid()}_{filename}"
    bytes_written = 0
    try:
        with open(tmp, "wb") as fh:
            async for chunk in request.stream():
                bytes_written += len(chunk)
                if bytes_written > MAX_BYTES:
                    tmp.unlink(missing_ok=True)
                    return JSONResponse(
                        {"detail": f"File exceeds {MAX_MB} MB limit"}, status_code=413
                    )
                fh.write(chunk)
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        log.exception("Error writing upload")
        return JSONResponse({"detail": f"Write error: {exc}"}, status_code=500)

    # Make final path unique if file already exists
    final = SAVE_DIR / filename
    if final.exists():
        import time
        final = SAVE_DIR / f"{int(time.time())}_{filename}"

    tmp.rename(final)
    log.info("Saved  file=%s  size=%.1f KB  path=%s", filename, bytes_written / 1024, final)

    return JSONResponse({
        "status":      "ok",
        "filename":    filename,
        "size_bytes":  bytes_written,
        "saved_to":    str(final),
    })

# ---------------------------------------------------------------------------
# /hdf5/ping — connectivity check
# ---------------------------------------------------------------------------

@ingest_router.get("/ping", summary="Connectivity check")
async def ping():
    return JSONResponse({"ok": True, "message": "Device B reachable"})