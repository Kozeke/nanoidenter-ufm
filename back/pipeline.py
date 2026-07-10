# Coordinates DuckDB data access, filtering, and caching for nanoindenter workflows
import h5py
import duckdb
from typing import Dict, Tuple, List, Optional, AsyncGenerator
from filters.filters.apply_filters import apply
from filters.cpoints.apply_contact_point_filters import apply_cp_filters
from filters.fmodels.apply_fmodels import apply_fmodels
from filters.emodels.apply_emodels import apply_emodels
from filters.register_all import register_filters
import pandas as pd  # Ensure pandas is imported
import hashlib
import json
import math
import asyncio
# TEMP COMPATIBILITY LAYER
from db.connection import get_conn
from db.init_db import ensure_cache_tables
# Cache optimization utilities
from utils.cache import (
    warmup_cp_cache, 
    get_cached_indentations, 
    cache_indentations_batch,
    get_cp_cache_key,
    CACHE_ENABLED
)

# Tracks whether cache-enabled status has already been logged for this process.
_cache_status_logged = False

# Stores absolute DuckDB database path for analysis queries
# DB_PATH = "data/all.db"

# Provide stable hash strings for filter dictionaries
def _hash_dict(d: Dict) -> str:
    """
    Stable hash for a filter dictionary.
    Empty dict -> 'no_filters' to avoid None handling in SQL.
    """
    if not d:
        return "no_filters"
    payload = json.dumps(d, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(payload.encode("utf-8")).hexdigest()



def _json_hash(obj) -> str:
    """Create a stable hash from a JSON-serializable object."""
    json_str = json.dumps(obj, sort_keys=True)
    return hashlib.md5(json_str.encode()).hexdigest()


# Emit script-style baseline/K diagnostics for backend-vs-script comparisons.
def _print_import_fit_summary(
    dataset_id: Optional[int],
    baseline_slopes_by_curve: List[Dict[str, float]],
    k_values_by_curve: List[Dict[str, float]],
) -> None:
    """
    Print baseline and K logs in the same format as the standalone script.
    """
    # Store a readable dataset label so logs identify which dataset produced the numbers.
    dataset_label = f"dataset_id={dataset_id}" if dataset_id is not None else "dataset_id=unknown"
    print(f"Processed {dataset_label}")

    # Store the number of unique curves that contributed to baseline/K diagnostics.
    unique_curve_ids = sorted(
        {
            row.get("curve_id")
            for row in baseline_slopes_by_curve + k_values_by_curve
            if row.get("curve_id") is not None
        }
    )
    print(f"Curves used: {len(unique_curve_ids)}")
    print()

    print("Baseline drift slope from detrending:")
    for row in baseline_slopes_by_curve:
        # Store curve identifier in the same "curveN" format used by the script output.
        curve_name = str(row["curve_id"])
        # Store baseline slope value; numerically identical in nN/nm and N/m.
        slope_n_per_m = float(row["slope_n_per_m"])
        print(f"{curve_name}: {slope_n_per_m:.6g} nN/nm ({slope_n_per_m:.6g} N/m)")

    if baseline_slopes_by_curve:
        # Store all baseline slopes for mean/std aggregation across processed curves.
        slope_values = [float(row["slope_n_per_m"]) for row in baseline_slopes_by_curve]
        # Store mean baseline slope in script-matching units and formatting.
        mean_slope = sum(slope_values) / len(slope_values)
        # Store sample standard deviation to match script behavior (ddof=1 when n>1).
        if len(slope_values) > 1:
            std_slope = math.sqrt(sum((value - mean_slope) ** 2 for value in slope_values) / (len(slope_values) - 1))
        else:
            std_slope = 0.0
        print()
        print(f"Average baseline drift slope: {mean_slope:.6g} +/- {std_slope:.6g} nN/nm")
        print(f"Average baseline drift slope: {mean_slope:.6g} +/- {std_slope:.6g} N/m")

    print()
    print("K from each curve:")
    for row in k_values_by_curve:
        # Store curve identifier in the same "curveN" format used by the script output.
        curve_name = str(row["curve_id"])
        # Store stiffness slope value; numerically identical in nN/nm and N/m.
        k_n_per_m = float(row["k_n_per_m"])
        print(f"{curve_name}: {k_n_per_m:.6g} nN/nm ({k_n_per_m:.6g} N/m)")

    if k_values_by_curve:
        # Store all K values for mean/std aggregation across processed curves.
        k_values = [float(row["k_n_per_m"]) for row in k_values_by_curve]
        # Store mean K in script-matching units and formatting.
        mean_k = sum(k_values) / len(k_values)
        # Store sample standard deviation to match script behavior (ddof=1 when n>1).
        if len(k_values) > 1:
            std_k = math.sqrt(sum((value - mean_k) ** 2 for value in k_values) / (len(k_values) - 1))
        else:
            std_k = 0.0
        print()
        print(f"Average K: {mean_k:.6g} +/- {std_k:.6g} nN/nm")
        print(f"Average K: {mean_k:.6g} +/- {std_k:.6g} N/m")

# Preserve legacy cache structures that store extended intermediate results
# def _ensure_extended_cache_tables(conn: duckdb.DuckDBPyConnection):
#     """Create cache tables for contact_points, indentations, and elspectra if they don't exist."""
#     # Create contact_points cache table
#     conn.execute("""
#         CREATE TABLE IF NOT EXISTS contact_points (
#             curve_id INTEGER,
#             method VARCHAR,
#             params_hash VARCHAR,
#             cp_values DOUBLE[][],
#             spring_constant DOUBLE,
#             tip_radius DOUBLE,
#             tip_geometry VARCHAR,
#             PRIMARY KEY (curve_id, method, params_hash)
#         )
#     """)
    
#     # Create indentations cache table
#     conn.execute("""
#         CREATE TABLE IF NOT EXISTS indentations (
#             curve_id INTEGER,
#             cp_hash VARCHAR,
#             zi DOUBLE[],
#             fi DOUBLE[],
#             PRIMARY KEY (curve_id, cp_hash)
#         )
#     """)
    
#     # Create elspectra cache table
#     conn.execute("""
#         CREATE TABLE IF NOT EXISTS elspectra (
#             curve_id INTEGER,
#             spec_hash VARCHAR,
#             ze DOUBLE[],
#             ee DOUBLE[],
#             PRIMARY KEY (curve_id, spec_hash)
#         )
#     """)

def get_metadata_for_curves(conn: duckdb.DuckDBPyConnection, curve_ids: List[str], dataset_id: int = None) -> Dict:
    """
    Retrieve metadata (spring_constant, tip_radius, tip_geometry, tip_angle) for the given curves.
    Returns a dictionary with metadata values, using the first curve's values as representative.
    """
    if not curve_ids:
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere',
            'tip_angle': 0.0,
        }
    
    # Convert "curveN" strings to plain integers for safe SQL parameterisation.
    numeric_curve_ids = []
    for cid in curve_ids:
        if isinstance(cid, str) and cid.startswith('curve'):
            try:
                numeric_curve_ids.append(int(cid[5:]))
            except ValueError:
                continue
        else:
            try:
                numeric_curve_ids.append(int(cid))
            except (ValueError, TypeError):
                continue

    if not numeric_curve_ids:
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere',
            'tip_angle': 0.0,
        }

    try:
        # Stores dataset-level metadata row, which is the authoritative source for user edits.
        dataset_metadata_row = None
        # Prevent crash if datasets lookup fails or older schema is missing columns.
        try:
            if dataset_id is not None:
                # Retrieves authoritative dataset metadata from datasets table for this dataset.
                dataset_metadata_row = conn.execute(
                    """
                    SELECT spring_constant, tip_radius, tip_geometry, tip_angle
                    FROM datasets
                    WHERE id = ?
                    LIMIT 1
                    """,
                    (dataset_id,),
                ).fetchone()
        except Exception:
            dataset_metadata_row = None

        # Stores curve-level metadata row used only as a fallback for missing dataset values.
        curve_metadata_row = None
        # Get metadata from the first curve (assuming all curves share the same metadata).
        # Use parameterised queries (?) so the values are never interpolated as SQL identifiers.
        if dataset_id is not None:
            curve_metadata_row = conn.execute(
                """
                SELECT spring_constant, tip_radius, tip_geometry
                FROM force_vs_z
                WHERE dataset_id = ? AND curve_id = ?
                LIMIT 1
                """,
                (dataset_id, numeric_curve_ids[0]),
            ).fetchone()
        else:
            curve_metadata_row = conn.execute(
                """
                SELECT spring_constant, tip_radius, tip_geometry
                FROM force_vs_z
                WHERE curve_id = ?
                LIMIT 1
                """,
                (numeric_curve_ids[0],),
            ).fetchone()

        # Stores dataset-level values, because these should override stale curve-level values.
        ds_spring_constant = None
        ds_tip_radius = None
        ds_tip_geometry = None
        ds_tip_angle = None
        if dataset_metadata_row:
            ds_spring_constant, ds_tip_radius, ds_tip_geometry, ds_tip_angle = dataset_metadata_row

        # Stores curve-level fallback values for legacy rows with incomplete dataset metadata.
        curve_spring_constant = None
        curve_tip_radius = None
        curve_tip_geometry = None
        if curve_metadata_row:
            curve_spring_constant, curve_tip_radius, curve_tip_geometry = curve_metadata_row

        return {
            'spring_constant': (
                ds_spring_constant
                if ds_spring_constant is not None
                else (curve_spring_constant if curve_spring_constant is not None else 1.0)
            ),
            'tip_radius': (
                ds_tip_radius
                if ds_tip_radius is not None
                else (curve_tip_radius if curve_tip_radius is not None else 1e-5)
            ),
            'tip_geometry': (
                ds_tip_geometry
                if ds_tip_geometry is not None
                else (curve_tip_geometry if curve_tip_geometry is not None else 'sphere')
            ),
            # Preserve explicit 0.0 values; only default when metadata is truly missing.
            'tip_angle': ds_tip_angle if ds_tip_angle is not None else 0.0,
        }
    except Exception as e:
        print(f"Error retrieving metadata: {e}")
        return {
            'spring_constant': 1.0,
            'tip_radius': 1e-5,
            'tip_geometry': 'sphere',
            'tip_angle': 0.0,
        }



