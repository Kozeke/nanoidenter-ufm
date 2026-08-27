from .filter_registry import FILTER_REGISTRY  # Assuming a registry exists
from typing import List, Dict
import re

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

    # Use the base query passed in (which already has dataset_id filter if provided)
    # and modify it to apply the filter chain to force_values
    # The base_query should be something like:
    # "SELECT curve_id, z_values, force_values FROM force_vs_z WHERE dataset_id = X AND curve_id IN (...)"
    # or "SELECT curve_id, z_values, force_values FROM force_vs_z WHERE curve_id IN (...)"
    
    # Replace force_values in the SELECT clause only (not in WHERE clause)
    # Split query at FROM to separate SELECT and WHERE parts
    if "FROM" in query.upper():
        parts = query.split("FROM", 1)
        select_part = parts[0]
        from_where_part = parts[1] if len(parts) > 1 else ""
        
        # Replace force_values in SELECT clause only
        # Handle both "force_values" and "force_values AS ..." patterns
        # Pattern to match force_values in SELECT (with optional alias)
        pattern = r'\bforce_values\b(?:\s+AS\s+\w+)?'
        # Replace with filter_chain and add AS force_values alias
        select_part = re.sub(pattern, f"{filter_chain} AS force_values", select_part, count=1)
        
        # Reconstruct query
        query = select_part + "FROM" + from_where_part
    else:
        # Fallback: if query format is unexpected, build a new one (shouldn't happen)
        numeric_curve_ids = []
        for cid in curve_ids:
            if isinstance(cid, str) and cid.startswith('curve'):
                try:
                    numeric_id = int(cid[5:])  # Remove "curve" prefix
                    numeric_curve_ids.append(numeric_id)
                except ValueError:
                    continue
            else:
                try:
                    numeric_curve_ids.append(int(cid))
                except (ValueError, TypeError):
                    continue
        
        query = f"""
            SELECT curve_id, 
                   {z_col}, 
                   {filter_chain} AS force_values
            FROM force_vs_z 
            WHERE curve_id IN ({','.join(map(str, numeric_curve_ids))})
        """
    
    # print(f"Generated query: {query}")
    return query