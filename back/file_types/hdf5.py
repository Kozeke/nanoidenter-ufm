"""Provides HDF5 parsing utilities and legacy DuckDB-to-HDF5 export helpers."""

import h5py
import numpy as np
from models.force_curve import ForceCurve, Segment
import logging
import os
from typing import Dict, List, Any, Optional, Tuple
import duckdb

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


def read_tip_metadata_from_hdf5(file_path: str) -> Dict[str, Any]:
    """Read experiment metadata from the first curve/tip group in an HDF5 file."""
    # Stores normalized metadata extracted from tip group attributes.
    extracted: Dict[str, Any] = {}
    try:
        with h5py.File(file_path, "r") as hdf5_file:
            for curve_name, curve_group in hdf5_file.items():
                if not isinstance(curve_group, h5py.Group):
                    continue
                tip_group = curve_group.get("tip")
                if tip_group is None or not isinstance(tip_group, h5py.Group):
                    continue
                for attr_name, attr_value in tip_group.attrs.items():
                    if isinstance(attr_value, bytes):
                        attr_value = attr_value.decode("utf-8")
                    elif isinstance(attr_value, (np.integer, np.floating)):
                        attr_value = float(attr_value) if isinstance(attr_value, np.floating) else int(attr_value)
                    extracted[str(attr_name)] = attr_value
                break
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Failed to read tip metadata from %s: %s", file_path, exc
        )
        return {}

    # Maps barytech tip attrs to canonical metadata keys used by the ingest pipeline.
    if extracted.get("geometry") and not extracted.get("tip_geometry"):
        extracted["tip_geometry"] = str(extracted["geometry"])
    if extracted.get("value") is not None and extracted.get("tip_radius") in (None, ""):
        tip_value = float(extracted["value"])
        tip_unit = str(extracted.get("unit", "")).lower()
        if tip_unit in ("um", "µm", "micrometer", "micrometers"):
            extracted["tip_radius"] = tip_value * 1e-6
        elif tip_unit in ("mm", "millimeter", "millimeters"):
            extracted["tip_radius"] = tip_value * 1e-3
        else:
            extracted["tip_radius"] = tip_value
    if extracted.get("force_conversion_factor") is not None and extracted.get("force_scale_to_n") in (None, ""):
        extracted["force_scale_to_n"] = float(extracted["force_conversion_factor"])
    # z_scale_to_m / z_conversion_factor are not applied during ingest — Z is stored as µm.
    # if extracted.get("z_conversion_factor") is not None and extracted.get("z_scale_to_m") in (None, ""):
    #     extracted["z_scale_to_m"] = float(extracted["z_conversion_factor"])
    extracted.pop("z_scale_to_m", None)
    extracted.pop("z_conversion_factor", None)

    return extracted



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


# Minimum number of points required to keep an imported segment.
MIN_SEGMENT_POINTS = 20

# Barytech-style HDF5 layout: indent in segment0, retract in segment1.
BARYTECH_SEGMENT_SPECS = (
    ("segment0", "segment0/Force", "segment0/Z", False),
    ("segment1", "segment1/Force", "segment1/Z", False),
)


def _resolve_hdf5_node(group: h5py.Group, relative_path: str):
    """Walk a slash-separated HDF5 path under one curve group."""
    node = group
    for part in relative_path.split("/"):
        node = node[part]
    return node


def _infer_segment_type(force_relative_path: str, z_relative_path: str) -> str:
    """Infer segment type from legacy user-selected dataset paths."""
    combined = f"{force_relative_path}/{z_relative_path}".lower()
    if "segment1" in combined or "retract" in combined:
        return "segment1"
    if "segment0" in combined or "approach" in combined or "indent" in combined:
        return "segment0"
    return "approach"


