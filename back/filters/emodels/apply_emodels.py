from typing import Dict, List
from .emodel_registry import EMODEL_REGISTRY

def apply_emodels(query: str, emodels: Dict, curve_ids: List[str]) -> str:
    print("apply_emodels")
    z_col = "elspectra_result[1]"
    e_col = "elspectra_result[2]"
    
    emodel_col = "NULL"
    for emodel_name, params in emodels.items():
        if emodel_name in EMODEL_REGISTRY:  # Check if model is registered
            function_name = EMODEL_REGISTRY[emodel_name]["udf_function"]  # e.g., "sigmoid_fit"
            emodel_instance = EMODEL_REGISTRY[emodel_name]["instance"]
            param_values = []
            for param_name in emodel_instance.parameters:
                value = params.get(param_name, emodel_instance.get_value(param_name))
                param_values.append(str(value))  # Convert to string for array literal
            # Create array literal, e.g., [1.74, 800.0, 0.0]
            param_array = f"[{', '.join(param_values)}]"
            emodel_col = f"{function_name}({z_col}, {e_col}, {param_array})"
            break

    query = f"""
        SELECT 
            curve_id,
            {emodel_col} AS emodel_values
        FROM base_results
        WHERE curve_id IN ({','.join([f"'{cid}'" for cid in curve_ids])})
        AND {emodel_col} IS NOT NULL
    """
    print(f"Generated queryemodel:\n{query}")
    return query