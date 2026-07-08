"""
hdf5_ingest.py — Device B (cloud) receive side.

Receives a raw .h5 file from Device A, parses it with the existing
openers/transform/storage pipeline, and saves it into DuckDB.

Wire into main.py:

    from routers.hdf5_ingest import ingest_router, ApiKeyMiddleware

    app.add_middleware(ApiKeyMiddleware)
    app.include_router(ingest_router)

Environment variables (all optional)
─────────────────────────────────────
    DEVICE_B_API_KEY            shared secret sent in X-Api-Key header
                                default: "change-me"
    HDF5_UPLOAD_DIR             temp dir for incoming files (deleted after parse)
                                default: /tmp/hdf5_uploads
    HDF5_KEEP_UPLOADS           set to "1" to keep raw file after parsing
                                default: "0" (deleted)
    HDF5_MAX_UPLOAD_MB          max accepted file size
                                default: 500
    HDF5_INGEST_USER_ID         dataset owner id
                                default: 1
    HDF5_INGEST_SPRING_CONSTANT spring constant for metadata
                                default: 0.1
    HDF5_INGEST_TIP_GEOMETRY    tip geometry for metadata
                                default: sphere
    HDF5_INGEST_TIP_RADIUS      tip radius for metadata
                                default: 1e-6
"""

import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from openers import get_opener
from transform.transform import transform_data
from storage.duckdb_storage import save_to_duckdb
from db.datasets import create_dataset

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY       = os.getenv("DEVICE_B_API_KEY", "change-me")
_default_dir  = Path(tempfile.gettempdir()) / "hdf5_uploads"
UPLOAD_DIR    = Path(os.getenv("HDF5_UPLOAD_DIR", str(_default_dir)))
KEEP_UPLOADS  = os.getenv("HDF5_KEEP_UPLOADS", "0") == "1"
MAX_UPLOAD_MB = int(os.getenv("HDF5_MAX_UPLOAD_MB", "500"))

PUBLISHER_FORCE_PATH    = "curve0/segment0/Force"
PUBLISHER_Z_PATH        = "curve0/segment0/Z"
INGEST_USER_ID          = int(os.getenv("HDF5_INGEST_USER_ID", "1"))
INGEST_SPRING_CONSTANT  = float(os.getenv("HDF5_INGEST_SPRING_CONSTANT", "0.1"))
INGEST_TIP_GEOMETRY     = os.getenv("HDF5_INGEST_TIP_GEOMETRY", "sphere")
INGEST_TIP_RADIUS       = float(os.getenv("HDF5_INGEST_TIP_RADIUS", "1e-6"))
# Unit-calibration factors applied to raw Z/Force at ingestion (see hdf5.py's
# process_hdf5). Defaults are a no-op (1.0); set these for instruments whose
# raw export isn't already SI — e.g. the Aurora sensor exports Z in
# micrometers (HDF5_INGEST_Z_SCALE_TO_M=1e-6) and Force as raw voltage
# (HDF5_INGEST_FORCE_SCALE_TO_N=5e-5, i.e. 0.05 mN/V * 1e-3 N/mN).
INGEST_Z_SCALE_TO_M     = float(os.getenv("HDF5_INGEST_Z_SCALE_TO_M", "1.0"))
INGEST_FORCE_SCALE_TO_N = float(os.getenv("HDF5_INGEST_FORCE_SCALE_TO_N", "1.0"))

ingest_router = APIRouter(prefix="/hdf5", tags=["HDF5 Ingest"])

# ---------------------------------------------------------------------------
# API-key middleware
# ---------------------------------------------------------------------------

class ApiKeyMiddleware(BaseHTTPMiddleware):
    """
    Rejects any /hdf5/* request missing the correct X-Api-Key header.
    All other routes are unaffected.
    """
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
    """
    Accepts a raw application/octet-stream body (the .h5 file).
    Filename is taken from the X-Filename header.
    Parses and saves into DuckDB using the existing pipeline.
    """
    filename = Path(request.headers.get("X-Filename", "upload.h5")).name or "upload.h5"
    if not filename.endswith((".h5", ".hdf5")):
        raise HTTPException(status_code=400, detail="Only .h5 / .hdf5 files accepted")

    # Create upload dir lazily — never at import time
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path  = UPLOAD_DIR / f"tmp_{os.getpid()}_{filename}"
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    bytes_written = 0

    # Stream body to temp file
    try:
        with open(tmp_path, "wb") as fh:
            async for chunk in request.stream():
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    tmp_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File exceeds {MAX_UPLOAD_MB} MB limit",
                    )
                fh.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        tmp_path.unlink(missing_ok=True)
        log.exception("Error writing upload to disk")
        raise HTTPException(status_code=500, detail=f"Failed to receive file: {exc}")

    log.info("Received  file=%s  size=%.1f KB", filename, bytes_written / 1024)

    # Atomic rename to final path
    final_path = UPLOAD_DIR / filename
    if final_path.exists():
        import time
        final_path = UPLOAD_DIR / f"{int(time.time())}_{filename}"
    tmp_path.rename(final_path)

    resolved_path = str(final_path.resolve())
    ingest_metadata = {
        "file_id":         Path(filename).stem,
        "date":            str(int(final_path.stat().st_mtime)),
        "spring_constant": INGEST_SPRING_CONSTANT,
        "tip_geometry":    INGEST_TIP_GEOMETRY,
        "tip_radius":      INGEST_TIP_RADIUS,
        "z_scale_to_m":       INGEST_Z_SCALE_TO_M,
        "force_scale_to_n":   INGEST_FORCE_SCALE_TO_N,
    }

    try:
        hdf5_opener = get_opener("hdf5")
        if not hdf5_opener.validate_metadata(ingest_metadata):
            raise ValueError(f"Invalid ingest metadata: {ingest_metadata}")
        parsed_curves = hdf5_opener.process(
            resolved_path,
            PUBLISHER_FORCE_PATH,
            PUBLISHER_Z_PATH,
            ingest_metadata,
        )
        dataset_id = create_dataset(
            user_id=INGEST_USER_ID,
            name=Path(filename).stem,
            filename=resolved_path,
            num_curves=len(parsed_curves),
            spring_constant=ingest_metadata["spring_constant"],
            tip_radius=ingest_metadata["tip_radius"],
            tip_geometry=ingest_metadata["tip_geometry"],
            # Recorded for reference only — the conversion itself already happened
            # in process_hdf5 above, so z_values/force_values on disk are already SI.
            z_scale_to_m=ingest_metadata["z_scale_to_m"],
            force_scale_to_n=ingest_metadata["force_scale_to_n"],
        )
        transformed_curves = transform_data(parsed_curves)
        save_to_duckdb(transformed_curves, dataset_id)
    except Exception as exc:
        log.exception("Failed to parse/persist  file=%s", filename)
        if not KEEP_UPLOADS:
            final_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Ingest error: {exc}")

    if not KEEP_UPLOADS:
        final_path.unlink(missing_ok=True)

    log.info("Ingest complete  file=%s  dataset_id=%s  curves=%d",
             filename, dataset_id, len(parsed_curves))
    return JSONResponse({
        "status":        "ok",
        "filename":      filename,
        "dataset_id":    dataset_id,
        "curves":        len(parsed_curves),
        "size_bytes":    bytes_written,
    })

# ---------------------------------------------------------------------------
# /hdf5/ping
# ---------------------------------------------------------------------------

@ingest_router.get("/ping", summary="Connectivity check (requires API key)")
async def ping():
    return JSONResponse({"ok": True, "message": "Device B reachable"})