def _clean_segment_arrays(
    z_sensor: np.ndarray,
    deflection: np.ndarray,
    apply_approach_trim: bool,
) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Normalize one segment's Z/Force arrays for DuckDB storage."""
    keep = np.isfinite(z_sensor) & np.isfinite(deflection)
    z_sensor = z_sensor[keep]
    deflection = deflection[keep]

    if len(z_sensor) < MIN_SEGMENT_POINTS:
        return None

    if apply_approach_trim:
        end_idx = int(np.argmax(z_sensor))
        if end_idx > 0:
            z_sensor = z_sensor[: end_idx + 1]
            deflection = deflection[: end_idx + 1]
        if len(z_sensor) < MIN_SEGMENT_POINTS:
            return None

    order = np.argsort(z_sensor)
    z_sensor = z_sensor[order]
    deflection = deflection[order]

    z_sensor, unique_idx = np.unique(z_sensor, return_index=True)
    deflection = deflection[unique_idx]

    if len(z_sensor) < MIN_SEGMENT_POINTS:
        return None

    return z_sensor, deflection


def _load_segment_from_relative_paths(
    curve_group: h5py.Group,
    segment_type: str,
    force_relative_path: str,
    z_relative_path: str,
    validated_metadata: Dict[str, Any],
    apply_approach_trim: bool,
) -> Optional[Segment]:
    """Load one Force/Z pair from a curve group and return a cleaned Segment."""
    try:
        force_dataset = _resolve_hdf5_node(curve_group, force_relative_path)
        z_dataset = _resolve_hdf5_node(curve_group, z_relative_path)
        validate_dataset(force_dataset, force_relative_path)
        validate_dataset(z_dataset, z_relative_path)
    except KeyError:
        return None

    deflection = np.array(force_dataset[()])
    z_sensor = np.array(z_dataset[()])

    # Z and Force are stored as-is in micrometers (µm) and micronewtons (µN).
    # z_scale_to_m = float(validated_metadata.get("z_scale_to_m", 1.0) or 1.0)
    # if z_scale_to_m != 1.0:
    #     z_sensor = z_sensor * z_scale_to_m
    # force_scale_to_n = float(validated_metadata.get("force_scale_to_n", 1.0) or 1.0)
    # if force_scale_to_n != 1.0:
    #     deflection = deflection * force_scale_to_n

    cleaned = _clean_segment_arrays(z_sensor, deflection, apply_approach_trim)
    if cleaned is None:
        return None

    z_sensor, deflection = cleaned
    if not all(np.isfinite(deflection)) or not all(np.isfinite(z_sensor)):
        return None

    point_count = len(z_sensor)
    return Segment(
        type=segment_type,
        deflection=deflection,
        z_sensor=z_sensor,
        sampling_rate=float(validated_metadata.get("sampling_rate", 1e5)),
        velocity=float(validated_metadata.get("velocity", 1e-6)),
        no_points=point_count,
    )


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

            # Process each curve group and import segment0/segment1 when present.
            for curve_name, curve_group in curve_groups:
                try:
                    validated_metadata = validate_and_fill_metadata(metadata, curve_name)
                    if validated_metadata.get("tip_geometry") in (None, "") and validated_metadata.get("geometry"):
                        validated_metadata["tip_geometry"] = str(validated_metadata["geometry"])

                    segments: List[Segment] = []
                    for segment_type, force_rel, z_rel, apply_trim in BARYTECH_SEGMENT_SPECS:
                        segment = _load_segment_from_relative_paths(
                            curve_group,
                            segment_type,
                            force_rel,
                            z_rel,
                            validated_metadata,
                            apply_trim,
                        )
                        if segment is not None:
                            segments.append(segment)

                    if not segments:
                        legacy_segment_type = _infer_segment_type(force_relative_path, z_relative_path)
                        legacy_trim = legacy_segment_type in ("approach", "segment0")
                        legacy_segment = _load_segment_from_relative_paths(
                            curve_group,
                            legacy_segment_type,
                            force_relative_path,
                            z_relative_path,
                            validated_metadata,
                            legacy_trim,
                        )
                        if legacy_segment is not None:
                            segments.append(legacy_segment)

                    if not segments:
                        logger.warning(f"Skipping {curve_name}: no valid segment data found")
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
                        segments=segments,
                    )
                    logger.info(
                        f"Processed curve {curve_name} with segments: "
                        f"{[segment.type for segment in segments]}"
                    )
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
        "tip_radius": 1e-5,
        "sampling_rate": 1e5,
        "velocity": 1e-6,
        # Unit-calibration factors are accepted in metadata but not applied —
        # Z and Force arrays are stored as micrometers (µm) and micronewtons (µN).
        "z_scale_to_m": 1.0,
        "force_scale_to_n": 1.0,
    }
    validated_metadata = metadata.copy()
    
    for key, default in defaults.items():
        if key not in validated_metadata or validated_metadata[key] is None:
            # logger.warning(f"Missing metadata field {key} for {curve_name}, using default: {default}")
            validated_metadata[key] = default
        elif key in ["spring_constant", "inv_ols", "tip_radius", "sampling_rate", "velocity", "z_scale_to_m", "force_scale_to_n"]:
            try:
                validated_metadata[key] = float(validated_metadata[key])
                # force_scale_to_n is allowed to be negative — a negative value
                # means "flip the sign AND scale", which is physically meaningful
                # for sensors whose voltage convention is inverted relative to
                # the expected force direction (e.g. the Aurora sensor's raw
                # voltage is negative-going on approach, but downstream fits
                # expect a positive-going force curve). Zero is still invalid.
                if key == "force_scale_to_n":
                    if validated_metadata[key] == 0:
                        validated_metadata[key] = default
                elif validated_metadata[key] <= 0:
                    # logger.warning(f"Invalid {key} for {curve_name}: {validated_metadata[key]}, using default: {default}")
                    validated_metadata[key] = default
            except (ValueError, TypeError):
                # logger.warning(f"Invalid type for {key} in {curve_name}: {validated_metadata[key]}, using default: {default}")
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


