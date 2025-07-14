from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from typing import Dict, Any, List
import os
import logging
import re
from pathlib import Path
import duckdb

from exporters import get_exporter  # Assuming exporters package similar to openers

router = APIRouter(prefix="", tags=["export"])

logger = logging.getLogger(__name__)

SUPPORTED_EXPORT_EXTENSIONS = ["hdf5", "json", "csv", "txt"]


# Sanitize file system paths
def sanitize_file_path(path: str) -> str:
    path = Path(path).resolve()
    if not path.is_relative_to(Path.cwd()):
        raise ValueError("Path outside allowed directory")
    return str(path)

@router.post("/export/{extension}")
async def export_endpoint(extension: str, data: Dict[str, Any]):
    """Export curves from DuckDB to a file with custom level names and metadata."""
    extension = extension.lower()
    if extension not in SUPPORTED_EXPORT_EXTENSIONS:
        raise HTTPException(status_code=400, detail={"status": "error", "message": f"Unsupported export extension: {extension}"})

    export_path = data.get("export_path")
    curve_ids = data.get("curve_ids", [])
    num_curves = data.get("num_curves")
    level_names = data.get("level_names", ["curve0", "segment0"])
    metadata = data.get("metadata", {})
    db_path = "data/experiment.db"
    errors = []

    # Validate export_path
    if not export_path:
        errors.append("Missing export_path")
        logger.error("Missing export_path")
        raise HTTPException(status_code=400, detail={"status": "error", "message": "Missing export_path", "errors": errors})

    # Validate extension matches the file_type
    if not export_path.lower().endswith("." + extension):
        errors.append(f"Export path must end with .{extension}")
        raise HTTPException(status_code=400, detail={"status": "error", "message": f"Invalid export path extension for {extension.upper()}", "errors": errors})

    try:
        # Sanitize file system path
        export_path = sanitize_file_path(export_path)

        exporter = get_exporter(extension)
        logger.info("exporter")
        # Convert curve_ids
        converted_curve_ids = None
        if curve_ids:
            converted_curve_ids = []
            for curve_id in curve_ids:
                match = re.match(r"curve(\d+)", curve_id)
                if not match:
                    errors.append(f"Invalid curve_id format: {curve_id}")
                    logger.error(f"Invalid curve_id: {curve_id}")
                    raise HTTPException(status_code=400, detail={"status": "error", "message": f"Invalid curve_id: {curve_id}", "errors": errors})
                converted_curve_ids.append(int(match.group(1)))
        logger.info("exporter2")

        # Fetch curve_ids if num_curves is provided
        if not converted_curve_ids and num_curves is not None:
            if not isinstance(num_curves, int) or num_curves <= 0:
                errors.append("num_curves must be a positive integer")
                raise HTTPException(status_code=400, detail={"status": "error", "message": "Invalid num_curves", "errors": errors})
            with duckdb.connect(db_path) as conn:
                curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)).fetchall()
                converted_curve_ids = [row[0] for row in curve_ids_result]
        logger.info("exporter3")

        # Validate level_names if provided
        if level_names and not all(isinstance(name, str) and name.strip() for name in level_names):
            errors.append("All level names must be non-empty strings")
            raise HTTPException(status_code=400, detail={"status": "error", "message": "Invalid level names", "errors": errors})

        # Validate metadata
        for key, value in metadata.items():
            if value and isinstance(value, str) and not value.strip():
                errors.append(f"Metadata field {key} cannot be empty")
        if errors:
            raise HTTPException(status_code=400, detail={
                "status": "error",
                "message": "Invalid metadata",
                "errors": errors
            })

        # Exporter-specific validation
        exporter.validate_params(data)
        logger.info("exporter4")

        logger.info(f"Starting {extension.upper()} export to {export_path} with {len(converted_curve_ids or [])} curves")
        os.makedirs(os.path.dirname(export_path), exist_ok=True)
        num_exported = exporter.export(
            db_path=db_path,
            output_path=export_path,
            curve_ids=converted_curve_ids,
            dataset_path=data.get("dataset_path"),
            level_names=level_names if level_names else None,
            metadata_path=data.get("metadata_path", ""),
            metadata=metadata
        )
        logger.info("exporter4")

        return {
            "status": "success",
            "message": f"Successfully exported {num_exported} curves",
            "export_path": export_path,
            "exported_curves": num_exported
        }
    except Exception as e:
        errors.append(str(e))
        logger.error(f"Failed to export to {extension.upper()}: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to export: {str(e)}",
            "export_path": export_path,
            "errors": errors
        })

@router.get("/exports/{file_path:path}")
async def serve_exported_file(file_path: str):
    """Serve an exported file from the exports directory."""
    # Strip leading 'exports/' if present to fix double prefix issue
    if file_path.startswith("exports/"):
        file_path = file_path[len("exports/"):]
    full_path = os.path.join("exports", file_path)
    logger.debug(f"Serving file: {full_path}")
    if not os.path.exists(full_path):
        logger.error(f"File not found: {full_path}")
        raise HTTPException(status_code=404, detail="File not found")
    # Sanitize the full path for security
    full_path = sanitize_file_path(full_path)
    return FileResponse(full_path, filename=os.path.basename(full_path))