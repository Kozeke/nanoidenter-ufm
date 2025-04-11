from typing import Dict, List
from .fmodel_registry import FMODEL_REGISTRY


def apply_fmodels(query: str, fmodels: Dict, curve_ids: List[str]) -> str:
    print("apply_fmodels")
    z_col = "indentation_result[1]"
    f_col = "indentation_result[2]"
    
    fmodel_col = "NULL"
    for fmodel_name, params in fmodels.items():
        if fmodel_name in FMODEL_REGISTRY:  # Check if model is registered
            # Get the UDF function name directly from the registry
            function_name = FMODEL_REGISTRY[fmodel_name]["udf_function"]  # e.g., "hertz"
            fmodel_instance = FMODEL_REGISTRY[fmodel_name]["instance"]
            param_values = []
            # Map params to instance parameters, using defaults if not provided
            for param_name in fmodel_instance.parameters:
                value = params.get(param_name, fmodel_instance.get_value(param_name))
                param_values.append(str(value))
            # Create array literal, e.g., [0.0, 800.0, 0.5]
            param_array = f"[{', '.join(param_values)}]"
            fmodel_col = f"{function_name}({z_col}, {f_col}, {param_array})"
            break

    query = f"""
        SELECT 
            curve_id,
            {fmodel_col} AS fmodel_values
        FROM indentation_data
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {fmodel_col} IS NOT NULL
    """
    print(f"Generated queryfmodel:\n{query}")
    return query