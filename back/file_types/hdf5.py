import h5py
import numpy as np
from models.force_curve import ForceCurve, Segment
import logging
import os
from typing import Dict, List, Any, Optional

def get_hdf5_structure(file_path: str) -> Dict[str, Any]:
    """Return the HDF5 file structure as a nested dictionary for frontend display."""
    structure = {"groups": {}, "datasets": [], "attributes": {}}
    
    def collect_items(group: h5py.Group, path: str = "", parent_dict: Dict = structure["groups"]):
        if "datasets" not in parent_dict:
            parent_dict["datasets"] = []
        if "attributes" not in parent_dict:
            parent_dict["attributes"] = {}

        # Collect group attributes
        for attr_name, attr_value in group.attrs.items():
            try:
                if isinstance(attr_value, np.ndarray):
                    attr_value = attr_value.tolist()
                elif isinstance(attr_value, (np.integer, np.floating)):
                    attr_value = float(attr_value) if isinstance(attr_value, np.floating) else int(attr_value)
                elif isinstance(attr_value, bytes):
                    attr_value = attr_value.decode('utf-8')
                parent_dict["attributes"][attr_name] = attr_value
            except Exception as e:
                print(f"Warning: Skipping attribute {attr_name} at {path}: {e}")

        for name, item in group.items():
            new_path = f"{path}/{name}" if path else name
            try:
                if isinstance(item, h5py.Group):
                    parent_dict[name] = {"groups": {}, "datasets": [], "attributes": {}}
                    print(f"Processing group: {new_path}")
                    collect_items(item, new_path, parent_dict[name]["groups"])
                elif isinstance(item, h5py.Dataset):
                    dataset_info = {
                        "path": new_path,
                        "name": name,
                        "shape": list(item.shape),
                        "dtype": str(item.dtype),
                        "attributes": {}
                    }
                    for attr_name, attr_value in item.attrs.items():
                        try:
                            if isinstance(attr_value, np.ndarray):
                                attr_value = attr_value.tolist()
                            elif isinstance(attr_value, (np.integer, np.floating)):
                                attr_value = float(attr_value) if isinstance(attr_value, np.floating) else int(attr_value)
                            elif isinstance(attr_value, bytes):
                                attr_value = attr_value.decode('utf-8')
                            dataset_info["attributes"][attr_name] = attr_value
                        except Exception as e:
                            print(f"Warning: Skipping dataset attribute {attr_name} at {new_path}: {e}")
                    parent_dict["datasets"].append(dataset_info)
                    print(f"Found dataset: {new_path}, Shape: {item.shape}, Dtype: {item.dtype}")
            except Exception as e:
                print(f"Error processing item {new_path}: {e}")

    try:
        with h5py.File(file_path, "r") as f:
            print(f"Opening HDF5 file: {file_path}")
            collect_items(f)
            print(f"Final structure: {structure}")
    except Exception as e:
        raise ValueError(f"Failed to read HDF5 structure: {e}")
    
    return structure



# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("hdf5_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

def validate_dataset(dataset: h5py.Dataset, path: str) -> None:
    """Validate that a dataset is non-empty and has a compatible shape."""
    if not isinstance(dataset, h5py.Dataset):
        raise ValueError(f"{path} is not a dataset")
    if dataset.size == 0:
        raise ValueError(f"Dataset {path} is empty")
    if len(dataset.shape) != 1:
        raise ValueError(f"Dataset {path} must be 1D, got shape {dataset.shape}")