def export_from_duckdb_to_hdf5(
    db_path: str,
    output_path: str,
    curve_ids: Optional[List[int]] = None,
    dataset_path: str = "curve0/segment0/Force",
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
        # Connect to DuckDB using the same local database path as the exporter router.
        with duckdb.connect(db_path) as conn:
            # Captures available table columns so exports can run against reduced schemas.
            schema_columns = {row[0] for row in conn.execute("DESCRIBE force_vs_z").fetchall()}
            # Selects optional instrument column when available, otherwise uses a typed NULL placeholder.
            instrument_projection = "instrument" if "instrument" in schema_columns else "CAST(NULL AS VARCHAR)"
            # Selects optional sample column when available, otherwise uses a typed NULL placeholder.
            sample_projection = "sample" if "sample" in schema_columns else "CAST(NULL AS VARCHAR)"
            # Selects optional inv_ols column when available, otherwise uses a typed NULL placeholder.
            inv_ols_projection = "inv_ols" if "inv_ols" in schema_columns else "CAST(NULL AS DOUBLE)"
            # Selects optional sampling_rate column when available, otherwise uses a typed NULL placeholder.
            sampling_rate_projection = "sampling_rate" if "sampling_rate" in schema_columns else "CAST(NULL AS DOUBLE)"
            # Selects optional velocity column when available, otherwise uses a typed NULL placeholder.
            velocity_projection = "velocity" if "velocity" in schema_columns else "CAST(NULL AS DOUBLE)"
            # Selects optional no_points column when available, otherwise uses a typed NULL placeholder.
            no_points_projection = "no_points" if "no_points" in schema_columns else "CAST(NULL AS BIGINT)"
            query = """
                SELECT curve_id, file_id, date, {instrument_projection} AS instrument, {sample_projection} AS sample, spring_constant, {inv_ols_projection} AS inv_ols,
                       tip_geometry, tip_radius, segment_type, force_values AS deflection,
                       z_values AS z_sensor, {sampling_rate_projection} AS sampling_rate, {velocity_projection} AS velocity, {no_points_projection} AS no_points
                FROM force_vs_z
            """.format(
                instrument_projection=instrument_projection,
                sample_projection=sample_projection,
                inv_ols_projection=inv_ols_projection,
                sampling_rate_projection=sampling_rate_projection,
                velocity_projection=velocity_projection,
                no_points_projection=no_points_projection,
            )
            params = None
            if curve_ids:
                query += " WHERE curve_id IN ({})".format(",".join("?" for _ in curve_ids))
                params = curve_ids
            
            results = conn.execute(query, params or []).fetchall()
            if not results:
                logger.error("No curves found in database")
                raise ValueError("No curves found in database")

        # Check if file already exists and provide clear error message
        if os.path.exists(output_path):
            error_msg = f"File already exists: {output_path}. Please choose a different filename or remove the existing file manually."
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Open HDF5 file
        with h5py.File(output_path, "w") as f:
            num_exported = 0
            for row in results:
                (curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
                 tip_geometry, tip_radius, segment_type, deflection, z_sensor,
                 sampling_rate, velocity, no_points) = row

                # Creates deterministic curve group names so each curve keeps its own branch.
                curve_group_name = f"curve{curve_id}" if curve_id is not None else f"curve_{id(row)}"
                # Keeps the canonical segment group expected by downstream readers.
                segment_group_name = level_names[1] if len(level_names) > 1 and level_names[1] else "segment0"
                # Creates/gets the per-curve group where all child objects are attached.
                curve_group = f.require_group(curve_group_name)
                # Creates/gets the per-segment group under the curve.
                segment_group = curve_group.require_group(segment_group_name)

                # Prevent crash if the same curve appears multiple times by replacing existing datasets.
                if "Force" in segment_group:
                    del segment_group["Force"]
                # Stores only force values for this curve in the expected dataset name.
                segment_group.create_dataset("Force", data=np.array(deflection or [], dtype=np.float64))

                # Prevent crash if the same curve appears multiple times by replacing existing datasets.
                if "Z" in segment_group:
                    del segment_group["Z"]
                # Stores only Z values for this curve in the expected dataset name.
                segment_group.create_dataset("Z", data=np.array(z_sensor or [], dtype=np.float64))

                # Creates/gets the tip group at curve level so it is sibling to segment0.
                tip_group = curve_group.require_group("tip")
                # Stores custom metadata fields directly inside tip as attributes.
                for key, value in metadata.items():
                    tip_group.attrs[key] = value
                # Stores the tip geometry shape as a string attribute.
                tip_group.attrs["geometry"] = str((metadata.get("tip_geometry") or tip_geometry or "sphere"))
                # Stores the fixed parameter label expected by consumers.
                tip_group.attrs["parameter"] = "Radius"
                # Stores the fixed unit label expected by consumers (tip radius is always exported in mm).
                tip_group.attrs["unit"] = "mm"
                # Tip radius from the request payload is already in mm (matches the export dialog UI).
                # Fall back to the DB's SI (meters) tip_radius, converted to mm, when the payload omits it.
                payload_tip_radius_mm = metadata.get("tip_radius")
                if payload_tip_radius_mm in (None, "", 0):
                    payload_tip_radius_mm = (float(tip_radius) if tip_radius else 1e-5) * 1e3
                # Stores the tip radius value (mm) used by consumers.
                tip_group.attrs["value"] = float(payload_tip_radius_mm)

                num_exported += 1

        logger.info(f"Exported {num_exported} curves from DuckDB to HDF5 file at {output_path}")
        return num_exported

    except Exception as e:
        logger.error(f"Failed to export to HDF5 file {output_path}: {str(e)}")
        raise