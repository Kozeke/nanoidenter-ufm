from typing import Dict, Any, List, Optional
import logging
import duckdb
import numpy as np
from models.force_curve import ForceCurve, Segment


logger = logging.getLogger(__name__)

def get_txt_structure(file_path: str) -> Dict[str, Any]:
        # Parse metadata (lines starting with # Key: Value) and include headers as first in sample_rows
        structure = {"metadata": {}, "sample_rows": []}
        with open(file_path, "r") as f:
            lines = f.readlines()
        data_started = False
        headers_added = False
        for line in lines:
            line_strip = line.strip()
            if line_strip.startswith("#"):
                if ":" in line_strip:
                    # Metadata
                    key_value = line_strip[1:].split(":", 1)
                    if len(key_value) == 2:
                        key, value = key_value[0].strip(), key_value[1].strip()
                        structure["metadata"][key] = value
                elif not headers_added:
                    # Headers line starting with # but no :
                    headers_raw = line_strip[1:].strip().split("\t")
                    headers = [col.strip() for col in headers_raw if col.strip()]
                    if headers:
                        structure["sample_rows"].append(headers)
                        headers_added = True
                        data_started = True
            elif data_started and line_strip:
                # Data rows
                row_raw = line_strip.split("\t")
                row = [col.strip() for col in row_raw if col.strip()]
                if len(structure["sample_rows"]) < 6:  # 1 header + 5 data
                    structure["sample_rows"].append(row)
                else:
                    break
        return structure

def process_txt(file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    # Parse the TXT: metadata first (# lines), then header, then data
    file_metadata = {}
    deflection = []
    z_sensor = []
    force_col_idx = None
    z_col_idx = None

    with open(file_path, "r") as f:
        lines = f.readlines()

    data_started = False
    headers_found = False
    for line in lines:
        line_strip = line.strip()
        if not headers_found:
            if line_strip.startswith("#"):
                if ":" in line_strip:
                    # Metadata
                    key_value = line_strip[1:].split(":", 1)
                    if len(key_value) == 2:
                        key, value = key_value[0].strip(), key_value[1].strip()
                        file_metadata[key] = value
                else:
                    # Headers
                    headers_raw = line_strip[1:].strip().split("\t")
                    headers = [col.strip() for col in headers_raw if col.strip()]
                    if headers:
                        try:
                            force_col_idx = headers.index(force_path)
                            z_col_idx = headers.index(z_path)
                        except ValueError as e:
                            raise ValueError(f"Column not found: {e}")
                        headers_found = True
                        data_started = True
                        continue
        elif data_started and line_strip:
            # Data rows
            columns_raw = line_strip.split("\t")
            columns = [col.strip() for col in columns_raw if col.strip()]
            if len(columns) > max(force_col_idx, z_col_idx):
                try:
                    deflection.append(float(columns[force_col_idx]))
                    z_sensor.append(float(columns[z_col_idx]))
                except ValueError:
                    continue  # Skip invalid rows

    deflection = np.array(deflection)
    z_sensor = np.array(z_sensor)
    min_length = min(len(deflection), len(z_sensor))

    if min_length == 0:
        raise ValueError("No valid data in TXT")

    # Merge file_metadata with provided metadata (provided overrides file)
    combined_metadata = {**file_metadata, **metadata}

    # Extract relevant values with defaults
    sampling_rate = float(combined_metadata.get("Sampling Rate", 1e5))
    velocity = float(combined_metadata.get("Velocity", 1e-6))

    segments = [
        Segment(
            type=combined_metadata.get("Geometry", "approach"),
            deflection=deflection[:min_length],
            z_sensor=z_sensor[:min_length],
            sampling_rate=sampling_rate,
            velocity=velocity,
            no_points=min_length
        )
    ]

    curves = {}
    curves["curve0"] = ForceCurve(
        file_id=combined_metadata.get("File Id", "file_0"),
        date=combined_metadata.get("Date", "2025-05-20"),
        instrument=combined_metadata.get("Instrument", "unknown"),
        sample=combined_metadata.get("Sample", "unknown"),
        spring_constant=float(combined_metadata.get("Spring Constant", 0.1)),
        inv_ols=float(combined_metadata.get("Inv Ols", 22e-9)),
        tip_geometry=combined_metadata.get("Tip Geometry", "pyramid"),
        tip_radius=float(combined_metadata.get("Tip Radius", 1e-6)),
        segments=segments
    )

    return curves


def export_from_duckdb_to_txt(
    db_path: str,
    output_path: str,
    curve_ids: Optional[List[int]] = None,
    metadata: Dict[str, Any] = {}
) -> int:
    """
    Export transformed curves from DuckDB to a TXT file with metadata.
    
    Args:
        db_path: Path to the DuckDB database.
        output_path: Path to the output TXT file.
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

        # Write to TXT file
        with open(output_path, "w") as f:
            # Write global metadata
            for key, value in metadata.items():
                f.write(f"# {key}: {value}\n")
            
            num_exported = 0
            for row in results:
                (curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
                 tip_geometry, tip_radius, segment_type, deflection, z_sensor,
                 sampling_rate, velocity, no_points) = row
                
                # Write row-specific metadata
                f.write(f"# curve_id: {curve_id}\n")
                f.write(f"# file_id: {file_id}\n")
                f.write(f"# date: {date}\n")
                f.write(f"# instrument: {instrument}\n")
                f.write(f"# sample: {sample}\n")
                f.write(f"# spring_constant: {spring_constant}\n")
                f.write(f"# inv_ols: {inv_ols}\n")
                f.write(f"# tip_geometry: {tip_geometry}\n")
                f.write(f"# tip_radius: {tip_radius}\n")
                f.write(f"# segment_type: {segment_type}\n")
                f.write(f"# sampling_rate: {sampling_rate}\n")
                f.write(f"# velocity: {velocity}\n")
                f.write(f"# no_points: {no_points}\n")
                
                # Write headers
                f.write("# Index\tZ (m)\tForce (N)\n")
                
                # Write data
                deflection_arr = np.array(deflection) if deflection else np.array([])
                z_sensor_arr = np.array(z_sensor) if z_sensor else np.array([])
                min_length = min(len(deflection_arr), len(z_sensor_arr))
                for i in range(min_length):
                    f.write(f"{i}\t{z_sensor_arr[i]}\t{deflection_arr[i]}\n")
                
                num_exported += 1

        logger.info(f"Exported {num_exported} curves from DuckDB to TXT file at {output_path}")
        return num_exported

    except Exception as e:
        logger.error(f"Failed to export to TXT file {output_path}: {str(e)}")
        raise
