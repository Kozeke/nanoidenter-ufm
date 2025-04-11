from typing import List, Dict
from .cp_registry import CONTACT_POINT_REGISTRY


def apply_cp_filters(query: str, filters: Dict, curve_ids: List[str]) -> str:
    z_col = "z_values"
    f_col = "force_values"

    print("btaaa")
    cp_col = "NULL"
    for filter_name in filters:
        if filter_name in CONTACT_POINT_REGISTRY:
            function_name = CONTACT_POINT_REGISTRY[filter_name]["udf_function"]  # e.g., "autothresh"
            filter_instance = CONTACT_POINT_REGISTRY[filter_name]["instance"]    # Access instance
            params = filters[filter_name]
            param_values = []
            for param_name in filter_instance.parameters:
                value = params.get(param_name, filter_instance.get_value(param_name))  # Use get_value
                param_values.append(str(value))
            param_string = f", [{', '.join(param_values)}]" if param_values else ""
            cp_col = f"{function_name}({z_col}, {f_col}{param_string})"
            break

    query = f"""
        SELECT curve_id, 
               {z_col}, 
               {f_col}, 
               {cp_col} AS cp_values
        FROM force_vs_z 
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {cp_col} IS NOT NULL
    """
    print(f"Generated query: {query}")
    return query