from typing import List, Dict

def apply_cp_filters(query: str, filters: Dict, curve_ids: List[str]) -> str:
    """
    Applies contact point filters dynamically to the base query, excluding curves where filters return NULL.

    Args:
        query: Base SQL query
        filters: Dictionary of CP filters with parameters (e.g., {'autotresh': {}, 'gof': {'threshold': 0.5}})
        curve_ids: List of curve IDs to fetch

    Returns:
        Modified SQL query with filters applied
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

    # Apply CP filters dynamically
    for filter_name, function_name in filter_functions.items():
        if filter_name in filters:
            params = filters[filter_name]
            param_values = ", ".join(str(value) for value in params.values()) if params else ""
            param_string = f", {param_values}" if param_values else ""
            processed_values = f"{function_name}({z_col}, {f_col}{param_string})"
            z_col = f"{processed_values}[0]"
            f_col = f"{processed_values}[1]"

    # Construct query to exclude NULL results
    query = f"""
        SELECT curve_id, 
               {z_col} AS z_values, 
               {f_col} AS force_values
        FROM force_vs_z 
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {f_col} IS NOT NULL  -- Exclude NULL filtered results
    """

    print(f"Generated query: {query}")
    return query