from storage.duckdb_storage import save_to_duckdb
from transform.transform import transform_data
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Dict, Any
import os
import logging
from openers import get_opener

SUPPORTED_EXTENSIONS = [".json", ".hdf5", ".csv", ".txt"]

def detect_file_type(file_path: str) -> str:
    """Detect the type of the input file based on its extension."""
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")
    return ext[1:]

router = APIRouter(prefix="/experiment", tags=["experiment"])  # Prefix for grouping related endpoints

logger = logging.getLogger(__name__)  # Or import a shared logger

@router.post("/load-experiment")  # Updated decorator to match the client's requested path
async def load_experiment_endpoint(file: UploadFile = File(...)):
    """Handle file upload and return file structure."""
    file_path = os.path.join("uploads", file.filename)
    os.makedirs("uploads", exist_ok=True)
    
    try:
        with open(file_path, "wb") as f:
            f.write(await file.read())

        file_type = detect_file_type(file_path)
        opener = get_opener(file_type)
        structure = opener.get_structure(file_path)

        logger.info(f"Loaded file structure for {file_path} (type: {file_type})")
        return {
            "status": "structure",
            "message": "Select dataset paths and metadata",
            "filename": file_path,
            "file_type": file_type,
            "structure": structure,
            "errors": []
        }
    except Exception as e:
        logger.error(f"Failed to process file {file.filename}: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to process file: {str(e)}",
            "filename": file.filename,
            "errors": [str(e)]
        })

@router.post("/process-file")
async def process_file_endpoint(data: Dict[str, Any]):
    """Process file with user-selected dataset paths and metadata."""
    file_path = data.get("file_path")
    file_type = data.get("file_type")
    force_path = data.get("force_path")
    z_path = data.get("z_path")
    metadata = data.get("metadata", {})
    errors = []
    logger.info(f"processing file structure for {file_path} (type: {file_type})")

    if not all([file_path, file_type, force_path, z_path]):
        errors.append("Missing file_path, file_type, force_path, or z_path")
        logger.error(f"Missing required fields: {errors}")
        raise HTTPException(status_code=400, detail={
            "status": "error",
            "message": "Missing required fields",
            "filename": file_path or "unknown",
            "errors": errors
        })
    try:
        opener = get_opener(file_type)
        logger.info("info22")

        if not opener.validate_metadata(metadata):
            errors.append("Invalid or incomplete metadata")
            logger.error(f"Metadata validation failed: {metadata}")
            raise ValueError("Invalid or incomplete metadata")
        logger.info("info2222")

        curves = opener.process(file_path, force_path, z_path, metadata)
        logging.info("info2")

        transformed_curves = transform_data(curves)
        db_path = "data/experiment.db"
        save_to_duckdb(transformed_curves, db_path)
        logger.info(f"Saved {len(curves)} curves to DuckDB at {db_path}")
        logging.info("info3")

        return {
            "status": "success",
            "message": f"{file_type.upper()} file processed",
            "curves": len(curves),
            "filename": file_path,
            "duckdb_status": "saved",
            "spring_constant": float(metadata.get("spring_constant", 0.1)),
            "tip_radius_um": float(metadata.get("tip_radius", 1e-6)) * 1e6,
            "errors": errors
        }
    except Exception as e:
        errors.append(str(e))
        logger.error(f"Failed to process file {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to process file: {str(e)}",
            "filename": file_path,
            "errors": errors
        })