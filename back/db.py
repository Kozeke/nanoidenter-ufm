import h5py
import duckdb
from filters.filters.apply_filters import apply
from filters.cpoints.apply_contact_point_filters import apply_cp_filters
from filters.fmodels.apply_fmodels import apply_fmodels
from filters.emodels.apply_emodels import apply_emodels
from typing import Dict, Tuple, List
from filters.register_all import register_filters
import pandas as pd  # Ensure pandas is imported

DB_PATH = "data/all.db"


def fetch_curves_batch(conn: duckdb.DuckDBPyConnection, curve_ids: List[str], filters: Dict, single = False) -> Tuple[List[Dict], Dict]:
    """
    Fetches a batch of curve data from DuckDB and applies filters dynamically in SQL.
    
    Args:
        conn: DuckDB connection object
        curve_ids: List of curve IDs to fetch
        filters: Dictionary of filters to apply (e.g., {'min_force': 0.1, 'max_z': 10})
    
    Returns:
        Tuple containing:
        - graph_force_vs_z: Dict with curves and domain for Force vs Z
        - graph_force_indentation: Dict with curves and domain for Force vs Indentation
        - graph_elspectra: Dict with curves and domain for Elspectra
    """
    # print(f"Fetching batch of {len(curve_ids)} curves...")
    
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
    query_regular = apply(base_query, regular_filters, curve_ids)
    result_regular = conn.execute(query_regular).fetchall()
    
    curves_regular = [
        {
            "curve_id": f"curve{row[0]}",
            "x": row[1],
            "y": row[2]
        }
        for row in result_regular
    ]
    # print("graphgorcevsz",curves_regular)
    domain_regular = compute_domain(conn, curves_regular, "curves_temp_regular")
    graph_force_vs_z = {"curves": curves_regular, "domain": domain_regular}
    
    # --- Graph 2: Force vs Indentation and Elspectra (CP Filters, if active) ---
    # print("graph_force_vs_z")
    graph_force_indentation = {"curves": [], "domain": {"xMin": None, "xMax": None, "yMin": None, "yMax": None}}
    graph_elspectra = {"curves": [], "domain": {"xMin": None, "xMax": None, "yMin": None, "yMax": None}}
    
    if cp_filters:
        query_cp = apply_cp_filters(base_query, cp_filters, curve_ids)
        # print(f"Generated cp query: {query_cp}")
        
        # Parameters for indentation and elspectra
        spring_constant = 1.0
        set_zero_force = True
        win = 61
        order = 2
        tip_geometry = 'sphere'
        tip_radius = 1e-05
        tip_angle = 30.0
        interp = True
        
        # Define defaults for model parameters
        # model = 'hertz'
        # poisson = 0.5
        # zi_min = 0.0
        # zi_max = 800.0
        
        # Get fmodels from filters and override defaults if present
        fmodels = filters.get('f_models', {})
        if fmodels:
            query_fmodels = apply_fmodels("", fmodels, curve_ids) if fmodels else None
        
        
        emodels = filters.get('e_models', {})
        if emodels:
            # print("emodel exists", emodels)
            query_emodels = apply_emodels("", emodels, curve_ids) if emodels else None
        

                # Construct the batch query
        # Precompute CTEs to ensure proper formatting
        fmodels_cte = f"fmodels_results AS (\n    {query_fmodels}\n)" if fmodels else ""
        emodels_cte = f"emodels_results AS (\n    {query_emodels}\n)" if emodels else ""

        # Comma logic
        comma_after_base = fmodels or emodels  # Comma if any CTE follows base_results
        comma_between = fmodels and emodels    # Comma only if both fmodels and emodels are present

        batch_query = f"""
            WITH cp_data AS (
                {query_cp}
            ),
            indentation_data AS (
                SELECT 
                    curve_id,
                    calc_indentation(
                        z_values, 
                        force_values, 
                        cp_values,
                        {spring_constant}, 
                        {set_zero_force}
                    ) AS indentation_result
                FROM cp_data
                WHERE cp_values IS NOT NULL
            ),
            base_results AS (
                SELECT 
                    curve_id,
                    indentation_result AS indentation,
                    calc_elspectra(
                        indentation_result[1],
                        indentation_result[2],
                        {win}, 
                        {order}, 
                        '{tip_geometry}', 
                        {tip_radius}, 
                        {tip_angle}, 
                        {interp}
                    ) AS elspectra_result
                FROM indentation_data
                WHERE indentation_result IS NOT NULL
            ){(',' if comma_after_base else '')}
            {fmodels_cte}{(',' if comma_between else '')}
            {emodels_cte}
            SELECT 
                b.curve_id,
                b.indentation,
                b.elspectra_result,
                {'f.fmodel_values' if fmodels else 'NULL AS hertz_result'},
                {'e.emodel_values' if emodels else 'NULL AS elastic_result'}
            FROM base_results b
            {'LEFT JOIN fmodels_results f ON b.curve_id = f.curve_id' if fmodels else ''}
            {'LEFT JOIN emodels_results e ON b.curve_id = e.curve_id' if emodels else ''}
        """
        
        try:
            result_batch = conn.execute(batch_query).fetchall()
        except Exception as e:
            print(f"Error in combined batch query: {e}")
            raise
        
        curves_cp = []
        curves_el = []
        print("result batch", result_batch)
        for row in result_batch:
            curve_id, indentation_result, elspectra_result, hertz_result, elastic_result = row
            print("indentation_result",indentation_result)
            if indentation_result is not None:
                zi, fi = indentation_result
                curves_cp.append({
                    "curve_id": f"curve{curve_id}",
                    "x": zi,
                    "y": fi
                })
                if hertz_result is not None and fmodels and single:
                    print("hertz_result", len(hertz_result))
                    x, y = hertz_result
                    # print(len(x),len(y))
                    curves_cp.append({
                        "curve_id": f"{curve_id}_hertz",
                        "x": x,
                        "y": y
                    })
            
            if elspectra_result is not None:
                ze, e = elspectra_result
                # print("ze, e",ze, e)
                curves_el.append({
                    "curve_id": f"curve{curve_id}",
                    "x": ze,
                    "y": e
                })
                if elastic_result is not None and emodels and single:
                    # print("elastic_result", elastic_result)
                    x, y = elastic_result
                    curves_el.append({
                        "curve_id": f"{curve_id}_elastic",
                        "x": x,
                        "y": y
                    })
        
        print("cp filters applied, batch indentation and elspectra calculated")
        
        if curves_cp:
            domain_cp = compute_domain(conn, curves_cp, "curves_temp_cp")
            graph_force_indentation = {"curves": curves_cp, "domain": domain_cp}
        
        if curves_el:
            domain_el = compute_domain(conn, curves_el, "curves_temp_el")
            graph_elspectra = {"curves": curves_el, "domain": domain_el}

    return graph_force_vs_z, graph_force_indentation, graph_elspectra
               
