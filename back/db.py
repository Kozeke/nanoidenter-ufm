import h5py
import duckdb
from filters.filters.apply_filters import apply
from filters.cpoints.apply_contact_point_filters import apply_cp_filters
from filters.fmodels.apply_fmodels import apply_fmodels
from filters.emodels.apply_emodels import apply_emodels
from typing import Dict, Tuple, List, Optional
from filters.register_all import register_filters
import pandas as pd  # Ensure pandas is imported
import json
import hashlib
import os
import math
import asyncio
from typing import AsyncGenerator

# Use the same DB path as main.py to avoid configuration conflicts
# This should match DB_PATH in main.py exactly
DB_PATH = os.path.join("data", "experiment.db")

# Singleton connection to ensure consistent DuckDB configuration
_conn_singleton = None

def get_conn():
    """
    Return a module-level singleton DuckDB connection with consistent configuration.
    This ensures all code paths use the same connection config to avoid
    DuckDB's "different configuration" error.
    
    Returns:
        duckdb.DuckDBPyConnection: A DuckDB connection with consistent config
    """
    global _conn_singleton
    if _conn_singleton is None:
        # Use read/write to match WebSocket connection config (DuckDB constraint: same config per process)
        _conn_singleton = duckdb.connect(DB_PATH)
        # Register filters on first connection
        register_filters(_conn_singleton)
        # Ensure cache tables exist
        ensure_cache_tables(_conn_singleton)
    return _conn_singleton

