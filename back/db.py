import h5py
import duckdb
from filters.apply_filters import apply
from filters.apply_contact_point_filters import apply_cp_filters
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
    print(f"Fetching batch of {len(curve_ids)} curves...")
    
    # Extract regular and cp_filters from the input
    regular_filters = filters.get("regular", {})
    cp_filters = filters.get("cp_filters", {})
    
    # Base query for specific curve IDs
    base_query = """
        SELECT curve_id, z_values, force_values 
        FROM force_vs_z 
        WHERE curve_id IN ({})
    """.format(",".join([f"'{cid}'" for cid in curve_ids]))

    # --- Graph 1: Force vs Z (Regular Filters) ---
    query_regular = apply(base_query, regular_filters, curve_ids)  # Apply regular filters
    result_regular = conn.execute(query_regular).fetchall()
    
    # Process curves for Force vs Z
    curves_regular = [
        {
            "curve_id": row[0],
            "x": row[1],
            "y": row[2]
        }
        for row in result_regular
    ]
    
    # Compute domain range for Force vs Z
    domain_query_regular = """
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
    """.format(query_regular)
    domain_result_regular = conn.execute(domain_query_regular).fetchone()
    domain_regular = {
        "xMin": float(domain_result_regular[0]) if domain_result_regular[0] is not None else None,
        "xMax": float(domain_result_regular[1]) if domain_result_regular[1] is not None else None,
        "yMin": float(domain_result_regular[2]) if domain_result_regular[2] is not None else None,
        "yMax": float(domain_result_regular[3]) if domain_result_regular[3] is not None else None,
    }
    
    graph_force_vs_z = {"curves": curves_regular, "domain": domain_regular}
   # --- Graph 2: Force vs Indentation (CP Filters, if active) ---
    
    graph_force_indentation = {"curves": [], "domain": {"xMin": None, "xMax": None, "yMin": None, "yMax": None}}
    if cp_filters:  # Only process if cp_filters are present and non-empty
        query_cp = apply_cp_filters(base_query, cp_filters, curve_ids)  # Apply cp_filters
        result_cp = conn.execute(query_cp).fetchall()
        
        # Process curves for Force vs Indentation
        curves_cp = []
        spring_constant = 1.0  # Hardcoded for now; could be a filter parameter
        set_zero_force = True  # Hardcoded; could be configurable
        
        for row in result_cp:
            curve_id, z_values, force_values, cp_values = row
            if cp_values is not None and cp_values is not False:  # Mimic your condition
                # Calculate indentation using DuckDB function
                indentation_query = f"""
                    SELECT calc_indentation(?, ?, ?, {spring_constant}, {set_zero_force})
                """
                indentation_result = conn.execute(indentation_query, (z_values, force_values, cp_values)).fetchone()[0]
                
                if indentation_result is not None:
                    zi, fi = indentation_result
                    curves_cp.append({
                        "curve_id": curve_id,
                        "x": zi,  # Indentation Z
                        "y": fi   # Indentation Force
                    })
        
        # Compute domain range for Force vs Indentation
        if curves_cp:
            domain_query_cp = """
                WITH unnested AS (
                    SELECT unnest(x) AS z_value, unnest(y) AS force_value
                    FROM UNNEST({curves}) AS t(curve_id, x, y)
                )
                SELECT APPROX_QUANTILE(z_value, 0) AS xMin, APPROX_QUANTILE(z_value, 1) AS xMax,
                       APPROX_QUANTILE(force_value, 0) AS yMin, APPROX_QUANTILE(force_value, 1) AS yMax
                FROM unnested
            """.format(curves=[(c["curve_id"], c["x"], c["y"]) for c in curves_cp])
            domain_result_cp = conn.execute(domain_query_cp).fetchone()
            domain_cp = {
                "xMin": float(domain_result_cp[0]) if domain_result_cp[0] is not None else None,
                "xMax": float(domain_result_cp[1]) if domain_result_cp[1] is not None else None,
                "yMin": float(domain_result_cp[2]) if domain_result_cp[2] is not None else None,
                "yMax": float(domain_result_cp[3]) if domain_result_cp[3] is not None else None,
            }
            graph_force_indentation = {"curves": curves_cp, "domain": domain_cp}

    return graph_force_vs_z, graph_force_indentation