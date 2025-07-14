import numpy as np
from typing import Dict, List, Any
from models.force_curve import ForceCurve, Segment
import os  # If needed for file validation
import logging
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("json_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)
def get_json_structure(json_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract JSON dataset structure as a nested dictionary for frontend display."""
    if "datasets" not in json_data:
        raise ValueError("JSON file must contain a 'datasets' key")

    structure = {"groups": {}, "datasets": [], "attributes": {}}

    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias:
            continue
        # Normalize alias by removing leading/trailing slashes
        alias = alias.strip("/")
        parts = alias.split("/")
        current = structure["groups"]
        path = ""

        # Build group hierarchy and collect datasets/attributes
        for i, part in enumerate(parts):
            path = f"{path}/{part}" if path else part
            if i == len(parts) - 1:
                # Dataset (e.g., Force, Z, or tip)
                if part in ["Force", "Z"] or part == "tip":
                    shape = [len(dataset.get("value", []))] if dataset.get("value") else [0]
                    dtype = "float64" if dataset.get("value") else "unknown"
                    dataset_info = {
                        "path": path,
                        "name": part,
                        "shape": shape,
                        "dtype": dtype,
                        "attributes": {}
                    }
                    # Collect attributes
                    for attr in dataset.get("attributes", []):
                        attr_name = attr.get("name")
                        attr_value = attr.get("value")
                        try:
                            if isinstance(attr_value, (list, tuple)):
                                attr_value = np.array(attr_value).tolist()
                            elif isinstance(attr_value, (int, float)):
                                pass
                            elif isinstance(attr_value, bytes):
                                attr_value = attr_value.decode('utf-8')
                            elif isinstance(attr_value, str):
                                pass
                            dataset_info["attributes"][attr_name] = attr_value
                        except Exception as e:
                            logger.warning(f"Skipping attribute {attr_name} at {path}: {e}")
                    current.setdefault("datasets", []).append(dataset_info)
            else:
                # Group (e.g., curve0, segment0)
                if part not in current:
                    current[part] = {"groups": {}, "datasets": [], "attributes": {}}
                current = current[part]["groups"]

    return structure

def validate_data(data: List[float], path: str) -> None:
    """Validate that data is non-empty and can be converted to 1D numpy array."""
    if not isinstance(data, list) or not data:
        raise ValueError(f"Data at {path} is empty or not a list")
    try:
        np_array = np.array(data)
        if len(np_array.shape) != 1:
            raise ValueError(f"Data at {path} must be 1D, got shape {np_array.shape}")
    except Exception as e:
        raise ValueError(f"Invalid data at {path}: {e}")

def process_json(file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    """Process all curves in JSON file with validation and error handling."""
    # Validate file
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise ValueError(f"File not found: {file_path}")
    
    try:
        with open(file_path, "r") as f:
            json_data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to load JSON file {file_path}: {e}")
        raise ValueError(f"Failed to load JSON file: {e}")
    
    if "datasets" not in json_data:
        logger.error("JSON file must contain a 'datasets' key")
        raise ValueError("JSON file must contain a 'datasets' key")

    curves = {}
    # Extract curve names (e.g., curve0, curve1)
    curve_names = set()
    for dataset_id, dataset in json_data["datasets"].items():
        alias = dataset.get("alias", [""])[0]
        if not alias:
            continue
        # Normalize alias
        alias = alias.strip("/")
        parts = alias.split("/")
        if len(parts) >= 1:
            curve_names.add(parts[0])

    if not curve_names:
        logger.error("No curve groups found in JSON")
        raise ValueError("No curve groups found in JSON")

    logger.info(f"Curve names: {curve_names}")

    # Extract curve name from force_path or z_path
    normalized_force_path = force_path.strip("/")
    normalized_z_path = z_path.strip("/")
    force_parts = normalized_force_path.split("/")
    z_parts = normalized_z_path.split("/")
    
    if len(force_parts) < 3 or len(z_parts) < 3:
        logger.error(f"Invalid path format. Expected curveX/segmentY/Force, got {force_path} and {z_path}")
        raise ValueError(f"Invalid path format. Expected curveX/segmentY/Force, got {force_path} and {z_path}")

    sample_curve_name = force_parts[0]
    if sample_curve_name != z_parts[0]:
        logger.error(f"Force and Z paths must belong to the same curve group. Got {force_path} and {z_path}")
        raise ValueError(f"Force and Z paths must belong to the same curve group. Got {force_path} and {z_path}")
    
    if sample_curve_name not in curve_names:
        logger.error(f"Selected curve group {sample_curve_name} not found in JSON data")
        raise ValueError(f"Selected curve group {sample_curve_name} not found in JSON data")

    logger.info(f"Sample curve name: {sample_curve_name}")
    logger.info(f"Force path: {force_path}, Z path: {z_path}")

    # Validate paths belong to the same curve group
    if not (normalized_force_path.startswith(f"{sample_curve_name}/") and normalized_z_path.startswith(f"{sample_curve_name}/")):
        logger.error(f"Selected paths must belong to a curve group. Expected paths starting with {sample_curve_name}/, got {force_path} and {z_path}")
        raise ValueError(f"Selected paths must belong to a curve group. Expected paths starting with {sample_curve_name}/, got {force_path} and {z_path}")

    force_relative_path = normalized_force_path[len(sample_curve_name) + 1:]  # e.g., segment0/Force
    z_relative_path = normalized_z_path[len(sample_curve_name) + 1:]         # e.g., segment0/Z
    logger.info(f"Force relative path: {force_relative_path}, Z relative path: {z_relative_path}")

    # Process each curve
    for curve_name in curve_names:
        try:
            # Normalize curve name
            curve_name = curve_name.strip("/")
            # Find Force and Z datasets
            force_data = None
            z_data = None
            for dataset_id, dataset in json_data["datasets"].items():
                alias = dataset.get("alias", [""])[0].strip("/")
                if alias == f"{curve_name}/{force_relative_path}":
                    force_data = dataset.get("value", [])
                elif alias == f"{curve_name}/{z_relative_path}":
                    z_data = dataset.get("value", [])

            if force_data is None or z_data is None:
                logger.warning(f"Skipping {curve_name} due to missing Force or Z data")
                continue

            # Validate data
            validate_data(force_data, f"{curve_name}/{force_relative_path}")
            validate_data(z_data, f"{curve_name}/{z_relative_path}")

            deflection = np.array(force_data)
            z_sensor = np.array(z_data)
            min_length = min(len(deflection), len(z_sensor))
            if min_length == 0:
                logger.warning(f"Skipping {curve_name} due to empty Force or Z data")
                continue

            # Validate data compatibility
            if len(deflection) != len(z_sensor):
                logger.warning(f"Truncating data for {curve_name} to min length {min_length} due to mismatch")

            # Validate metadata
            validated_metadata = validate_and_fill_metadata(metadata, curve_name)

            # Extract tip metadata for this curve
            tip_radius = float(validated_metadata.get("tip_radius", 1e-6))
            tip_geometry = validated_metadata.get("tip_geometry", "pyramid")
            for dataset_id, dataset in json_data["datasets"].items():
                alias = dataset.get("alias", [""])[0].strip("/")
                if alias == f"{curve_name}/tip":
                    for attr in dataset.get("attributes", []):
                        if attr.get("name") == "value" and attr.get("type", {}).get("class") == "H5T_FLOAT":
                            unit = next((a["value"] for a in dataset.get("attributes", []) if a.get("name") == "unit"), "um")
                            tip_radius = attr.get("value", 1e-6)
                            if unit == "um":
                                tip_radius /= 1e6
                            elif unit == "nm":
                                tip_radius /= 1e9
                    break

            # Create segment
            segments = [
                Segment(
                    type="approach",  # Default, can be updated if segment type is available
                    deflection=deflection[:min_length],
                    z_sensor=z_sensor[:min_length],
                    sampling_rate=float(validated_metadata.get("sampling_rate", 1e5)),
                    velocity=float(validated_metadata.get("velocity", 1e-6)),
                    no_points=min_length
                )
            ]

            # Validate segment data
            if not all(np.isfinite(segments[0].deflection)) or not all(np.isfinite(segments[0].z_sensor)):
                logger.warning(f"Skipping {curve_name}: Invalid data (non-finite values)")
                continue

            curves[curve_name] = ForceCurve(
                file_id=validated_metadata.get("file_id", f"{curve_name}_id"),
                date=validated_metadata.get("date", "2025-05-20"),
                instrument=validated_metadata.get("instrument", "unknown"),
                sample=validated_metadata.get("sample", "unknown"),
                spring_constant=float(validated_metadata.get("spring_constant", 0.1)),
                inv_ols=float(validated_metadata.get("inv_ols", 22e-9)),
                tip_geometry=tip_geometry,
                tip_radius=tip_radius,
                segments=segments
            )
            logger.info(f"Processed curve: {curve_name}")
        except KeyError as e:
            logger.warning(f"Skipping {curve_name} due to missing dataset: {e}")
            continue
        except Exception as e:
            logger.error(f"Error processing {curve_name}: {str(e)}")
            continue

    if not curves:
        logger.error("No valid Force and Z datasets found in JSON")
        raise ValueError("No valid Force and Z datasets found in JSON")

    logger.info(f"Processed {len(curves)} curves: {list(curves.keys())[:5]}{'...' if len(curves) > 5 else ''}")
    return curves

def validate_and_fill_metadata(metadata: Dict, curve_name: str) -> Dict:
    """Validate metadata and fill missing fields with defaults or inferred values."""
    defaults = {
        "file_id": "file_0",
        "date": "2025-05-20",
        "instrument": "unknown",
        "sample": "unknown",
        "spring_constant": 0.1,
        "inv_ols": 22e-9,
        "tip_geometry": "pyramid",
        "tip_radius": 1e-6,
        "sampling_rate": 1e5,
        "velocity": 1e-6
    }
    validated_metadata = metadata.copy()
    
    for key, default in defaults.items():
        if key not in validated_metadata or validated_metadata[key] is None:
            logger.warning(f"Missing metadata field {key} for {curve_name}, using default: {default}")
            validated_metadata[key] = default
        elif key in ["spring_constant", "inv_ols", "tip_radius", "sampling_rate", "velocity"]:
            try:
                validated_metadata[key] = float(validated_metadata[key])
                if validated_metadata[key] <= 0:
                    logger.warning(f"Invalid {key} for {curve_name}: {validated_metadata[key]}, using default: {default}")
                    validated_metadata[key] = default
            except (ValueError, TypeError):
                logger.warning(f"Invalid type for {key} in {curve_name}: {validated_metadata[key]}, using default: {default}")
                validated_metadata[key] = default

    # Optional: Infer sampling_rate from JSON attributes if available
    # Assuming JSON might have global attributes; adjust if needed
    try:
        with open(metadata.get("file_path", ""), "r") as f:
            json_data = json.load(f)
            if "sampling_rate" in json_data and validated_metadata["sampling_rate"] == defaults["sampling_rate"]:
                validated_metadata["sampling_rate"] = float(json_data["sampling_rate"])
                logger.info(f"Inferred sampling_rate for {curve_name}: {validated_metadata['sampling_rate']}")
    except Exception:
        pass  # Fallback to default if inference fails

    return validated_metadata

import json
from typing import Dict, Any, List, Optional
import logging
import duckdb
import numpy as np

logger = logging.getLogger(__name__)

def export_from_duckdb_to_json(
    db_path: str,
    output_path: str,
    curve_ids: Optional[List[int]] = None,
    metadata: Dict[str, Any] = {}
) -> int:
    """
    Export transformed curves from DuckDB to a JSON file with metadata.
    
    Args:
        db_path: Path to the DuckDB database.
        output_path: Path to the output JSON file.
        curve_ids: List of curve IDs to export (optional).
        metadata: Dictionary of metadata to include.
    
    Returns:
        Number of curves exported.
    """
    try:
        # Connect to DuckDB
        with duckdb.connect(db_path) as conn:
            query = """
                SELECT curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
                       tip_geometry, tip_radius, segment_type, force_values AS deflection,
                       z_values AS z_sensor, sampling_rate, velocity, no_points
                FROM force_vs_z
            """
            params = None
            if curve_ids:
                query += " WHERE curve_id IN ({})".format(",".join("?" for _ in curve_ids))
                params = curve_ids
            
            results = conn.execute(query, params or []).fetchall()
            if not results:
                logger.error("No curves found in database")
                raise ValueError("No curves found in database")

        # Prepare JSON structure
        json_data = {
            "datasets": {}
        }
        num_exported = 0
        dataset_id = 0

        for row in results:
            (curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
             tip_geometry, tip_radius, segment_type, deflection, z_sensor,
             sampling_rate, velocity, no_points) = row

            # Convert curve_id and segment_type to strings
            curve_id_str = f"curve{curve_id}" if curve_id is not None else f"curve_{id(row)}"
            segment_type = str(segment_type) if segment_type is not None else "unknown"

            # Add deflection dataset
            json_data["datasets"][str(dataset_id)] = {
                "alias": [f"{curve_id_str}/{segment_type}/Force"],
                "value": deflection if deflection else [],
                "attributes": [
                    {"name": "unit", "value": "N"},
                    {"name": "sampling_rate", "value": float(sampling_rate or 1e5)},
                    {"name": "velocity", "value": float(velocity or 1e-6)},
                    {"name": "no_points", "value": int(no_points or 0)}
                ]
            }
            dataset_id += 1

            # Add z_sensor dataset
            json_data["datasets"][str(dataset_id)] = {
                "alias": [f"{curve_id_str}/{segment_type}/Z"],
                "value": z_sensor if z_sensor else [],
                "attributes": [
                    {"name": "unit", "value": "m"}
                ]
            }
            dataset_id += 1

            # Add tip/metadata dataset
            json_data["datasets"][str(dataset_id)] = {
                "alias": [f"{curve_id_str}/tip"],
                "attributes": [
                    {"name": "file_id", "value": file_id or ""},
                    {"name": "date", "value": date or ""},
                    {"name": "instrument", "value": instrument or ""},
                    {"name": "sample", "value": sample or ""},
                    {"name": "spring_constant", "value": float(spring_constant or 0.1)},
                    {"name": "inv_ols", "value": float(inv_ols or 1.0)},
                    {"name": "tip_geometry", "value": tip_geometry or "unknown"},
                    {"name": "tip_radius", "value": float(tip_radius or 1e-6)}
                ] + [{"name": key, "value": value} for key, value in metadata.items()]
            }
            dataset_id += 1

            num_exported += 1

        # Write to JSON file
        with open(output_path, "w") as f:
            json.dump(json_data, f, indent=4, default=lambda o: o.tolist() if isinstance(o, np.ndarray) else o)

        logger.info(f"Exported {num_exported} curves from DuckDB to JSON file at {output_path}")
        return num_exported

    except Exception as e:
        logger.error(f"Failed to export to JSON file {output_path}: {str(e)}")
        raise