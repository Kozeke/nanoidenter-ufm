from storage.duckdb_storage import save_to_duckdb
from transform.transform import transform_data
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import Dict, Any
import os
import logging
from openers import get_opener
from db.connection import get_conn
from db.datasets import create_dataset, update_dataset
from utils.cache import clear_cache
from auth.dependencies import get_current_user

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
async def load_experiment_endpoint(file: UploadFile = File(...), user=Depends(get_current_user)):
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
async def process_file_endpoint(data: Dict[str, Any], user=Depends(get_current_user)):
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

        # tip_radius is always stored and processed in metres (SI units).
        # The UI field is labelled in metres, HDF5 files use SI units, and the
        # elasticity / contact-point UDFs all expect metres.  No conversion is
        # performed here – what the user submits is what is stored.
        processed_metadata = metadata.copy()
        if "tip_radius" in processed_metadata:
            tip_radius_input = float(processed_metadata["tip_radius"])
            processed_metadata["tip_radius"] = tip_radius_input
            logger.info(f"tip_radius received: {tip_radius_input:.6e} m (used as-is)")

        if not opener.validate_metadata(processed_metadata):
            errors.append("Invalid or incomplete metadata")
            logger.error(f"Metadata validation failed: {processed_metadata}")
            raise ValueError("Invalid or incomplete metadata")
        logger.info("info2222")

        curves = opener.process(file_path, force_path, z_path, processed_metadata)
        logging.info("info2")

        # Create dataset record
        # Use file_id from metadata as name if provided, otherwise use basename of file_path
        dataset_name = processed_metadata.get("file_id") or os.path.basename(file_path)
        dataset_id = create_dataset(
            user_id=user["id"],
            name=dataset_name,
            filename=file_path,
            num_curves=len(curves),
            spring_constant=processed_metadata.get("spring_constant"),
            tip_radius=processed_metadata.get("tip_radius"),
            tip_geometry=processed_metadata.get("tip_geometry"),
        )
        logger.info(f"Created dataset record with ID: {dataset_id}, name: {dataset_name}")
        logger.info(f"Created dataset record with ID: {dataset_id}")

        transformed_curves = transform_data(curves)
        save_to_duckdb(transformed_curves, dataset_id)
        logger.info(f"Saved {len(curves)} curves to DuckDB with dataset_id={dataset_id}")
        
        # Clear all caches since we're loading a new experiment
        # This ensures old cached contact points, indentations, and elspectra
        # from previous datasets don't interfere with the new data
        logger.info("Clearing cache for new experiment...")
        try:
            conn = get_conn()
            cache_results = clear_cache(conn)
            total_cleared = sum(v for v in cache_results.values() if v >= 0)
            logger.info(f"✅ Cache cleared: {total_cleared} total rows deleted")
            logger.info(f"   - Contact points: {cache_results.get('contact_points', 0)} rows")
            logger.info(f"   - Indentations: {cache_results.get('indentations', 0)} rows")
            logger.info(f"   - Elspectra: {cache_results.get('elspectra', 0)} rows")
        except Exception as cache_error:
            # Don't fail the whole operation if cache clearing fails
            logger.warning(f"⚠️  Failed to clear cache (non-critical): {cache_error}")
        
        logging.info("info3")

        return {
            "status": "success",
            "message": f"{file_type.upper()} file processed",
            "curves": len(curves),
            "filename": dataset_name,  # Return the custom name (from file_id) or basename
            "dataset_id": dataset_id,
            "duckdb_status": "saved",
            "spring_constant": float(metadata.get("spring_constant", 0.1)),
            # "tip_radius_um": float(metadata.get("tip_radius", 10)) / 1000,  # Convert nm to μm for display
            "tip_radius_um": float(metadata.get("tip_radius", 10)),
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