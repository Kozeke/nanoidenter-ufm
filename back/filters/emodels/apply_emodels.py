from typing import Dict, List
from .emodel_registry import EMODEL_REGISTRY

def apply_emodels(query: str, emodels: Dict, curve_ids: List[str], elastic_model_params: Dict = None) -> str:
    # print("apply_emodels")
    if elastic_model_params:
        print(f"🔧 Using elastic model parameters: {elastic_model_params}")
    z_col = "elspectra_result[1]"
    e_col = "elspectra_result[2]"
    
    emodel_col = "NULL"
    for emodel_name, params in emodels.items():
        if emodel_name in EMODEL_REGISTRY:  # Check if model is registered
            function_name = EMODEL_REGISTRY[emodel_name]["udf_function"]  # e.g., "sigmoid_fit"
            emodel_instance = EMODEL_REGISTRY[emodel_name]["instance"]
            param_values = []
            for param_name in emodel_instance.parameters:
                if param_name == "minInd" and elastic_model_params:
                    value = elastic_model_params.get("minInd", emodel_instance.get_value(param_name))
                elif param_name == "maxInd" and elastic_model_params:
                    value = elastic_model_params.get("maxInd", emodel_instance.get_value(param_name))
                else:
                    value = params.get(param_name, emodel_instance.get_value(param_name))
                param_values.append(str(value))  # Convert to string for array literal
            # Create array literal, e.g., [1.74, 800.0, 0.0]
            param_array = f"[{', '.join(param_values)}]"
            emodel_col = f"{function_name}({z_col}, {e_col}, {param_array})"
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
        SELECT 
            curve_id,
            {emodel_col} AS emodel_values
        FROM base_results
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
        AND {emodel_col} IS NOT NULL
    """
    print(f"Generated queryemodel:\n{query}")
    return query