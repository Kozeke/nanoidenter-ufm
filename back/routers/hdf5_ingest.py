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
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from openers import get_opener
from transform.transform import transform_data
from storage.duckdb_storage import save_to_duckdb
from db.datasets import create_dataset

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY        = os.getenv("DEVICE_B_API_KEY", "change-me")
# Sets the default cloud-ingest storage path for received HDF5 files.
UPLOAD_DIR = Path(os.getenv("HDF5_UPLOAD_DIR", "/tmp/hdf5_uploads"))
KEEP_UPLOADS   = os.getenv("HDF5_KEEP_UPLOADS", "0") == "1"
MAX_UPLOAD_MB  = int(os.getenv("HDF5_MAX_UPLOAD_MB", "500"))
# Sets the dataset path for force values in publisher-generated HDF5 files.
PUBLISHER_FORCE_PATH = "curve0/segment0/Force"
# Sets the dataset path for displacement values in publisher-generated HDF5 files.
PUBLISHER_Z_PATH = "curve0/segment0/Z"
# Sets the fallback dataset owner id for API-key based ingest requests.
INGEST_USER_ID = int(os.getenv("HDF5_INGEST_USER_ID", "1"))
# Sets the default spring constant used for automated ingest metadata.
INGEST_SPRING_CONSTANT = float(os.getenv("HDF5_INGEST_SPRING_CONSTANT", "0.1"))
# Sets the default tip geometry used for automated ingest metadata.
INGEST_TIP_GEOMETRY = os.getenv("HDF5_INGEST_TIP_GEOMETRY", "sphere")
# Sets the default tip radius used for automated ingest metadata.
INGEST_TIP_RADIUS = float(os.getenv("HDF5_INGEST_TIP_RADIUS", "1e-6"))

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
tmp_path = UPLOAD_DIR / f"tmp_{os.getpid()}_{filename}"
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
    # Captures the incoming filename from the client metadata header.
    filename = request.headers.get("X-Filename", "upload.h5")
    # Sanitise filename — no path traversal
    filename = Path(filename).name or "upload.h5"
    if not filename.endswith((".h5", ".hdf5")):
        raise HTTPException(status_code=400, detail="Only .h5 / .hdf5 files accepted")

    # Stream body to a temp file (avoids loading the whole file into RAM)
    tmp_path = UPLOAD_DIR / f"tmp_{os.getpid()}_{filename}"
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
    final_path = UPLOAD_DIR / filename
    # If a file with this name already exists, make it unique
    if final_path.exists():
        import time
        final_path = UPLOAD_DIR / f"{int(time.time())}_{filename}"
    tmp_path.rename(final_path)

    # Keeps the absolute upload path for observability in API responses and logs.
    resolved_upload_path = str(final_path.resolve())
    # Defines metadata required by the HDF5 opener validation routine.
    ingest_metadata = {
        "file_id": Path(filename).stem,
        # Uses the saved upload file timestamp for deterministic metadata date.
        "date": str(int(final_path.stat().st_mtime)),
        "spring_constant": INGEST_SPRING_CONSTANT,
        "tip_geometry": INGEST_TIP_GEOMETRY,
        "tip_radius": INGEST_TIP_RADIUS,
    }

    try:
        # Selects the HDF5 opener implementation used in manual processing flow.
        hdf5_opener = get_opener("hdf5")
        # Validates metadata before attempting parse and transform.
        if not hdf5_opener.validate_metadata(ingest_metadata):
            raise ValueError(f"Invalid ingest metadata: {ingest_metadata}")
        # Parses force-curve content from publisher-defined Force and Z dataset paths.
        parsed_curves = hdf5_opener.process(
            resolved_upload_path,
            PUBLISHER_FORCE_PATH,
            PUBLISHER_Z_PATH,
            ingest_metadata,
        )
        # Creates a dataset record so parsed curves are linked in DuckDB.
        dataset_id = create_dataset(
            user_id=INGEST_USER_ID,
            name=Path(filename).stem,
            filename=resolved_upload_path,
            num_curves=len(parsed_curves),
            spring_constant=ingest_metadata["spring_constant"],
            tip_radius=ingest_metadata["tip_radius"],
            tip_geometry=ingest_metadata["tip_geometry"],
        )
        # Applies the standard transform step before saving into DuckDB.
        transformed_curves = transform_data(parsed_curves)
        # Persists transformed curve segments into the analytics DuckDB store.
        save_to_duckdb(transformed_curves, dataset_id)
    except Exception as exc:
        log.exception("Failed to parse and persist ingested file=%s", filename)
        if not KEEP_UPLOADS:
            final_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=f"Ingest parse/save error: {exc}")

    # Captures curve count for API response after successful parse and persistence.
    dataset_count = len(parsed_curves)
    log.info(
        "Ingest complete  file=%s  stored_path=%s  dataset_id=%s  curves=%s",
        filename,
        resolved_upload_path,
        dataset_id,
        dataset_count,
    )
    return JSONResponse({
        "status":        "ok",
        "filename":      filename,
        "stored_path":   resolved_upload_path,
        "dataset_id":    dataset_id,
        "dataset_count": dataset_count,
        "size_bytes":    bytes_written,
        "force_path":    PUBLISHER_FORCE_PATH,
        "z_path":        PUBLISHER_Z_PATH,
    })


# ---------------------------------------------------------------------------
# /hdf5/ping — health check that Device A can use to verify connectivity
# ---------------------------------------------------------------------------

@ingest_router.get("/ping", summary="Connectivity check (requires API key)")
async def ping():
    return JSONResponse({"ok": True, "message": "Device B reachable"})