def process_hdf5(file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    """Process all curves in HDF5 file with validation and error handling."""
    # Validate file
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise ValueError(f"File not found: {file_path}")
    
    curves = {}
    try:
        with h5py.File(file_path, "r") as f:
            # Validate curve groups
            curve_groups = [(name, item) for name, item in f.items() if isinstance(item, h5py.Group)]
            if not curve_groups:
                logger.error("No curve groups found in HDF5 file")
                raise ValueError("No curve groups found in HDF5")

            # Validate dataset paths
            sample_curve_name = curve_groups[0][0]
            if not (force_path.startswith(f"{sample_curve_name}/") and z_path.startswith(f"{sample_curve_name}/")):
                logger.error(f"Invalid paths: force_path={force_path}, z_path={z_path} must start with {sample_curve_name}/")
                raise ValueError("Selected paths must belong to a curve group")

            force_relative_path = force_path[len(sample_curve_name) + 1:]
            z_relative_path = z_path[len(sample_curve_name) + 1:]
            logger.info(f"Using relative paths: Force={force_relative_path}, Z={z_relative_path}")

            # Process each curve
            for curve_name, curve_group in curve_groups:
                try:
                    # Validate datasets
                    force_dataset = curve_group[force_relative_path]
                    z_dataset = curve_group[z_relative_path]
                    validate_dataset(force_dataset, force_path)
                    validate_dataset(z_dataset, z_path)

                    # Validate data compatibility
                    deflection = np.array(force_dataset[()])
                    z_sensor = np.array(z_dataset[()])
                    min_length = min(len(deflection), len(z_sensor))
                    if min_length == 0:
                        logger.warning(f"Skipping {curve_name}: Empty Force or Z data")
                        continue

                    # Validate metadata
                    validated_metadata = validate_and_fill_metadata(metadata, curve_name)

                    # Create segment
                    segments = [
                        Segment(
                            type="approach",
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
                        file_id=validated_metadata["file_id"],
                        date=validated_metadata["date"],
                        instrument=validated_metadata["instrument"],
                        sample=validated_metadata["sample"],
                        spring_constant=float(validated_metadata["spring_constant"]),
                        inv_ols=float(validated_metadata["inv_ols"]),
                        tip_geometry=validated_metadata["tip_geometry"],
                        tip_radius=float(validated_metadata["tip_radius"]),
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
            logger.error("No valid Force and Z datasets found in HDF5")
            raise ValueError("No valid Force and Z datasets found in HDF5")

        logger.info(f"Processed {len(curves)} curves: {list(curves.keys())[:5]}{'...' if len(curves) > 5 else ''}")
        return curves
    except Exception as e:
        logger.error(f"Failed to process HDF5 file {file_path}: {str(e)}")
        raise
    
    
    
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

    # Optional: Infer sampling_rate from dataset attributes if available
    try:
        with h5py.File(metadata.get("file_path", ""), "r") as f:
            if "sampling_rate" in f.attrs and validated_metadata["sampling_rate"] == defaults["sampling_rate"]:
                validated_metadata["sampling_rate"] = float(f.attrs["sampling_rate"])
                logger.info(f"Inferred sampling_rate for {curve_name}: {validated_metadata['sampling_rate']}")
    except Exception:
        pass  # Fallback to default if inference fails

    return validated_metadata


import duckdb

def export_from_duckdb_to_hdf5(
    db_path: str,
    output_path: str,
    curve_ids: Optional[List[int]] = None,
    dataset_path: str = "dataset",
    level_names: List[str] = ["curve0", "segment0"],
    metadata_path: str = "tip",
    metadata: Dict[str, Any] = {}
) -> int:
    """
    Export transformed curves from DuckDB to an HDF5 file with specified dataset and metadata paths.
    
    Args:
        db_path: Path to the DuckDB database.
        output_path: Path to the output HDF5 file.
        curve_ids: List of curve IDs to export (optional).
        dataset_path: HDF5 path for storing datasets (e.g., "curve0/segment0/dataset").
        level_names: List of group level names (e.g., ["curve0", "segment0"]).
        metadata_path: HDF5 path for storing metadata (e.g., "curve0/segment0/tip").
        metadata: Dictionary of metadata to store as attributes.
    
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

        # Open HDF5 file
        with h5py.File(output_path, "w") as f:
            num_exported = 0
            for row in results:
                (curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
                 tip_geometry, tip_radius, segment_type, deflection, z_sensor,
                 sampling_rate, velocity, no_points) = row

                # Convert curve_id and segment_type to strings
                curve_id_str = f"curve{curve_id}" if curve_id is not None else f"curve_{id(row)}"
                segment_type = str(segment_type) if segment_type is not None else "unknown"

                # Create group hierarchy based on level_names
                group_path = f"{level_names[0]}/{level_names[1]}"  # e.g., curve0/segment0
                group = f.require_group(group_path)

                # Create datasets at dataset_path (e.g., curve0/segment0/dataset)
                dataset_group_path = dataset_path  # Use full dataset_path as parent group
                dataset_group = f.require_group(dataset_group_path)
                
                # Store deflection and z_sensor as separate datasets
                dataset_group.create_dataset(
                    "deflection",
                    data=np.array(deflection or [], dtype=np.float64)
                )
                dataset_group.create_dataset(
                    "z_sensor",
                    data=np.array(z_sensor or [], dtype=np.float64)
                )

                # Store metadata at metadata_path (e.g., curve0/segment0/tip)
                if metadata_path:
                    metadata_group_path = "/".join(metadata_path.split("/")[:-1])  # Extract parent group path
                    metadata_name = metadata_path.split("/")[-1]  # Extract metadata group name
                    if metadata_group_path:
                        metadata_group = f.require_group(metadata_group_path)
                    else:
                        metadata_group = group
                    metadata_subgroup = metadata_group.require_group(metadata_name)
                    # Store provided metadata
                    for key, value in metadata.items():
                        metadata_subgroup.attrs[key] = value
                    # Store additional row-specific metadata
                    metadata_subgroup.attrs["file_id"] = file_id or ""
                    metadata_subgroup.attrs["date"] = date or ""
                    metadata_subgroup.attrs["instrument"] = instrument or ""
                    metadata_subgroup.attrs["sample"] = sample or ""
                    metadata_subgroup.attrs["spring_constant"] = float(spring_constant or 0.1)
                    metadata_subgroup.attrs["inv_ols"] = float(inv_ols or 1.0)
                    metadata_subgroup.attrs["tip_geometry"] = tip_geometry or "unknown"
                    metadata_subgroup.attrs["tip_radius"] = float(tip_radius or 1e-6)
                    metadata_subgroup.attrs["sampling_rate"] = float(sampling_rate or 1e5)
                    metadata_subgroup.attrs["velocity"] = float(velocity or 1e-6)
                    metadata_subgroup.attrs["no_points"] = int(no_points or 0)

                num_exported += 1

        logger.info(f"Exported {num_exported} curves from DuckDB to HDF5 file at {output_path}")
        return num_exported

    except Exception as e:
        logger.error(f"Failed to export to HDF5 file {output_path}: {str(e)}")
        raise
