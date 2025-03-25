from typing import List, Dict


def apply_fmodels(query: str, filters: Dict, curve_ids: List[str]) -> str:
    """
    Applies force model filters dynamically to the base query, returning processed force values.

    Args:
        query: Base SQL query (ignored in this implementation)
        filters: Dictionary containing fmodels with parameters (e.g., {"fmodels": {"model": "hertz", "params": {...}}})
        curve_ids: List of curve IDs to fetch

    Returns:
        Modified SQL query with force model calculation
    """
    z_col = "z_values"
    f_col = "force_values"

    # Extract fmodels from filters
    fmodels = filters.get("fmodels", {})
    model_name = fmodels.get("model", "").lower()
    params = fmodels.get("params", {})

    filter_functions = {
        "hertz": "hertz_theory",
        "hertzeffective": "hertzeffective_theory",
        "hertzlinear": "hertzlinear_theory"
    }

    fmodel_col = None
    if model_name in filter_functions:
        function_name = filter_functions[model_name]
        # Include zi_min and zi_max from params
        zi_min = params.get("zi_min", 0) * 1e-9  # Default to 0 nm, convert to meters
        zi_max = params.get("zi_max", 100) * 1e-9  # Default to 100 nm, convert to meters
        
        # Parameters specific to each model
        if model_name == "hertz":
            elastic = params.get("elastic", 1.0)
            param_string = f", {elastic}, {zi_min}, {zi_max}"
        elif model_name == "hertzeffective":
            elastic = params.get("elastic", 1.0)
            param_string = f", {elastic}, {zi_min}, {zi_max}"
        elif model_name == "hertzlinear":
            poisson = params.get("poisson", 0.5)
            E = params.get("E", 1.0)
            m = params.get("m", 1.0)
            tip_geometry = params.get("tip_geometry", "'sphere'")
            R = params.get("R", 1e-5) if params.get("R") is not None else "NULL"
            ang = params.get("ang", 30.0) if params.get("ang") is not None else "NULL"
            param_string = f", {poisson}, {E}, {m}, {tip_geometry}, {R}, {ang}, {zi_min}, {zi_max}"
        
        fmodel_col = f"{function_name}({z_col}, {f_col}{param_string})"
    else:
        fmodel_col = "NULL"

    query = f"""
        SELECT curve_id, 
               {z_col}, 
               {f_col}, 
               {fmodel_col} AS fmodel_values
        FROM force_vs_z 
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {fmodel_col} IS NOT NULL  -- Exclude curves where fmodel result is NULL
    """
    print(f"Generated query: {query}")
    return query