from typing import List, Dict

import math

from .cp_registry import CONTACT_POINT_REGISTRY


def _safe_meta(meta: Dict, key: str, default: float, positive: bool = False) -> float:
    """
    Extract a numeric value from metadata with sane fallbacks.
    """
    try:
        v = float(meta.get(key, default))
    except (TypeError, ValueError, AttributeError):
        v = default

    if not math.isfinite(v):
        v = default

    if positive and v <= 0:
        v = default

    return v


def apply_cp_filters(query: str, filters: Dict, curve_ids: List[str], metadata: Dict = None) -> str:
    z_col = "z_values"
    f_col = "force_values"

    metadata = metadata or {}

    # Take values from metadata (with safe defaults)
    spring_constant_val = _safe_meta(metadata, "spring_constant", 1.0)
    tip_radius_val = _safe_meta(metadata, "tip_radius", 1e-5, positive=True)
    tip_geometry_val = metadata.get("tip_geometry") or "sphere"
    tip_geometry_sql = str(tip_geometry_val).replace("'", "''")

    print(f"DEBUG: apply_cp_filters - metadata: {metadata}")
    print(f"DEBUG: using spring_constant={spring_constant_val}, tip_radius={tip_radius_val}, tip_geometry='{tip_geometry_sql}'")

    cp_col = "NULL"
    for filter_name in filters:
        if filter_name in CONTACT_POINT_REGISTRY:
            function_name = CONTACT_POINT_REGISTRY[filter_name]["udf_function"]  # e.g., "autothresh"
            filter_instance = CONTACT_POINT_REGISTRY[filter_name]["instance"]    # Access instance
            params = filters[filter_name]

            param_values = []
            # Use deterministic parameter order to prevent parameter swapping
            for param_name in filter_instance.parameter_order:
                value = params.get(param_name, filter_instance.get_value(param_name))
                param_values.append(str(value))

            param_string = f", [{', '.join(param_values)}]" if param_values else ""

            # ⬇️ Use metadata literals instead of non-existing columns
            cp_col = (
                f"{function_name}({z_col}, {f_col}{param_string}, "
                f"{spring_constant_val}, {tip_radius_val}, '{tip_geometry_sql}')"
            )
            break

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
    
    # If cp_col stayed "NULL" (no valid filter found), this query will just return no rows
    query = f"""
        SELECT
            curve_id,
            {z_col},
            {f_col},
            {cp_col} AS cp_values,
            {spring_constant_val} AS spring_constant,
            {tip_radius_val} AS tip_radius,
            '{tip_geometry_sql}' AS tip_geometry
        FROM force_vs_z
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
          AND {cp_col} IS NOT NULL
    """
    print(f"Generated query: {query}")
    return query