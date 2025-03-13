from typing import List, Dict


def apply_cp_filters(query: str, filters: Dict, curve_ids: List[str]) -> str:
    """
    Applies contact point filters dynamically to the base query, returning CP values.

    Args:
        query: Base SQL query (ignored in this implementation)
        filters: Dictionary of CP filters with parameters
        curve_ids: List of curve IDs to fetch

    Returns:
        Modified SQL query with CP calculation
    """
    z_col = "z_values"
    f_col = "force_values"

    filter_functions = {
        "autotresh": "autotresh_filter",
        "gof": "gof_filter",
        "gofSphere": "gof_sphere_filter",
        "rov": "rov_filter",
        "stepanddrift": "step_drift_filter",
        "threshold": "threshold_filter"
    }

    cp_col = None
    for filter_name, function_name in filter_functions.items():
        if filter_name in filters:
            params = filters[filter_name]
            param_values = ", ".join(str(value) for value in params.values()) if params else ""
            param_string = f", {param_values}" if param_values else ""
            cp_col = f"{function_name}({z_col}, {f_col}{param_string})"
            break  # Apply only the first filter for simplicity (or chain if needed)

    if not cp_col:
        cp_col = "NULL"  # Default to NULL if no filters match

    query = f"""
        SELECT curve_id, 
               {z_col}, 
               {f_col}, 
               {cp_col} AS cp_values
        FROM force_vs_z 
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {cp_col} IS NOT NULL  -- Exclude curves where CP is NULL
    """
    print(f"Generated query: {query}")
    return query


