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
    
    # SoftMech-style export parameters
    export_type = data.get("export_type", "raw")  # raw, average, scatter
    dataset_type = data.get("dataset_type", "Force")  # Force, Elasticity, El from F, Force Model, Elasticity Model
    direction = data.get("direction", "V")  # V, H
    loose = data.get("loose", 100)  # 10-100
    
    # Get filters from request
    filters = data.get("filters", {})
    # Stores force model parameters (maxInd, minInd, poisson) used for Hertz fit calculations.
    force_model_params = data.get("force_model_params")
    
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

    # Validate SoftMech-style parameters
    if export_type not in ["raw", "average", "scatter"]:
        errors.append("export_type must be one of: raw, average, scatter")
    
    if export_type == "average":
        if dataset_type not in ["Force", "Elasticity", "El from F"]:
            errors.append("dataset_type must be one of: Force, Elasticity, El from F")
        if direction not in ["V", "H"]:
            errors.append("direction must be one of: V, H")
        if not isinstance(loose, int) or loose < 10 or loose > 100:
            errors.append("loose must be an integer between 10 and 100")
    
    if export_type == "scatter":
        if dataset_type not in ["Force Model", "Elasticity Model"]:
            errors.append("dataset_type must be one of: Force Model, Elasticity Model")

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

        # Validate metadata (skip for CSV exports with SoftMech-style metadata)
        if extension != "csv" or export_type == "raw":
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
        logger.info(f"Export type: {export_type}, Dataset type: {dataset_type}")
        os.makedirs(os.path.dirname(export_path), exist_ok=True)
        
        # Prepare kwargs with SoftMech-style parameters
        export_kwargs = {
            "dataset_path": data.get("dataset_path"),
            "level_names": level_names if level_names else None,
            "metadata_path": data.get("metadata_path", ""),
            "metadata": metadata,
            "softmech_metadata": data.get("softmech_metadata") or {},  # ✅ ADD THIS
            "export_type": export_type,
            "dataset_type": dataset_type,
            "direction": direction,
            "loose": loose,
            "filters": filters,  # Pass filters to the exporter
            "force_model_params": force_model_params,  # Pass force model parameters for Hertz fit calculations
            "elasticity_params": data.get("elasticity_params") or {},  # optional, but add
        }
        
        num_exported = exporter.export(
            db_path=db_path,
            output_path=export_path,
            curve_ids=converted_curve_ids,
            **export_kwargs
        )
        logger.info("exporter5")

        return {
            "status": "success",
            "message": f"Successfully exported {num_exported} curves",
            "export_path": export_path,
            "exported_curves": num_exported,
            "export_type": export_type,
            "dataset_type": dataset_type
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

@router.post("/calculate-softmech-metadata")
async def calculate_softmech_metadata(data: Dict[str, Any]):
    """Calculate SoftMech-style metadata for preview in frontend."""
    try:
        curve_ids = data.get("curve_ids", [])
        num_curves = data.get("num_curves")
        export_type = data.get("export_type", "raw")
        dataset_type = data.get("dataset_type", "Force")
        direction = data.get("direction", "V")
        loose = data.get("loose", 100)
        filters = data.get("filters", {})
        
        db_path = "data/experiment.db"
        
        # Convert curve_ids
        converted_curve_ids = None
        if curve_ids:
            converted_curve_ids = []
            for curve_id in curve_ids:
                match = re.match(r"curve(\d+)", curve_id)
                if match:
                    converted_curve_ids.append(int(match.group(1)))
        
        # Fetch curve_ids if num_curves is provided
        if not converted_curve_ids and num_curves is not None:
            with duckdb.connect(db_path) as conn:
                curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z LIMIT ?", (num_curves,)).fetchall()
                converted_curve_ids = [row[0] for row in curve_ids_result]
        
        if not converted_curve_ids:
            return {
                "status": "error",
                "message": "No curves found"
            }
        
        # Get exporter to access the metadata calculation method
        exporter = get_exporter("csv")
        
        # Get tip parameters from database
        with duckdb.connect(db_path) as conn:
            # Check if tip_angle column exists
            columns = conn.execute("DESCRIBE force_vs_z").fetchall()
            column_names = [col[0] for col in columns]
            
            if "tip_angle" in column_names:
                metadata_row = conn.execute("""
                    SELECT tip_geometry, tip_radius, tip_angle, spring_constant 
                    FROM force_vs_z LIMIT 1
                """).fetchone()
                tip_geometry, tip_radius, tip_angle, spring_constant = metadata_row or ("sphere", 1e-6, 30.0, 0.1)
            else:
                # tip_angle column doesn't exist, use default value
                metadata_row = conn.execute("""
                    SELECT tip_geometry, tip_radius, spring_constant 
                    FROM force_vs_z LIMIT 1
                """).fetchone()
                tip_geometry, tip_radius, spring_constant = metadata_row or ("sphere", 1e-6, 0.1)
                tip_angle = 30.0  # Default value
        
        # For now, return basic metadata. In a full implementation, you would:
        # 1. Fetch the actual curve data using fetch_curves_batch
        # 2. Calculate the averaged curves
        # 3. Use the _calculate_softmech_metadata method
        
        # This is a simplified version - in practice, you'd need to process the actual data
        # Validate and sanitize tip_geometry
        valid_tip_shapes = ['sphere', 'cylinder', 'cone', 'pyramid']
        if tip_geometry not in valid_tip_shapes:
            # If tip_geometry is invalid, default to sphere
            tip_geometry = 'sphere'
        
        calculated_metadata = {
            "direction": direction,
            "loose": loose,
            "tip_shape": tip_geometry,
            "tip_radius_nm": tip_radius * 1e9 if tip_geometry in ['sphere', 'cylinder'] and tip_radius else None,
            "tip_angle_deg": tip_angle if tip_geometry in ['cone', 'pyramid'] else None,
            "elastic_constant_nm": spring_constant,
            "average_hertz_modulus_pa": 0,  # Would be calculated from actual data
            "hertz_max_indentation_nm": 0   # Would be calculated from actual data
        }
        
        return {
            "status": "success",
            "calculated_metadata": calculated_metadata
        }
        
    except Exception as e:
        logger.error(f"Failed to calculate SoftMech metadata: {str(e)}")
        raise HTTPException(status_code=500, detail={
            "status": "error",
            "message": f"Failed to calculate metadata: {str(e)}"
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