import h5py
import duckdb
from filters.apply_filters import apply
from typing import Dict, Tuple, List

DB_PATH = "data/hdf5_data.db"

def transform_data_for_force_vs_z(hdf5_file):
    """Transforms HDF5 data into Force vs Z format before saving."""
    curves = {}  # ✅ Dictionary to store transformed data

    for curve_name in hdf5_file.keys():  # Iterate over curves
        curve_group = hdf5_file[curve_name]

        for segment_name in curve_group.keys():  # Iterate over segments
            segment_group = curve_group[segment_name]

            if "Force" in segment_group and "Z" in segment_group:
                force_values = segment_group["Force"][()].tolist()
                z_values = segment_group["Z"][()].tolist()

                # ✅ Ensure both arrays have the same length
                min_length = min(len(z_values), len(force_values))
                if min_length == 0:
                    continue  # Skip empty curves

                curves[curve_name] = {
                    "x": z_values[:min_length],  
                    "y": force_values[:min_length]
                }

    return curves

def save_to_duckdb(transformed_data: Dict[str, Dict[str, List[float]]], db_path: str) -> None:
    """
    Saves transformed Force vs Z data into DuckDB in bulk with curve_id.

    Args:
        transformed_data: Dictionary with curve_name as key and {'x': z_values, 'y': force_values} as value
        db_path: Path to DuckDB database file
    """
    print("🚀 Saving transformed data to DuckDB...")

    # Establish connection
    conn = duckdb.connect(db_path)

    try:
        # Create table with curve_id (if not exists)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS force_vs_z (
                curve_id INTEGER PRIMARY KEY,  -- Added integer curve_id as primary key
                curve_name TEXT UNIQUE,        -- Keep curve_name as unique text
                z_values DOUBLE[],             -- Store Z points as array
                force_values DOUBLE[]          -- Store Force points as array
            )
        """)

        # Prepare batch data with curve_id
        batch_data: List[Tuple[int, str, List[float], List[float]]] = [
            (i, curve_name, values["x"], values["y"])
            for i, (curve_name, values) in enumerate(transformed_data.items())
        ]

        # Bulk insert with executemany
        conn.executemany(
            "INSERT INTO force_vs_z (curve_id, curve_name, z_values, force_values) VALUES (?, ?, ?, ?)",
            batch_data
        )

        # Verify row count (optional, for debugging)
        row_count = conn.execute("SELECT COUNT(*) FROM force_vs_z").fetchone()[0]
        print(f"✅ Inserted {row_count} rows into {db_path}!")

    except duckdb.Error as e:
        print(f"❌ DuckDB error: {e}")
        raise
    finally:
        conn.close()
def transform_hdf5_to_db(hdf5_path, db_path):
    """Reads HDF5, transforms it, and saves the result into DuckDB."""
    print("🚀 Processing HDF5 file...")
    
    with h5py.File(hdf5_path, "r") as f:
        transformed_data = transform_data_for_force_vs_z(f)

    save_to_duckdb(transformed_data, db_path)
    print("✅ HDF5 to DuckDB transformation complete!")


def fetch_curves_batch(conn: duckdb.DuckDBPyConnection, curve_ids: List[str], filters: Dict) -> Tuple[List[Dict], Dict]:
    """
    Fetches a batch of curve data from DuckDB and applies filters dynamically in SQL.
    
    Args:
        conn: DuckDB connection object
        curve_ids: List of curve IDs to fetch
        filters: Dictionary of filters to apply (e.g., {'min_force': 0.1, 'max_z': 10})
    
    Returns:
        Tuple containing:
        - List of curve dictionaries with curve_id, z_values, and force_values
        - Dictionary with domain range (xMin, xMax, yMin, yMax)
    """
    print(f"Fetching batch of {curve_ids} curves...")

    # Base query for specific curve IDs
    base_query = """
        SELECT curve_id, z_values, force_values 
        FROM force_vs_z 
        WHERE curve_id IN ({})
    """.format(",".join([f"'{cid}'" for cid in curve_ids]))
    # print(base_query)
    # Apply filters dynamically (assuming apply() is defined elsewhere)
    query = apply(base_query, filters, curve_ids)  # Assuming apply() handles filter logic

    # Execute query and fetch results
    result = conn.execute(query).fetchall()
    # print(result)
    # Process curves into list of dictionaries
    curves = [
        {
            "curve_id": row[0],  # Changed curve_name to curve_id for consistency
            "x": row[1],  # Keep as list/array
            "y": row[2]  # Keep as list/array
        }
        for row in result
    ]

    # Compute domain range using SQL with APPROX_QUANTILE
    domain_query = """
        WITH unnested AS (
            SELECT 
                unnest(z_values) AS z_value,
                unnest(force_values) AS force_value
            FROM ({}) AS filtered_curves
        )
        SELECT 
            APPROX_QUANTILE(z_value, 0) AS xMin,
            APPROX_QUANTILE(z_value, 1) AS xMax,
            APPROX_QUANTILE(force_value, 0) AS yMin,
            APPROX_QUANTILE(force_value, 1) AS yMax
        FROM unnested
    """.format(query)

    domain_result = conn.execute(domain_query).fetchone()

    # Convert domain result to dictionary
    domain_range = {
        "xMin": float(domain_result[0]) if domain_result[0] is not None else None,
        "xMax": float(domain_result[1]) if domain_result[1] is not None else None,
        "yMin": float(domain_result[2]) if domain_result[2] is not None else None,
        "yMax": float(domain_result[3]) if domain_result[3] is not None else None,
    }
    print(curves[0]['curve_id'])
    return curves, domain_range
