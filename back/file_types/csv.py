import csv
from typing import Dict, Any, List, Optional
import logging
import duckdb
import numpy as np
from models.force_curve import ForceCurve, Segment


logger = logging.getLogger(__name__)


def get_csv_structure(file_path: str) -> Dict[str, Any]:
    # Parse metadata and sample data for structure
    structure = {"metadata": {}, "headers": [], "sample_rows": []}
    with open(file_path, "r") as f:
        reader = csv.reader(f)
        # Read metadata lines until a line that looks like headers (e.g., contains 'index')
        for row in reader:
            if len(row) == 2 and row[0].strip() != "index":  # Assume key,value
                key, value = row[0].strip(), row[1].strip()
                structure["metadata"][key] = value
            else:
                # Found headers
                structure["headers"] = [col.strip() for col in row]
                # Read next 5 rows as sample
                for _ in range(5):
                    try:
                        next_row = next(reader)
                        structure["sample_rows"].append([col.strip() for col in next_row])
                    except StopIteration:
                        break
                break
    return structure

def process_csv(file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
    # Parse the CSV: metadata first, then data
    file_metadata = {}
    deflection = []
    z_sensor = []
    force_col_idx = None
    z_col_idx = None

    with open(file_path, "r") as f:
        reader = csv.reader(f)
        data_started = False
        for row in reader:
            if not data_started:
                if len(row) == 2 and row[0].strip() != "index":
                    key, value = row[0].strip(), row[1].strip()
                    file_metadata[key] = value
                else:
                    # Headers line
                    headers = [col.strip() for col in row]
                    try:
                        force_col_idx = headers.index(force_path)
                        z_col_idx = headers.index(z_path)
                    except ValueError as e:
                        raise ValueError(f"Column not found: {e}")
                    data_started = True
            else:
                # Data rows
                if len(row) > max(force_col_idx, z_col_idx):
                    try:
                        deflection.append(float(row[force_col_idx]))
                        z_sensor.append(float(row[z_col_idx]))
                    except ValueError:
                        continue  # Skip invalid rows

    deflection = np.array(deflection)
    z_sensor = np.array(z_sensor)
    min_length = min(len(deflection), len(z_sensor))

    if min_length == 0:
        raise ValueError("No valid data in CSV")

    # Merge file_metadata with provided metadata (provided overrides file)
    combined_metadata = {**file_metadata, **metadata}

    # Extract relevant values with defaults
    sampling_rate = float(combined_metadata.get("sampling_rate", 1e5))
    velocity = float(combined_metadata.get("velocity", 1e-6))

    segments = [
        Segment(
            type="approach",
            deflection=deflection[:min_length],
            z_sensor=z_sensor[:min_length],
            sampling_rate=sampling_rate,
            velocity=velocity,
            no_points=min_length
        )
    ]

    curves = {}
    curves["curve0"] = ForceCurve(
        file_id=combined_metadata.get("file_id", "file_0"),
        date=combined_metadata.get("date", "2025-05-20"),
        instrument=combined_metadata.get("instrument", "unknown"),
        sample=combined_metadata.get("sample", "unknown"),
        spring_constant=float(combined_metadata.get("spring_constant", 0.1)),
        inv_ols=float(combined_metadata.get("inv_ols", 22e-9)),
        tip_geometry=combined_metadata.get("tip_geometry", "pyramid"),
        tip_radius=float(combined_metadata.get("tip_radius", 1e-6)),
        segments=segments
    )

    return curves
    
def export_from_duckdb_to_csv(
    db_path: str,
    output_path: str,
    curve_ids: Optional[List[int]] = None,
    metadata: Dict[str, Any] = {}
) -> int:
    """
    Export transformed curves from DuckDB to a CSV file with metadata.
    
    Args:
        db_path: Path to the DuckDB database.
        output_path: Path to the output CSV file.
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

        # Assuming single curve for simplicity; aggregate if multiple
        # For multiple curves, we might need to write separate sections or files, but here assume one CSV per export
        with open(output_path, "w", newline="") as f:
            writer = csv.writer(f)
            
            # Write metadata
            for key, value in metadata.items():
                writer.writerow([key, value])
            
            num_exported = 0
            for row in results:
                (curve_id, file_id, date, instrument, sample, spring_constant, inv_ols,
                 tip_geometry, tip_radius, segment_type, deflection, z_sensor,
                 sampling_rate, velocity, no_points) = row
                
                # Write row-specific metadata if needed
                writer.writerow(["curve_id", curve_id])
                writer.writerow(["file_id", file_id])
                writer.writerow(["date", date])
                writer.writerow(["instrument", instrument])
                writer.writerow(["sample", sample])
                writer.writerow(["spring_constant", spring_constant])
                writer.writerow(["inv_ols", inv_ols])
                writer.writerow(["tip_geometry", tip_geometry])
                writer.writerow(["tip_radius", tip_radius])
                writer.writerow(["segment_type", segment_type])
                writer.writerow(["sampling_rate", sampling_rate])
                writer.writerow(["velocity", velocity])
                writer.writerow(["no_points", no_points])
                
                # Write headers
                writer.writerow(["index", "Z (m)", "Force (N)"])
                
                # Write data
                deflection_arr = np.array(deflection) if deflection else np.array([])
                z_sensor_arr = np.array(z_sensor) if z_sensor else np.array([])
                min_length = min(len(deflection_arr), len(z_sensor_arr))
                for i in range(min_length):
                    writer.writerow([i, z_sensor_arr[i], deflection_arr[i]])
                
                num_exported += 1

        logger.info(f"Exported {num_exported} curves from DuckDB to CSV file at {output_path}")
        return num_exported

    except Exception as e:
        logger.error(f"Failed to export to CSV file {output_path}: {str(e)}")
        raise