def _json_hash(obj) -> str:
    """Create a stable hash from a JSON-serializable object."""
    json_str = json.dumps(obj, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()

def ensure_cache_tables(conn: duckdb.DuckDBPyConnection):
    """Create cache tables for contact_points, indentations, and elspectra if they don't exist."""
    # Create contact_points cache table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contact_points (
            curve_id INTEGER,
            method VARCHAR,
            params_hash VARCHAR,
            cp_values DOUBLE[][],
            spring_constant DOUBLE,
            tip_radius DOUBLE,
            tip_geometry VARCHAR,
            PRIMARY KEY (curve_id, method, params_hash)
        )
    """)
    
    # Create indentations cache table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS indentations (
            curve_id INTEGER,
            cp_hash VARCHAR,
            zi DOUBLE[],
            fi DOUBLE[],
            PRIMARY KEY (curve_id, cp_hash)
        )
    """)
    
    # Create elspectra cache table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS elspectra (
            curve_id INTEGER,
            spec_hash VARCHAR,
            ze DOUBLE[],
            ee DOUBLE[],
            PRIMARY KEY (curve_id, spec_hash)
        )
    """)

def get_metadata_for_curves(conn: duckdb.DuckDBPyConnection, curve_ids: List[str]) -> Dict:
    """
    Retrieve metadata (spring_constant, tip_radius, tip_geometry) for the given curves.
    Returns a dictionary with metadata values, using the first curve's values as representative.
    """
    if not curve_ids:
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere'
        }
    
    # Convert curve_ids to numeric format
    numeric_curve_ids = []
    for cid in curve_ids:
        if cid.startswith('curve'):
            try:
                numeric_id = int(cid[5:])
                numeric_curve_ids.append(str(numeric_id))
            except ValueError:
                continue
        else:
            numeric_curve_ids.append(cid)
    
    if not numeric_curve_ids:
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere'
        }
    
    try:
        # Get metadata from the first curve (assuming all curves have same metadata)
        result = conn.execute(f"""
            SELECT spring_constant, tip_radius, tip_geometry
            FROM force_vs_z 
            WHERE curve_id = {numeric_curve_ids[0]}
            LIMIT 1
        """).fetchone()
        
        if result:
            spring_constant, tip_radius, tip_geometry = result
            return {
                'spring_constant': spring_constant or 1.0,
                'tip_radius': tip_radius or 1e-5,
                'tip_geometry': tip_geometry or 'sphere'
            }
        else:
            return {
                'spring_constant': 1.0,
                'tip_radius': 1e-5,
                'tip_geometry': 'sphere'
            }
    except Exception as e:
        print(f"Error retrieving metadata: {e}")
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere'
        }



def fetch_curves_batch(conn: duckdb.DuckDBPyConnection, curve_ids: List[str], filters: Dict, single = False, metadata: Dict = None, set_zero_force: bool = True, elasticity_params: Dict = None, elastic_model_params: Dict = None, force_model_params: Dict = None, compute_elspectra: bool = True) -> Tuple[List[Dict], Dict]:
    """
    Fetches a batch of curve data from DuckDB and applies filters dynamically in SQL.
    
    Args:
        conn: DuckDB connection object
        curve_ids: List of curve IDs to fetch
        filters: Dictionary of filters to apply (e.g., {'min_force': 0.1, 'max_z': 10})
        single: Whether to fetch single curve data
        metadata: Dictionary containing metadata values
        set_zero_force: Whether to set zero force at contact point
        elasticity_params: Dictionary containing elasticity parameters
        elastic_model_params: Dictionary containing elastic model parameters
        force_model_params: Dictionary containing force model parameters
        compute_elspectra: Whether to compute elasticity spectra (skip if only fparams needed)
    
    Returns:
        Tuple containing:
        - graph_force_vs_z: Dict with curves and domain for Force vs Z
        - graph_force_indentation: Dict with curves and domain for Force vs Indentation
        - graph_elspectra: Dict with curves and domain for Elspectra
    """
    
    # Set default values for new parameters
    if elastic_model_params is None:
        elastic_model_params = {"maxInd": 800, "minInd": 0}
    if force_model_params is None:
        force_model_params = {"maxInd": 800, "minInd": 0, "poisson": 0.5}
    # print(f"Fetching batch of {len(curve_ids)} curves...")
    
    # Extract regular and cp_filters from the input
    regular_filters = filters.get("regular", {})
    cp_filters = filters.get("cp_filters", {})
    
    # Base query for specific curve IDs
    # Extract numeric curve IDs from strings like "curve0" -> 0
    numeric_curve_ids = []
    for cid in curve_ids:
        if cid.startswith('curve'):
            try:
                numeric_id = int(cid[5:])  # Remove "curve" prefix
                numeric_curve_ids.append(str(numeric_id))
            except ValueError:
                continue
        else:
            numeric_curve_ids.append(cid)
    
    # Auto-enable single when exactly one curve and at least one model is requested
    if not single:
        if len(numeric_curve_ids) == 1 and (filters.get("f_models") or filters.get("e_models")):
            single = True
    
    # ---- CACHING SETUP ----
    ensure_cache_tables(conn)  # safe to call repeatedly
    
    # Identify the active CP UDF + params (pick first enabled entry)
    active_cp = None
    cp_method = None
    cp_params_hash = None
    
    if cp_filters:
        for name, cfg in cp_filters.items():
            # treat any present cp filter as active; tweak if you have an 'enabled' flag
            active_cp = (name, cfg)
            cp_method = name  # e.g., 'autothresh' / 'gofsphere'
            # hash includes params + metadata that influence CP
            cp_hash_payload = {
                "method": cp_method,
                "params": cfg,  # whole dict is okay; contains param array
                "spring_constant": metadata.get("spring_constant") if metadata else None,
                "tip_radius": metadata.get("tip_radius") if metadata else None,
                "tip_geometry": metadata.get("tip_geometry") if metadata else None,
            }
            cp_params_hash = _json_hash(cp_hash_payload)
            break
    
    base_query = """
        SELECT curve_id, z_values, force_values 
        FROM force_vs_z 
        WHERE curve_id IN ({})
    """.format(",".join(numeric_curve_ids))

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
        # Build cache-aware CP query
        ids_csv = ",".join(numeric_curve_ids)
        
        # 1) cached rows for these curves, method, and params_hash
        cp_cached_cte = f"""
        cp_cached AS (
            SELECT curve_id, cp_values, spring_constant, tip_radius, tip_geometry
            FROM contact_points
            WHERE method = '{cp_method}'
              AND params_hash = '{cp_params_hash}'
              AND curve_id IN ({ids_csv})
        )
        """
        
        # 2) generate the original CP query for computing misses
        query_cp = apply_cp_filters(base_query, cp_filters, curve_ids, metadata)
        # print(f"Generated cp query: {query_cp}")
        
        # 3) compute rows only for missing curve_ids
        query_cp_miss = f"""
            WITH base AS ({query_cp})
            SELECT curve_id, z_values, force_values,
                   cp_values, spring_constant, tip_radius, tip_geometry
            FROM base
            WHERE curve_id NOT IN (SELECT curve_id FROM cp_cached)
        """
        cp_compute_cte = f"cp_compute AS ({query_cp_miss})"
        
        # 4) unified cp_data = cached ∪ computed (need z_values and force_values for indentation)
        cp_data_cte = """
        cp_data AS (
            SELECT c.curve_id, f.z_values, f.force_values, c.cp_values, c.spring_constant, c.tip_radius, c.tip_geometry
            FROM cp_compute c
            LEFT JOIN force_vs_z f ON f.curve_id = c.curve_id
            UNION ALL
            SELECT c.curve_id, f.z_values, f.force_values, c.cp_values, c.spring_constant, c.tip_radius, c.tip_geometry
            FROM cp_cached c
            LEFT JOIN force_vs_z f ON f.curve_id = c.curve_id
        )
        """
        
        # Parameters for indentation and elspectra
        # Note: Metadata values (spring_constant, tip_radius, tip_geometry) are now retrieved from database
        # set_zero_force is now passed as a parameter from the frontend
        
        # Use elasticity parameters from frontend if provided, otherwise use defaults
        if elasticity_params:
            win = elasticity_params.get("window", 61)
            order = elasticity_params.get("order", 2)
            interp = elasticity_params.get("interpolate", True)
            print(f"🔧 Using elasticity parameters from frontend: win={win}, order={order}, interp={interp}")
        else:
            win = 61
            order = 2
            interp = True
            print(f"🔧 Using default elasticity parameters: win={win}, order={order}, interp={interp}")
        
        # Log elastic model parameters
        print(f"🔧 Using elastic model parameters: maxInd={elastic_model_params.get('maxInd', 800)}, minInd={elastic_model_params.get('minInd', 0)}")
        
        # Log force model parameters  
        print(f"🔧 Using force model parameters: maxInd={force_model_params.get('maxInd', 800)}, minInd={force_model_params.get('minInd', 0)}, poisson={force_model_params.get('poisson', 0.5)}")
        
        tip_angle = 30.0
        
        # Define defaults for model parameters
        # model = 'hertz'
        # poisson = 0.5
        # zi_min = 0.0
        # zi_max = 800.0
        
        # Get fmodels from filters and override defaults if present
        fmodels = filters.get('f_models', {})
        if fmodels:
            query_fmodels = apply_fmodels("", fmodels, curve_ids, force_model_params) if fmodels else None
        
        
        emodels = filters.get('e_models', {})
        if emodels:
            # print("emodel exists", emodels)
            query_emodels = apply_emodels("", emodels, curve_ids, elastic_model_params) if emodels else None
        
        # Determine what we actually need - only compute elspectra if explicitly requested or if emodels present
        need_emodels = bool(emodels)
        need_fmodels = bool(fmodels)
        need_elspectra = compute_elspectra or need_emodels  # elspectra only if explicitly asked or emodels present

        # Construct the batch query
        # Precompute CTEs to ensure proper formatting
        fmodels_cte = f"fmodels_results AS (\n    {query_fmodels}\n)" if fmodels else ""
        emodels_cte = f"emodels_results AS (\n    {query_emodels}\n)" if emodels else ""

        # Comma logic
        comma_after_base = fmodels or emodels  # Comma if any CTE follows base_results
        comma_between = fmodels and emodels    # Comma only if both fmodels and emodels are present

        # Build base_results CTE conditionally based on whether elspectra is needed
        # Include cp_values for hash computation
        if need_elspectra:
            base_results_cte = f"""
            base_results AS (
                SELECT 
                    i.curve_id,
                    i.indentation_result AS indentation,
                    i.cp_values,
                    calc_elspectra(
                        i.indentation_result[1],
                        i.indentation_result[2],
                        {win}, 
                        {order}, 
                        i.tip_geometry, 
                        i.tip_radius, 
                        {tip_angle}, 
                        {interp}
                    ) AS elspectra_result
                FROM indentation_data i
                WHERE i.indentation_result IS NOT NULL
            )"""
        else:
            # Skip elspectra calculation - just return NULL to avoid expensive interpolation + derivative
            base_results_cte = """
            base_results AS (
                SELECT 
                    i.curve_id,
                    i.indentation_result AS indentation,
                    i.cp_values,
                    NULL AS elspectra_result
                FROM indentation_data i
                WHERE i.indentation_result IS NOT NULL
            )"""

        batch_query = f"""
            WITH
            {cp_cached_cte},
            {cp_compute_cte},
            {cp_data_cte},
            indentation_data AS (
                SELECT 
                    curve_id,
                    calc_indentation(
                        z_values, 
                        force_values, 
                        cp_values,
                        spring_constant, 
                        {set_zero_force}
                    ) AS indentation_result,
                    cp_values,
                    spring_constant,
                    tip_radius,
                    tip_geometry
                FROM cp_data
                WHERE cp_values IS NOT NULL
            ),
            {base_results_cte}{(',' if comma_after_base else '')}
            {fmodels_cte}{(',' if comma_between else '')}
            {emodels_cte}
            SELECT 
                b.curve_id,
                b.indentation,
                b.elspectra_result,
                b.cp_values,
                {'f.fmodel_values' if fmodels else 'NULL AS hertz_result'},
                {'e.emodel_values' if emodels else 'NULL AS elastic_result'}
            FROM base_results b
            {'LEFT JOIN fmodels_results f ON b.curve_id = f.curve_id' if fmodels else ''}
            {'LEFT JOIN emodels_results e ON b.curve_id = e.curve_id' if emodels else ''}
        """
        
        try:
            result_batch = conn.execute(batch_query).fetchall()
            
            # Persist newly computed CPs into cache
            if cp_filters:
                try:
                    # 1) Materialize the CTE as a temp table
                    conn.execute(f"""
                        CREATE TEMP TABLE computed_cps AS
                        SELECT curve_id, cp_values, spring_constant, tip_radius, tip_geometry
                        FROM ({query_cp}) base
                        WHERE curve_id NOT IN (
                            SELECT curve_id FROM contact_points
                            WHERE method = ? AND params_hash = ? AND curve_id IN ({ids_csv})
                        )
                        AND cp_values IS NOT NULL
                    """, [cp_method, cp_params_hash])

                    # 2) Remove stale rows for these curve_ids + (method, params_hash)
                    conn.execute("""
                        DELETE FROM contact_points
                        WHERE method = ? AND params_hash = ?
                          AND curve_id IN (SELECT curve_id FROM computed_cps)
                    """, [cp_method, cp_params_hash])

                    # 3) Insert fresh rows
                    conn.execute("""
                        INSERT INTO contact_points
                            (curve_id, method, params_hash, cp_values, spring_constant, tip_radius, tip_geometry)
                        SELECT curve_id, ?, ?, cp_values, spring_constant, tip_radius, tip_geometry
                        FROM computed_cps
                    """, [cp_method, cp_params_hash])

                    # 4) Cleanup
                    conn.execute("DROP TABLE computed_cps")
                except Exception as cache_error:
                    # Log but don't fail the main query if cache insert fails
                    print(f"Warning: Failed to cache contact points: {cache_error}")
        except Exception as e:
            print(f"Error in combined batch query: {e}")
            raise
        
        curves_cp = []
        curves_el = []
        curves_fparam = []
        curves_elasticity_param = []
        # print("result batch", result_batch)
        # print("emodels:", emodels)
        # print("single:", single)
        for i, row in enumerate(result_batch):
            # Extract cp_values if present (added for caching)
            if len(row) >= 5:
                curve_id, indentation_result, elspectra_result, cp_values, hertz_result = row[0], row[1], row[2], row[3] if len(row) > 3 else None, row[4] if len(row) > 4 else None
                if len(row) > 5:
                    elastic_result = row[5]
                else:
                    elastic_result = None
            else:
                curve_id, indentation_result, elspectra_result, hertz_result, elastic_result = row[0], row[1], row[2], row[3] if len(row) > 3 else None, row[4] if len(row) > 4 else None
                cp_values = None
            # print("indentation_result",indentation_result)
            # print("elspectra_result", elspectra_result)
            # print("elastic_result", elastic_result)
            if indentation_result is not None:
                zi, fi = indentation_result
                curves_cp.append({
                    "curve_id": f"curve{curve_id}",
                    "x": zi,
                    "y": fi
                })
                
                # Cache indentation result using cp_hash
                try:
                    # Compute cp_hash from cp_values for this curve
                    if cp_values is not None:
                        cp_hash = _json_hash(cp_values)
                        # Insert into cache (ON CONFLICT DO NOTHING for DuckDB compatibility)
                        # DuckDB doesn't support ON CONFLICT, so we check first
                        existing = conn.execute("""
                            SELECT curve_id FROM indentations 
                            WHERE curve_id = ? AND cp_hash = ?
                        """, [int(curve_id), cp_hash]).fetchone()
                        
                        if not existing:
                            conn.execute("""
                                INSERT INTO indentations (curve_id, cp_hash, zi, fi)
                                VALUES (?, ?, ?, ?)
                            """, [int(curve_id), cp_hash, zi, fi])
                except Exception as cache_err:
                    # Log but don't fail the main query if cache insert fails
                    print(f"Warning: Failed to cache indentation for curve {curve_id}: {cache_err}")
                if hertz_result is not None and fmodels and single:
                    # print("hertz_result", len(hertz_result))
                    x, y, fparam = hertz_result
                    # print(len(x),len(y))
                    curves_cp.append({
                        "curve_id": f"{curve_id}_hertz",
                        "x": x,
                        "y": y
                    })
                    # 👉 Append fparam with curve index - return all parameters
                    curves_fparam.append({
                        "curve_index": i,
                        "fparam": fparam  # Return all parameters, not just fparam[0]
                    })
            
            
            if elspectra_result is not None:
                ze, e = elspectra_result
                # print("ze, e",ze, e)
                curves_el.append({
                    "curve_id": f"curve{curve_id}",
                    "x": ze,
                    "y": e
                })
                
                # Cache elspectra result using spec_hash
                try:
                    # Compute cp_hash from cp_values if available
                    cp_hash = None
                    if cp_values is not None:
                        cp_hash = _json_hash(cp_values)
                    
                    # Build spec_payload with cp_hash and elasticity params
                    spec_payload = {
                        "cp_hash": cp_hash,
                        "win": win if need_elspectra else None,
                        "order": order if need_elspectra else None,
                        "interp": interp if need_elspectra else None,
                        "tip_geometry": metadata.get("tip_geometry") if metadata else None,
                        "tip_radius": metadata.get("tip_radius") if metadata else None,
                        "tip_angle": tip_angle,
                    }
                    spec_hash = _json_hash(spec_payload)
                    
                    # Insert into cache (check first since DuckDB doesn't support ON CONFLICT)
                    existing = conn.execute("""
                        SELECT curve_id FROM elspectra 
                        WHERE curve_id = ? AND spec_hash = ?
                    """, [int(curve_id), spec_hash]).fetchone()
                    
                    if not existing:
                        conn.execute("""
                            INSERT INTO elspectra (curve_id, spec_hash, ze, ee)
                            VALUES (?, ?, ?, ?)
                        """, [int(curve_id), spec_hash, ze, e])
                except Exception as cache_err:
                    # Log but don't fail the main query if cache insert fails
                    print(f"Warning: Failed to cache elspectra for curve {curve_id}: {cache_err}")
                if elastic_result is not None and emodels and single:
                    # print("elastic_result", elastic_result)
                    x, y, elasticity_param = elastic_result
                    curves_el.append({
                        "curve_id": f"{curve_id}_elastic",
                        "x": x,
                        "y": y
                    })
                    # 👉 Append elasticity_param with curve index
                    curves_elasticity_param.append({
                        "curve_index": i,
                        "elasticity_param": elasticity_param
                    })
        
        print("cp filters applied, batch indentation and elspectra calculated")
        print("curves_elasticity_param count:", len(curves_elasticity_param))
        all_curves_data = {
                "curves_cp": curves_cp,
                "curves_fparam": curves_fparam,
                "curves_elasticity_param": curves_elasticity_param
            }
        if curves_cp:
            domain_cp = compute_domain(conn, curves_cp, "curves_temp_cp")
            graph_force_indentation = {"curves": all_curves_data, "domain": domain_cp}
        
        if curves_el:
            domain_el = compute_domain(conn, curves_el, "curves_temp_el")
            # For elspectra, keep curves as a flat array for frontend compatibility
            # but include elasticity parameters separately if they exist
            graph_elspectra = {"curves": curves_el, "domain": domain_el}
            
            # Add elasticity parameters as a separate field if they exist
            if curves_elasticity_param:
                graph_elspectra["curves_elasticity_param"] = curves_elasticity_param

    return graph_force_vs_z, graph_force_indentation, graph_elspectra


def _select_curve_ids(conn, filters: Dict, num_curves: Optional[int] = None) -> List[str]:
    """
    Select curve IDs from database after applying filters.
    
    Args:
        conn: DuckDB connection
        filters: Filter dictionary
        num_curves: Optional limit on number of curves
    
    Returns:
        List of curve ID strings (e.g., ["0", "1", "2"])
    """
    # Build query - for now, simple selection; can be enhanced with filter logic
    q = "SELECT DISTINCT curve_id FROM force_vs_z ORDER BY curve_id"
    if num_curves:
        q += f" LIMIT {int(num_curves)}"
    result = conn.execute(q).fetchall()
    # Convert to string format that fetch_curves_batch expects
    return [f"curve{row[0]}" if isinstance(row[0], int) else str(row[0]) for row in result]


async def compute_elasticity_params_batched(
    conn, 
    filters: Dict, 
    num_curves: Optional[int] = None, 
    batch_size: int = 50,
    elasticity_params: Optional[Dict] = None,
    elastic_model_params: Optional[Dict] = None
) -> AsyncGenerator[Tuple[int, int, int, int, List[Dict]], None]:
    """
    Async generator yielding batches of elasticity parameters with progress.
    
    Yields: (batch_idx, total_batches, done_so_far, total_curves, rows_for_this_batch)
    
    Each row is a dict with:
        - curve_index: int
        - elasticity_param: List[float] (parameter values)
    """
    # Select curve IDs
    curve_ids = _select_curve_ids(conn, filters, num_curves)
    total = len(curve_ids)
    
    if total == 0:
        # Yield empty batch to let stream finish gracefully
        yield (0, 0, 0, 0, [])
        return
    
    total_batches = math.ceil(total / batch_size)
    done = 0
    metadata_cache = {}  # Cache metadata per curve
    
    for i in range(total_batches):
        batch_ids = curve_ids[i * batch_size:(i + 1) * batch_size]
        
        # Get metadata for this batch
        metadata = get_metadata_for_curves(conn, batch_ids)
        
        # Compute elasticity params for this batch using existing pipeline
        g_fvz, g_fi, g_el = fetch_curves_batch(
            conn,
            batch_ids,
            filters,
            single=True,
            metadata=metadata,
            compute_elspectra=True,
            elasticity_params=elasticity_params,
            elastic_model_params=elastic_model_params
        )
        
        # Extract elasticity params from result
        rows = []
        if g_el and isinstance(g_el, dict):
            elasticity_params_list = g_el.get("curves_elasticity_param", [])
            for param_dict in elasticity_params_list:
                # Convert to expected format
                curve_idx = param_dict.get("curve_index", 0)
                elasticity_param = param_dict.get("elasticity_param", [])
                rows.append({
                    "curve_index": curve_idx,
                    "elasticity_param": elasticity_param
                })
        
        done += len(batch_ids)
        # Yield progress + rows
        yield (i + 1, total_batches, done, total, rows)
        # Let the event loop breathe so SSE flushes
        await asyncio.sleep(0)
               
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