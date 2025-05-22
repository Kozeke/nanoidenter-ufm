import os
from typing import Dict, Any
from openers.hdf5_opener import HDF5Opener
from openers.json_opener import JSONOpener
from storage.duckdb_storage import save_to_duckdb
from transform.transform import transform_data

SUPPORTED_EXTENSIONS = [".json", ".hdf5"]

def detect_file_type(file_path: str) -> str:
    """Detect the type of the input file based on its extension."""
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}")
    return ext[1:]

def load_experiment(file_path: str, db_path: str = "data/experiment.db") -> Dict[str, Any]:
    """Load experiment data from a file, transform, and save to DuckDB."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    file_type = detect_file_type(file_path)
    opener = HDF5Opener() if file_type == "hdf5" else JSONOpener()
    curves = opener.open(file_path)
    
    # Apply transformations
    transformed_curves = transform_data(curves)
    
    # Save to DuckDB
    save_to_duckdb(transformed_curves, db_path)

    # Generate summary
    summary = {
        "status": "success",
        "message": "Experiment loaded",
        "curves": len(curves),
        "filename": file_path,
        "duckdb_status": "saved"
    }
    if curves:
        first_curve = next(iter(curves.values()))
        summary.update({
            "spring_constant": first_curve.spring_constant,
            "tip_radius_um": first_curve.tip_radius * 1e6
        })

    return summary