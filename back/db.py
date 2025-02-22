import h5py
import duckdb
from filters.apply_filters import apply

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

def save_to_duckdb(transformed_data, db_path):
    """Saves transformed Force vs Z data into DuckDB in bulk."""
    print("🚀 Saving transformed data to DuckDB...")

    conn = duckdb.connect(db_path)

    # ✅ Create table (if not exists)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS force_vs_z (
            curve_name TEXT,
            z_values DOUBLE[],  -- Store Z points as an array
            force_values DOUBLE[] -- Store Force points as an array
        )
    """)

    # ✅ Bulk insert data
    batch_data = [(curve_name, values["x"], values["y"]) for curve_name, values in transformed_data.items()]
    conn.executemany("INSERT INTO force_vs_z VALUES (?, ?, ?)", batch_data)

    conn.close()
    print(f"✅ Data successfully stored in {db_path}!")

def transform_hdf5_to_db(hdf5_path, db_path):
    """Reads HDF5, transforms it, and saves the result into DuckDB."""
    print("🚀 Processing HDF5 file...")
    
    with h5py.File(hdf5_path, "r") as f:
        transformed_data = transform_data_for_force_vs_z(f)

    save_to_duckdb(transformed_data, db_path)
    print("✅ HDF5 to DuckDB transformation complete!")


def fetch_curves_from_db(conn, num_curves, filters):
    """
    Fetches curve data from DuckDB and applies filters dynamically in SQL.
    """
    print("Fetching curves...")

    # Base query
    base_query = f"""
        SELECT curve_name, z_values, force_values 
        FROM force_vs_z 
        LIMIT {num_curves}
    """

    # Apply filters dynamically
    query = apply(base_query, filters, num_curves)

    # Execute query and fetch results
    result = conn.execute(query).fetchall()
    
    curves = {row[0]: {"x": row[1], "y": row[2]} for row in result}

    # ✅ Compute min/max domain values in SQL using APPROX_QUANTILE for better performance
    domain_query = f"""
        WITH unnested AS (
            SELECT 
                unnest(z_values) AS z_value,
                unnest(force_values) AS force_value
            FROM ({query}) AS filtered_curves
        )
        SELECT 
            APPROX_QUANTILE(z_value, 0) AS xMin,
            APPROX_QUANTILE(z_value, 1) AS xMax,
            APPROX_QUANTILE(force_value, 0) AS yMin,
            APPROX_QUANTILE(force_value, 1) AS yMax
        FROM unnested
    """

    domain_result = conn.execute(domain_query).fetchone()

    # ✅ Convert result into a dictionary
    domain_range = {
        "xMin": domain_result[0],
        "xMax": domain_result[1],
        "yMin": domain_result[2],
        "yMax": domain_result[3],
    }


    # Convert to dictionary format for WebSocket transmission
    return curves, domain_range  # ✅ Return both data & domain range