def fetch_curves_batch(conn: duckdb.DuckDBPyConnection, curve_ids: List[str], filters: Dict, single = False, metadata: Dict = None, set_zero_force: bool = True, elasticity_params: Dict = None, elastic_model_params: Dict = None, force_model_params: Dict = None, compute_elspectra: bool = True, force_model_population: bool = False, elastic_model_population: bool = False, dataset_id: int = None, segment_type: str = "segment0") -> Tuple[List[Dict], Dict]:
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
    global _cache_status_logged
    # Emits cache toggle state once so runtime behavior is visible in logs.
    if not _cache_status_logged:
        print(f"🧠 Cache enabled: {CACHE_ENABLED}")
        _cache_status_logged = True

    # Stores request metadata overrides ensuring fallbacks for indentation defaults
    meta = metadata or {}

    # Prevent crash if metadata includes non-numeric spring constant
    try:
        # Provides finite fallback spring constant for indentation guards
        k_default = float(meta.get("spring_constant", 1.0))
    except (TypeError, ValueError):
        k_default = 1.0
    if not math.isfinite(k_default) or k_default == 0.0:
        k_default = 1.0

    # Prevent crash if metadata includes non-numeric tip radius
    try:
        # Supplies finite fallback tip radius used in indentation metadata
        r_default = float(meta.get("tip_radius", 1e-5))
    except (TypeError, ValueError):
        r_default = 1e-5
    if not math.isfinite(r_default) or r_default <= 0.0:
        r_default = 1e-5

    # Stores raw tip geometry metadata before sanitizing for SQL
    tip_geometry_value = meta.get("tip_geometry", "sphere")
    # Captures request-provided tip geometry fallback for indentation metadata
    g_default = str(tip_geometry_value) if tip_geometry_value is not None else "sphere"
    # Escapes default tip geometry for safe SQL literal embedding
    g_default_sql = g_default.replace("'", "''")

    # Set default values for new parameters
    if elastic_model_params is None:
        elastic_model_params = {"maxInd": 800, "minInd": 0}
    if force_model_params is None:
        force_model_params = {"maxInd": 800, "minInd": 0, "poisson": 0.5}

    # Propagate the actual tip_radius into elastic_model_params so that geometry-
    # aware emodels (e.g. BilayerModel) use the same R that calc_elspectra used
    # when building the elastic spectrum for each curve.
    elastic_model_params = {**elastic_model_params, "tip_radius": r_default}
    
    # Also propagate tip_radius into force_model_params so that geometry-aware
    # fmodels (e.g. HertzFmodel, DriftedHertzModel) use the same R that was used
    # for indentation and elspectra calculations.
    force_model_params = {**force_model_params, "tip_radius": r_default}
    # print(f"Fetching batch of {len(curve_ids)} curves...")
    
    # Extract regular and cp_filters from the input
    regular_filters = filters.get("regular", {})
    cp_filters = filters.get("cp_filters", {})
    
    # Base query for specific curve IDs
    # Extract numeric curve IDs from strings like "curve0" -> 0
    # Convert to integers for proper SQL type handling (curve_id is INTEGER in database)
    numeric_curve_ids = []
    for cid in curve_ids:
        if isinstance(cid, str) and cid.startswith('curve'):
            try:
                numeric_id = int(cid[5:])  # Remove "curve" prefix
                numeric_curve_ids.append(numeric_id)  # Store as integer, not string
            except ValueError:
                continue
        else:
            # Convert string to integer if it's a numeric string
            try:
                numeric_curve_ids.append(int(cid))
            except (ValueError, TypeError):
                continue
    
    # Guarantee cache tables exist before applying hash-based lookups
    ensure_cache_tables(conn)

    # DO NOT override set_zero_force here ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ use the value passed from the caller
    # set_zero_force stays whatever fetch_curves_batch(...) received

    # Auto-enable single ONLY for interactive mode
    if not single and not force_model_population and not elastic_model_population:
        if len(numeric_curve_ids) == 1 and (filters.get("f_models") or filters.get("e_models")):
            single = True

    
    # ---- CACHING SETUP ----
    
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
                "tip_angle": metadata.get("tip_angle") if metadata else None,
                "dataset_id": dataset_id,  # Include dataset_id so trimming invalidates the hash
            }
            cp_params_hash = _json_hash(cp_hash_payload)
            break
    
    # Build base query with dataset_id and segment filters.
    from segment_utils import segment_types_sql, segment_types_for_filter
    segment_sql = segment_types_sql(segment_type)
    if dataset_id is not None:
        base_query = """
            SELECT curve_id, z_values, force_values 
            FROM force_vs_z 
            WHERE dataset_id = {} AND {} AND curve_id IN ({})
        """.format(dataset_id, segment_sql, ",".join(map(str, numeric_curve_ids)))
    else:
        base_query = """
            SELECT curve_id, z_values, force_values 
            FROM force_vs_z 
            WHERE {} AND curve_id IN ({})
        """.format(segment_sql, ",".join(map(str, numeric_curve_ids)))

    # --- Graph 1: Force vs Z (Regular Filters) ---
    # Pull FixedBaseline and LinearWindowFit out of the SQL chain so neither
    # silently overwrites the displayed curve, and so their per-curve fit
    # results (baseline curve, K slope) can be reliably read back — the
    # DuckDB UDF path shares one filter instance across every row in a
    # batched query, so instance attributes aren't safe to read there.
    # Both are applied here in Python, in the same order they'd have run in
    # the SQL chain, then shown as separate overlay curves — the same
    # pattern used for the Hertz fit overlay ("{curve_id}_hertz") further
    # down in this function.
    regular_filters_for_sql = dict(regular_filters)
    baseline_cfg = regular_filters_for_sql.pop("fixedbaseline", None)
    linfit_cfg = regular_filters_for_sql.pop("linearwindowfit", None)

    query_regular = apply(base_query, regular_filters_for_sql, curve_ids)
    result_regular = conn.execute(query_regular).fetchall()

    curves_regular = []
    curves_kfit = []  # scalar K per curve, collected for mean ± std aggregation
    # Collect per-curve baseline slopes so backend logs can mirror script diagnostics.
    baseline_slopes_by_curve = []
    _curves_for_avg_line = []  # (z_values, working_y) pairs, collected only if linfit_cfg is active

    for row in result_regular:
        curve_id, z_values, force_values = row[0], row[1], row[2]
        # Store stable script-style curve label used by all diagnostic log lines.
        curve_label = f"curve{curve_id}"

        # working_y tracks the curve as it passes through whichever of
        # FixedBaseline / LinearWindowFit were popped out above, so the main
        # displayed curve and the K fit both see the fully-corrected signal
        # (e.g. K should be fit on the baseline-corrected curve, not the raw one).
        working_y = force_values

        if baseline_cfg is not None:
            from filters.filters.import_filters.fixed_baseline_filter import FixedBaselineFilter
            bl = FixedBaselineFilter()
            bl.create()
            for pname, pval in baseline_cfg.items():
                if pname in bl.parameters:
                    bl.parameters[pname]["default"] = pval

            corrected_y = bl.calculate(z_values, working_y)
            if bl.last_baseline_slope is not None:
                baseline_slopes_by_curve.append(
                    {
                        "curve_id": curve_label,
                        "slope_n_per_m": float(bl.last_baseline_slope),
                    }
                )

            if bl.last_baseline_values is not None:
                # Drawn across the WHOLE curve, not clipped to the fit window —
                # matches the reference script's `curve.baseline`, which is
                # np.polyval evaluated over the entire z_nm domain (unlike the
                # K line, which the reference script never extrapolates).
                curves_regular.append({
                    "curve_id": f"{curve_id}_baseline",
                    "x": z_values,
                    "y": bl.last_baseline_values
                })

            working_y = corrected_y

        curves_regular.append({
            "curve_id": curve_label,
            "x": z_values,
            "y": working_y
        })

        if linfit_cfg is not None:
            from filters.filters.import_filters.linear_window_fit_filter import LinearWindowFitFilter
            fit = LinearWindowFitFilter()
            fit.create()
            for pname, pval in linfit_cfg.items():
                if pname in fit.parameters:
                    fit.parameters[pname]["default"] = pval

            fitted_y = fit.calculate(z_values, working_y)

            if fit.last_slope_per_meter is not None:
                # Slice down to just the [t1_nm, t2_nm] window using the mask the
                # filter exposes, instead of drawing the fitted line across the
                # whole curve — matches the original script, which only ever
                # draws the fit line within the region it was fit on.
                mask = fit.last_window_mask
                if mask is not None:
                    window_x = [zv for zv, m in zip(z_values, mask) if m]
                    window_y = [fy for fy, m in zip(fitted_y, mask) if m]
                else:
                    window_x, window_y = z_values, fitted_y

                curves_regular.append({
                    "curve_id": f"{curve_id}_linfit",
                    "x": window_x,
                    "y": window_y
                })
                curves_kfit.append({
                    "curve_id": curve_label,
                    "k_n_per_m": fit.last_slope_per_meter
                })

            # Collected regardless of whether this particular curve's own fit
            # succeeded — average_curve_fit_line (below) decides per-curve
            # usability itself, same as the reference script.
            _curves_for_avg_line.append((z_values, working_y))

    if linfit_cfg is not None and len(_curves_for_avg_line) > 0:
        import numpy as np
        try:
            t1_nm = float(linfit_cfg.get("t1_nm", 317.0))
            t2_nm = float(linfit_cfg.get("t2_nm", 580.0))
        except (TypeError, ValueError):
            t1_nm, t2_nm = 317.0, 580.0
        low_m, high_m = sorted((t1_nm * 1e-9, t2_nm * 1e-9))

        # Only curves that actually span the whole [low, high] window are usable —
        # same requirement as the reference script's average_curve_fit_line().
        usable = [
            (zv, wy) for zv, wy in _curves_for_avg_line
            if zv and wy and zv[0] <= low_m and zv[-1] >= high_m and len(zv) == len(wy)
        ]
        if usable:
            z_line = np.linspace(low_m, high_m, 100)
            y_values = [np.interp(z_line, zv, wy) for zv, wy in usable]
            y_mean = np.mean(np.vstack(y_values), axis=0)
            avg_slope, avg_intercept = np.polyfit(z_line, y_mean, 1)
            curves_regular.append({
                "curve_id": "avg_linfit",
                "x": z_line.tolist(),
                "y": (avg_slope * z_line + avg_intercept).tolist()
            })

    # Print script-style diagnostics only when at least one relevant import fit is active.
    if baseline_cfg is not None or linfit_cfg is not None:
        _print_import_fit_summary(dataset_id, baseline_slopes_by_curve, curves_kfit)

    print("graphgorcevsz", len(curves_regular))
    domain_regular = compute_domain(conn, curves_regular, "curves_temp_regular")
    graph_force_vs_z = {"curves": curves_regular, "domain": domain_regular, "curves_kfit": curves_kfit}
    
    # --- Graph 2: Force vs Indentation and Elspectra (CP Filters, if active) ---
    # print("graph_force_vs_z")
    graph_force_indentation = {"curves": [], "domain": {"xMin": None, "xMax": None, "yMin": None, "yMax": None}}
    graph_elspectra = {"curves": [], "domain": {"xMin": None, "xMax": None, "yMin": None, "yMax": None}}
    
    if cp_filters:
        # Build cache-aware CP query - check cache BEFORE computing
        # Convert integer curve_ids to strings for SQL IN clause
        ids_csv = ",".join(map(str, numeric_curve_ids))

        # 1) Check what's already cached (skipped entirely when CACHE_ENABLED=false)
        if CACHE_ENABLED:
            cp_cached_check = f"""
            SELECT curve_id FROM contact_points
            WHERE method = '{cp_method}'
              AND params_hash = '{cp_params_hash}'
              AND curve_id IN ({ids_csv})
            """
            cached_ids = {row[0] for row in conn.execute(cp_cached_check).fetchall()}
            missing_ids = [cid for cid in numeric_curve_ids if cid not in cached_ids]
        else:
            # Caching disabled: treat every curve as a cache miss and compute fresh
            cached_ids = set()
            missing_ids = numeric_curve_ids

        # 2) Only compute for missing IDs
        if missing_ids:
            query_cp = apply_cp_filters(base_query, cp_filters, [str(cid) for cid in missing_ids], metadata)
            query_cp_miss = f"""
                WITH base AS ({query_cp})
                SELECT curve_id, z_values, force_values,
                       cp_values, spring_constant, tip_radius, tip_geometry
                FROM base
            """
            cp_compute_cte = f"cp_compute AS ({query_cp_miss})"
        else:
            # All cached - no computation needed
            cp_compute_cte = "cp_compute AS (SELECT NULL::INTEGER AS curve_id, NULL::DOUBLE[] AS z_values, NULL::DOUBLE[] AS force_values, NULL::DOUBLE[][] AS cp_values, NULL::DOUBLE AS spring_constant, NULL::DOUBLE AS tip_radius, NULL::VARCHAR AS tip_geometry WHERE FALSE)"
        
        # 3) Fetch cached data
        cp_cached_cte = f"""
        cp_cached AS (
            SELECT curve_id, cp_values, spring_constant, tip_radius, tip_geometry
            FROM contact_points
            WHERE method = '{cp_method}'
              AND params_hash = '{cp_params_hash}'
              AND curve_id IN ({ids_csv})
        )
        """
        
        # 4) unified cp_data = cached ∪ computed (need z_values and force_values for indentation)
        # IMPORTANT: always join force_vs_z with dataset_id so we use the trimmed data,
        # not stale rows from another dataset that shares the same curve_id numbering.
        _ds_join = f"AND f.dataset_id = {dataset_id}" if dataset_id is not None else ""
        _segment_types = ", ".join(
            f"'{value}'" for value in segment_types_for_filter(segment_type)
        )
        _segment_join = f"AND f.segment_type IN ({_segment_types})"
        cp_data_cte = f"""
        cp_data AS (
            SELECT c.curve_id, f.z_values, f.force_values, c.cp_values, c.spring_constant, c.tip_radius, c.tip_geometry
            FROM cp_compute c
            LEFT JOIN force_vs_z f ON f.curve_id = c.curve_id {_ds_join} {_segment_join}
            UNION ALL
            SELECT c.curve_id, f.z_values, f.force_values, c.cp_values, c.spring_constant, c.tip_radius, c.tip_geometry
            FROM cp_cached c
            LEFT JOIN force_vs_z f ON f.curve_id = c.curve_id {_ds_join} {_segment_join}
        )
        """
        
        # Optimization: Check indentation cache before computing
        try:
            cp_hash_for_indent = _json_hash({"method": cp_method, "params_hash": cp_params_hash})
        except Exception:
            cp_hash_for_indent = None
        
        cached_indents = {}
        missing_indent_ids = []  # Initialize for use in result processing
        
        # Only use the indentation cache when caching is enabled
        if cp_hash_for_indent and CACHE_ENABLED:
            cached_indents = get_cached_indentations(conn, numeric_curve_ids, cp_hash_for_indent)
            missing_indent_ids = [cid for cid in numeric_curve_ids if cid not in cached_indents]
        else:
            # No cp_hash or caching disabled: compute all curves fresh
            missing_indent_ids = numeric_curve_ids
        
        if cached_indents:
            # print(f"ðŸ"¦ Indentation cache: {len(cached_indents)}/{len(numeric_curve_ids)} hits, {len(missing_indent_ids)} to compute")
            pass
        
        # Build indentation CTE with cache optimization
        if missing_indent_ids and cached_indents:
            # Mixed: some cached, some need computation
            missing_csv = ",".join(map(str, missing_indent_ids))
            indentation_compute_part = f"""
                SELECT 
                    curve_id,
                    calc_indentation(
                        z_values, 
                        force_values, 
                        cp_values,
                        COALESCE(spring_constant, {k_default}), 
                        {set_zero_force}
                    ) AS indentation_result,
                    cp_values,
                    COALESCE(spring_constant, {k_default}) AS spring_constant,
                    COALESCE(tip_radius, {r_default}) AS tip_radius,
                    COALESCE(tip_geometry, '{g_default_sql}') AS tip_geometry
                FROM cp_data
                WHERE cp_values IS NOT NULL
                  AND curve_id IN ({missing_csv})
            """
            
            # Build cached part - reconstruct indentation_result from cached zi, fi
            indentation_cached_part = f"""
                SELECT 
                    i.curve_id,
                    [i.zi, i.fi] AS indentation_result,
                    c.cp_values,
                    COALESCE(c.spring_constant, {k_default}) AS spring_constant,
                    COALESCE(c.tip_radius, {r_default}) AS tip_radius,
                    COALESCE(c.tip_geometry, '{g_default_sql}') AS tip_geometry
                FROM indentations i
                JOIN cp_data c ON i.curve_id = c.curve_id
                WHERE i.cp_hash = '{cp_hash_for_indent}'
                  AND i.curve_id IN ({ids_csv})
                  AND i.curve_id NOT IN ({missing_csv})
            """
            
            indentation_data_cte = f"""
            indentation_data AS (
                {indentation_compute_part}
                UNION ALL
                {indentation_cached_part}
            )"""
        
        elif cached_indents and not missing_indent_ids:
            # All cached - no computation needed
            indentation_data_cte = f"""
            indentation_data AS (
                SELECT 
                    i.curve_id,
                    [i.zi, i.fi] AS indentation_result,
                    c.cp_values,
                    COALESCE(c.spring_constant, {k_default}) AS spring_constant,
                    COALESCE(c.tip_radius, {r_default}) AS tip_radius,
                    COALESCE(c.tip_geometry, '{g_default_sql}') AS tip_geometry
                FROM indentations i
                JOIN cp_data c ON i.curve_id = c.curve_id
                WHERE i.cp_hash = '{cp_hash_for_indent}'
                  AND i.curve_id IN ({ids_csv})
            )"""
        
        else:
            # No cache hits - compute all (original behavior)
            indentation_data_cte = f"""
            indentation_data AS (
                SELECT 
                    curve_id,
                    calc_indentation(
                        z_values, 
                        force_values, 
                        cp_values,
                        COALESCE(spring_constant, {k_default}), 
                        {set_zero_force}
                    ) AS indentation_result,
                    cp_values,
                    COALESCE(spring_constant, {k_default}) AS spring_constant,
                    COALESCE(tip_radius, {r_default}) AS tip_radius,
                    COALESCE(tip_geometry, '{g_default_sql}') AS tip_geometry
                FROM cp_data
                WHERE cp_values IS NOT NULL
            )"""
        
        # Parameters for indentation and elspectra
        # Note: Metadata values (spring_constant, tip_radius, tip_geometry) are now retrieved from database
        # set_zero_force is now passed as a parameter from the frontend
        
        # Use elasticity parameters from frontend if provided, otherwise use defaults
        if elasticity_params:
            win = elasticity_params.get("window", 61)
            order = elasticity_params.get("order", 2)
            interp = elasticity_params.get("interpolate", True)
            print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ # Using elasticity parameters from frontend: win={win}, order={order}, interp={interp}")
        else:
            win = 61
            order = 2
            interp = True
            print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ Using default elasticity parameters: win={win}, order={order}, interp={interp}")
        
        # Log elastic model parameters
        # print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ # Using elastic model parameters: maxInd={elastic_model_params.get('maxInd', 800)}, minInd={elastic_model_params.get('minInd', 0)}")
        
        # Log force model parameters  
        print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ # Using force model parameters: maxInd={force_model_params.get('maxInd', 800)}, minInd={force_model_params.get('minInd', 0)}, poisson={force_model_params.get('poisson', 0.5)}")
        
        # Prevent crash if metadata includes non-numeric tip angle
        try:
            # Supplies finite fallback tip angle for elspectra calculations
            tip_angle = float(meta.get("tip_angle", 0.0))
        except (TypeError, ValueError):
            tip_angle = 0.0
        if not math.isfinite(tip_angle):
            tip_angle = 0.0
        
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
            {indentation_data_cte},
            {base_results_cte}{(',' if comma_after_base else '')}
            {fmodels_cte}{(',' if comma_between else '')}
            {emodels_cte}
            SELECT 
                b.curve_id,
                b.indentation,
                b.cp_values,
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
        curves_fparam = []
        curves_elasticity_param = []
        # Collect contact point rows for deferred cache writes
        cp_cache_rows = []
        # Collect indentation rows for deferred cache writes
        indent_cache_rows = []
        # print("emodels:", emodels)
        # print("single:", single)
        for i, row in enumerate(result_batch):
            curve_id, indentation_result, cp_values, elspectra_result, hertz_result, elastic_result = row
            # print("elspectra_result", elspectra_result)
            # print("elastic_result", elastic_result)
            # --- Cache contact point, if present ---
            if cp_values is not None and cp_method is not None and cp_params_hash is not None:
                cp_cache_rows.append(
                    (
                        int(curve_id),
                        cp_method,
                        cp_params_hash,
                        cp_values,
                        metadata.get("spring_constant") if metadata else None,
                        metadata.get("tip_radius") if metadata else None,
                        metadata.get("tip_geometry") if metadata else None,
                    )
                )

            if indentation_result is not None:
                zi, fi = indentation_result

                # --- Cache indentation: indentations(curve_id, cp_hash, zi, fi) ---
                # Only cache if this was newly computed (not already cached)
                if cp_hash_for_indent and int(curve_id) in missing_indent_ids:
                    try:
                        cp_hash = _json_hash(cp_values) if cp_values is not None else None
                    except Exception:
                        cp_hash = None

                    if cp_hash is not None:
                        indent_cache_rows.append(
                            (int(curve_id), cp_hash_for_indent, zi, fi)
                        )

                curves_cp.append({
                    "curve_id": f"curve{curve_id}",
                    "x": zi,
                    "y": fi
                })
                
                if hertz_result is not None and fmodels and (single or force_model_population):
                    # print("hertz_result", len(hertz_result))
                    x, y, fparam = hertz_result
                    # print(len(x),len(y))                        
                    # Overlay only for single curve (UI)
                    if single:
                        curves_cp.append({
                            "curve_id": f"{curve_id}_hertz",
                            "x": x,
                            "y": y
                        })

                    # Parameters always collected
                    # ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ FIX: Use curve_id directly instead of loop index i
                    # This ensures unique identification across batches
                    curves_fparam.append({
                        "curve_id": f"{curve_id}_hertz",
                        "params": fparam,
                        "curve_index": int(curve_id),  # Use actual curve_id, not batch-local index
                        "fparam": fparam
                    })
            
            
            if elspectra_result is not None:
                ze, e = elspectra_result
                # print("ze, e",ze, e)
                curves_el.append({
                    "curve_id": f"curve{curve_id}",
                    "x": ze,
                    "y": e
                })
                
                # Cache elspectra result using spec_hash (skipped when CACHE_ENABLED=false)
                if CACHE_ENABLED:
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
                        # Log but don't fail the main query if elspectra cache insert fails
                        print(f"Warning: Failed to cache elspectra for curve {curve_id}: {cache_err}")
                if elastic_result is not None and emodels and (single or elastic_model_population):
                    # print("elastic_result", elastic_result)
                    x, y, elasticity_param = elastic_result
                    if single:
                        curves_el.append({
                            "curve_id": f"{curve_id}_elastic",
                            "x": x,
                            "y": y
                        })

                    # ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ‚Â§ FIX: Use curve_id directly instead of loop index i
                    # This ensures unique identification across batches
                    curves_elasticity_param.append({
                        "curve_id": f"curve{curve_id}",  # Add curve_id for traceability
                        "curve_index": int(curve_id),    # Use actual curve_id, not batch-local index
                        "elasticity_param": elasticity_param
                    })
        
        # --- Persist caches (ignore duplicates, skip entirely when CACHE_ENABLED=false) ---
        if CACHE_ENABLED and cp_cache_rows:
            try:
                conn.executemany(
                    """
                    INSERT INTO contact_points (curve_id, method, params_hash, cp_values, spring_constant, tip_radius, tip_geometry)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (curve_id, method, params_hash) DO NOTHING
                    """,
                    cp_cache_rows,
                )
            except Exception as e:
                # Read-only connections can't write to cache - this is expected in parallel workers
                pass

        if CACHE_ENABLED and indent_cache_rows:
            # Use optimized batch caching
            cache_indentations_batch(conn, indent_cache_rows)

        # print("cp filters applied, batch indentation and elspectra calculated")
        # print("curves_elasticity_param count:", len(curves_elasticity_param))
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


