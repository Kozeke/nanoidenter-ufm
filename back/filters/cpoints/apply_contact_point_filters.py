from typing import List, Dict
from .cp_registry import CONTACT_POINT_REGISTRY


def apply_cp_filters(query: str, filters: Dict, curve_ids: List[str], metadata: Dict = None) -> str:
    z_col = "z_values"
    f_col = "force_values"

    print(f"DEBUG: apply_cp_filters - metadata: {metadata}")
    print("btaaa")
    cp_col = "NULL"
    for filter_name in filters:
        if filter_name in CONTACT_POINT_REGISTRY:
            function_name = CONTACT_POINT_REGISTRY[filter_name]["udf_function"]  # e.g., "autothresh"
            filter_instance = CONTACT_POINT_REGISTRY[filter_name]["instance"]    # Access instance
            params = filters[filter_name]
            
            # print(f"🔧 BUILDING PARAMETER ARRAY for {filter_name}:")
            # print(f"  📋 Filter instance parameter_order: {filter_instance.parameter_order}")
            # print(f"  📋 User provided params: {params}")
            
            param_values = []
            # Use deterministic parameter order to prevent parameter swapping
            for param_name in filter_instance.parameter_order:
                value = params.get(param_name, filter_instance.get_value(param_name))  # Use get_value
                param_values.append(str(value))
                # print(f"    ✅ {param_name} = {value} (from {'user' if param_name in params else 'default'})")
            
            # print(f"  🎯 Final param_values array: {param_values}")
            param_string = f", [{', '.join(param_values)}]" if param_values else ""
            cp_col = f"{function_name}({z_col}, {f_col}{param_string}, spring_constant, tip_radius, tip_geometry)"
            # print(f"  📝 Generated SQL function call: {cp_col}")
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
    
    query = f"""
        SELECT curve_id, 
               {z_col}, 
               {f_col}, 
               {cp_col} AS cp_values,
               spring_constant,
               tip_radius,
               tip_geometry
        FROM force_vs_z 
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
        AND {cp_col} IS NOT NULL
    """
    print(f"Generated query: {query}")
    return query