def compute_domain(conn: duckdb.DuckDBPyConnection, curves: List[Dict], table_name: str) -> Dict:
    """
    Compute domain ranges (min/max) for x and y values in a list of curves.
    
    Args:
        conn: DuckDB connection object
        curves: List of dictionaries containing 'x' and 'y' values
        table_name: Temporary table name for registration
    
    Returns:
        Dictionary with xMin, xMax, yMin, yMax values
    """
    if not curves:
        return {"xMin": None, "xMax": None, "yMin": None, "yMax": None}
    
    curves_df = pd.DataFrame(curves)
    conn.register(table_name, curves_df)
    
    domain_query = f"""
        WITH unnested AS (
            SELECT 
                unnest(x) AS x_value,
                unnest(y) AS y_value
            FROM {table_name}
        )
        SELECT 
            APPROX_QUANTILE(x_value, 0) AS xMin,
            APPROX_QUANTILE(x_value, 1) AS xMax,
            APPROX_QUANTILE(y_value, 0) AS yMin,
            APPROX_QUANTILE(y_value, 1) AS yMax
        FROM unnested
    """
    domain_result = conn.execute(domain_query).fetchone()
    
    return {
        "xMin": float(domain_result[0]) if domain_result[0] is not None else None,
        "xMax": float(domain_result[1]) if domain_result[1] is not None else None,
        "yMin": float(domain_result[2]) if domain_result[2] is not None else None,
        "yMax": float(domain_result[3]) if domain_result[3] is not None else None,
    }