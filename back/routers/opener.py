from storage.duckdb_storage import save_to_duckdb
from transform.transform import transform_data
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Dict, Any
import os
import logging
from openers import get_opener
from db.connection import get_conn
from utils.cache import clear_cache

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

        # Convert tip_radius to meters for internal processing
        processed_metadata = metadata.copy()
        if "tip_radius" in processed_metadata:
            tip_radius_input = float(processed_metadata["tip_radius"])
            unit = metadata.get("unit", "").lower()  # Get unit if provided (um, nm, m, etc.)
            
            # DEBUG: Log the input value to diagnose unit issues
            logger.info(f"DEBUG tip_radius conversion: input={tip_radius_input:.6e}, unit={unit}")
            
            # Convert based on explicit unit if provided, otherwise auto-detect
            if unit == "um" or unit == "μm" or unit == "micrometer" or unit == "micrometers":
                # Convert micrometers to meters: 1 um = 1e-6 m
                # BUT: if value is very small (< 1e-3), it's likely already in meters
                # (frontend might send value in meters but label with "um" for display)
                if tip_radius_input < 1e-3:
                    # Value is likely already in meters (e.g., 0.00001 m = 10 um)
                    logger.warning(f"tip_radius input ({tip_radius_input:.6e}) with unit '{unit}' is very small. "
                                 f"Assuming value is already in meters (not converting).")
                    processed_metadata["tip_radius"] = tip_radius_input
                else:
                    # Convert micrometers to meters: 1 um = 1e-6 m
                    processed_metadata["tip_radius"] = tip_radius_input * 1e-6
                    logger.info(f"tip_radius input ({tip_radius_input:.6e} {unit}) converted to {processed_metadata['tip_radius']:.6e} m")
            elif unit == "nm" or unit == "nanometer" or unit == "nanometers":
                # Convert nanometers to meters: 1 nm = 1e-9 m
                processed_metadata["tip_radius"] = tip_radius_input * 1e-9
                logger.info(f"tip_radius input ({tip_radius_input:.6e} {unit}) converted to {processed_metadata['tip_radius']:.6e} m")
            elif unit == "m" or unit == "meter" or unit == "meters":
                # Already in meters, use as-is
                processed_metadata["tip_radius"] = tip_radius_input
                logger.info(f"tip_radius input ({tip_radius_input:.6e} {unit}) already in meters, using as-is")
            else:
                # No unit specified or unknown unit - auto-detect based on value magnitude
                # Typical tip radii: 10-1000 nm = 1e-8 to 1e-6 m
                # If input is <= 1e-5, it's likely already in meters (covers up to 10 um = 1e-5 m)
                # If input is > 1e-5, it's likely in nanometers and needs conversion
                if tip_radius_input <= 1e-5:
                    # Already in meters (e.g., 1e-8 m = 10 nm, 1e-5 m = 10 um)
                    logger.info(f"tip_radius input ({tip_radius_input:.6e}, no unit) appears to be in meters, using as-is")
                    processed_metadata["tip_radius"] = tip_radius_input
                else:
                    # Assume nanometers, convert to meters
                    # e.g., 10 nm -> 1e-8 m, 100 nm -> 1e-7 m, 1000 nm -> 1e-6 m
                    logger.info(f"tip_radius input ({tip_radius_input:.6e}, no unit) assumed to be in nanometers, converting to meters")
                    processed_metadata["tip_radius"] = tip_radius_input * 1e-9  # Convert nm to m
            
            logger.info(f"DEBUG tip_radius after conversion: {processed_metadata['tip_radius']:.6e} m")

        if not opener.validate_metadata(processed_metadata):
            errors.append("Invalid or incomplete metadata")
            logger.error(f"Metadata validation failed: {processed_metadata}")
            raise ValueError("Invalid or incomplete metadata")
        logger.info("info2222")

        curves = opener.process(file_path, force_path, z_path, processed_metadata)
        logging.info("info2")

        transformed_curves = transform_data(curves)
        db_path = "data/experiment.db"
        save_to_duckdb(transformed_curves, db_path)
        logger.info(f"Saved {len(curves)} curves to DuckDB at {db_path}")
        
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
            "filename": file_path,
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