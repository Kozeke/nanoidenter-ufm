from .filter_registry import FILTER_REGISTRY  # Assuming a registry exists
from typing import List, Dict

def apply(query: str, filters: Dict, curve_ids: List[str]) -> str:
    """
    Applies selected filters dynamically to the base query.
    - filters: Dictionary of filters with parameters.
    - curve_ids: List of curve IDs to fetch.
    
    Example filters:
        filters = {
            "median": {"window_size": 5},
            "lineardetrend": {"smoothing_window": 10, "threshold": 0.01},
            "savgolsmooth": {"window_size": 25, "polyorder": 3}
        }
    """
    z_col = "z_values"
    f_col = "force_values"
    filter_chain = f_col  # Start with raw force values

    for filter_name in filters:
        if filter_name in FILTER_REGISTRY:
            function_name = FILTER_REGISTRY[filter_name]["udf_function"]  # e.g., "median"
            filter_instance = FILTER_REGISTRY[filter_name]["instance"]    # Access instance
            params = filters[filter_name]
            param_values = []
            # Map params to instance parameters, using defaults if not provided
            for param_name in filter_instance.parameters:
                value = params.get(param_name, filter_instance.get_value(param_name))
                param_values.append(str(value))
            # Create array literal, e.g., [5] or [10, 0.01]
            param_string = f", [{', '.join(param_values)}]" if param_values else ""

            # Apply filter, adjusting for z_values dependency
            if filter_name in ["median"]:  # Filters that only take force_values
                filter_chain = f"{function_name}({filter_chain}{param_string})"
            else:  # Filters that take both z_values and force_values
                filter_chain = f"{function_name}({z_col}, {filter_chain}{param_string})"

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
    
    # Construct the final SQL query
    query = f"""
        SELECT curve_id, 
               {z_col}, 
               {filter_chain} AS force_values
        FROM force_vs_z 
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
    """
    print(f"Generated query: {query}")
    return query