from typing import Dict, List
from .fmodel_registry import FMODEL_REGISTRY

def apply_fmodels(query: str, fmodels: Dict, curve_ids: List[str], force_model_params: Dict = None) -> str:
    """
    Build the SQL for force-model fitting. The active model is taken from `fmodels`,
    and its parameters (including poisson, minInd/maxInd in nm) are passed to the UDF.
    Any keys provided in `force_model_params` override UI-model params.
    The UDF itself slices Zi/Fi by [minInd, maxInd] (converted to meters).
    """
    print("apply_fmodels")
    if force_model_params:
        print(f"🔧 Using force model parameters: {force_model_params}")

    # Arrays from indentation computation (Zi, Fi)
    z_col = "indentation_result[1]"
    f_col = "indentation_result[2]"

    # Choose the first registered fmodel found in incoming dict
    fmodel_sql = "NULL"
    for fmodel_name, params in fmodels.items():
        if fmodel_name in FMODEL_REGISTRY:
            fn_name = FMODEL_REGISTRY[fmodel_name]["udf_function"]  # e.g. fmodel_hertz
            fmodel_instance = FMODEL_REGISTRY[fmodel_name]["instance"]

            # Merge precedence: force_model_params > params (UI) > class defaults
            # Build in the model's declared parameter order so UDF receives correct positions.
            ordered = []
            for pname in fmodel_instance.parameters:
                if force_model_params and pname in force_model_params:
                    val = force_model_params[pname]
                else:
                    val = params.get(pname, fmodel_instance.get_value(pname))

                # numeric safety: cast to float when possible
                try:
                    ordered.append(str(float(val)))
                except (TypeError, ValueError):
                    # fallback to class default if bad value
                    ordered.append(str(float(fmodel_instance.get_value(pname))))

            param_array = f"[{', '.join(ordered)}]"

            # Final SQL call; UDF will window by minInd/maxInd (nm→m) internally
            fmodel_sql = f"{fn_name}({z_col}, {f_col}, {param_array})"
            break

    # Prepare curve_id filter (accepts 'curve0' or raw ints)
    numeric_curve_ids: List[str] = []
    for cid in curve_ids:
        if isinstance(cid, str) and cid.startswith("curve"):
            try:
                numeric_curve_ids.append(str(int(cid[5:])))
            except ValueError:
                continue
        else:
            numeric_curve_ids.append(str(cid))

    if not numeric_curve_ids:
        # Safe empty result: still a valid SELECT for the caller
        return """
            SELECT curve_id, NULL AS fmodel_values
            FROM indentation_data
            WHERE 1=0
        """

    # If no valid model was found, don't emit a broken WHERE with NULL function call
    if fmodel_sql == "NULL":
        query = f"""
            SELECT
                curve_id,
                NULL AS fmodel_values
            FROM indentation_data
            WHERE curve_id IN ({','.join(numeric_curve_ids)})
        """
        print("Generated queryfmodel (no active/registered fmodel):\n", query)
        return query

    query = f"""
        SELECT
            curve_id,
            {fmodel_sql} AS fmodel_values
        FROM indentation_data
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
          AND {fmodel_sql} IS NOT NULL
    """
    print("Generated queryfmodel:\n", query)
    return query
