# fmodel_registry.py
import duckdb
from typing import Dict
import json
from pathlib import Path
import numpy as np

FMODEL_REGISTRY: Dict[str, Dict] = {}

def register_fmodel(fmodel_class):
    """Register an fmodel class in the global registry."""
    fmodel_instance = fmodel_class()  # Create instance
    fmodel_instance.create()          # Initialize parameters
    udf_function_name = f"{fmodel_class.NAME.lower()}"  # e.g., "hertz"
    FMODEL_REGISTRY[fmodel_class.NAME.lower()] = {
        "instance": fmodel_instance,
        "udf_function": udf_function_name
    }
    
def getJclose(x0, x):
    """Find the index of the closest value to x0 in array x."""
    x = np.array(x)
    return np.argmin((x - x0) ** 2)

def getFizi(xmin, xmax, zi, fi):
    """Filter zi and fi arrays between xmin and xmax."""
    jmin = getJclose(xmin, zi)
    jmax = getJclose(xmax, zi)
    return np.array(zi[jmin:jmax]), np.array(fi[jmin:jmax])

def create_fmodel_udf(fmodel_name: str, conn: duckdb.DuckDBPyConnection):
    """Register an fmodel as a DuckDB UDF with getFizi filtering before calculate."""
    fmodel_instance = FMODEL_REGISTRY[fmodel_name.lower()]["instance"]
    udf_name = FMODEL_REGISTRY[fmodel_name.lower()]["udf_function"]
    print("Fmodel setup complete:", fmodel_instance)

    # Define parameter types: zi_values, fi_values, and a single DOUBLE[] for all parameters
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # zi_values
        duckdb.list_type('DOUBLE'),  # fi_values
        duckdb.list_type('DOUBLE')   # param_values (array of all parameters)
    ]

    def udf_wrapper(zi_values, fi_values, param_values):
        try:
            zi_values = np.array(zi_values, dtype=np.float64)
            fi_values = np.array(fi_values, dtype=np.float64)
            param_values = np.array(param_values, dtype=np.float64)

            # Map param_values to expected parameters
            expected_params = list(fmodel_instance.parameters.keys())
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = param_values[i]

            # Update instance parameters
            for k, v in param_dict.items():
                fmodel_instance.parameters[k]["default"] = v

            # Get zi_min and zi_max from parameters (default to 0 and 800 nm if not present)
            zi_min = fmodel_instance.get_value("minInd") * 1e-9 if "minInd" in fmodel_instance.parameters else 0
            zi_max = fmodel_instance.get_value("maxInd") * 1e-9 if "maxInd" in fmodel_instance.parameters else 800e-9

            x, y = getFizi(zi_min, zi_max, zi_values, fi_values)
            print("res", len(x), len(y))

            if len(x) > 5:  # Minimum length check
                result = fmodel_instance.calculate(x, y)
                if result is None:
                    return None
                return result
            return None
        except Exception as e:
            print(f"Error in UDF for {fmodel_name}: {e}")
            return None

    # Consistent return type for all models: DOUBLE[][]
    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))

    conn.create_function(
        udf_name,
        udf_wrapper,
        udf_param_types,
        return_type=return_type,
        null_handling='SPECIAL'
    )
    print(f"UDF {udf_name} registered with types: {udf_param_types}, return type: {return_type}")
    
    
def save_fmodel_to_db(fmodel_class, conn: duckdb.DuckDBPyConnection):
    """Save fmodel metadata to the database."""
    fmodel_instance = fmodel_class()
    fmodel_instance.create()
    parameters_json = json.dumps(fmodel_instance.parameters)
    conn.execute("""
        INSERT OR REPLACE INTO fmodels (name, description, doi, parameters)
        VALUES (?, ?, ?, ?)
    """, (fmodel_class.NAME, fmodel_class.DESCRIPTION, fmodel_class.DOI, parameters_json))