def _select_curve_ids(conn, filters: Dict, num_curves: Optional[int] = None, dataset_id: Optional[int] = None) -> List[str]:
    """
    Select curve IDs from database after applying filters.
    
    Args:
        conn: DuckDB connection
        filters: Filter dictionary
        num_curves: Optional limit on number of curves
        dataset_id: Optional dataset ID to restrict curves to a specific dataset
    
    Returns:
        List of curve ID strings (e.g., ["0", "1", "2"])
    """
    params = []
    if dataset_id is not None:
        q = "SELECT DISTINCT curve_id FROM force_vs_z WHERE dataset_id = ? ORDER BY curve_id"
        params.append(dataset_id)
    else:
        q = "SELECT DISTINCT curve_id FROM force_vs_z ORDER BY curve_id"
    if num_curves:
        q += f" LIMIT {int(num_curves)}"
    result = conn.execute(q, params).fetchall()
    # Convert to string format that fetch_curves_batch expects
    return [f"curve{row[0]}" if isinstance(row[0], int) else str(row[0]) for row in result]


async def compute_elasticity_params_batched(
    conn, 
    filters: Dict, 
    num_curves: Optional[int] = None, 
    batch_size: int = 50,
    elasticity_params: Optional[Dict] = None,
    elastic_model_params: Optional[Dict] = None,
    dataset_id: Optional[int] = None,
) -> AsyncGenerator[Tuple[int, int, int, int, List[Dict]], None]:
    """
    Async generator yielding batches of elasticity parameters with progress.
    
    Yields: (batch_idx, total_batches, done_so_far, total_curves, rows_for_this_batch)
    
    Each row is a dict with:
        - curve_index: int
        - elasticity_param: List[float] (parameter values)
    """
    # Select curve IDs – optionally restricted to a specific dataset
    curve_ids = _select_curve_ids(conn, filters, num_curves, dataset_id=dataset_id)
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
        
        # Get metadata for this batch (scoped to dataset when dataset_id provided)
        metadata = get_metadata_for_curves(conn, batch_ids, dataset_id=dataset_id)
        
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