import duckdb
from typing import Dict
import json
from pathlib import Path
import numpy as np

EMODEL_REGISTRY: Dict[str, Dict] = {}

def register_emodel(emodel_class):
    """Register an emodel class in the global registry."""
    emodel_instance = emodel_class()  # Calls EmodelBase.__init__, sets self.parameters
    emodel_instance.create()          # Populates self.parameters
    udf_function_name = f"{emodel_class.NAME.lower()}"  # e.g., "sigmoid_fit"
    EMODEL_REGISTRY[emodel_class.NAME.lower()] = {
        "instance": emodel_instance,
        "udf_function": udf_function_name
    }

def getJclose(x0, x):
    """Find the index of the closest value to x0 in array x."""
    x = np.array(x)
    return np.argmin((x - x0) ** 2)

def getEizi(xmin, xmax, zi, ei):
    """Filter zi and ei arrays between xmin and xmax."""
    jmin = getJclose(xmin, zi)
    jmax = getJclose(xmax, zi)
    return np.array(zi[jmin:jmax]), np.array(ei[jmin:jmax])


def create_emodel_udf(emodel_name: str, conn: duckdb.DuckDBPyConnection):
    emodel_info = EMODEL_REGISTRY[emodel_name.lower()]
    emodel_instance = emodel_info["instance"]
    udf_name = emodel_info["udf_function"]
    print("Emodel setup complete:", emodel_instance)

    # Define parameter types: ze_values, fe_values, and a single DOUBLE[] for all parameters
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # ze_values
        duckdb.list_type('DOUBLE'),  # fe_values
        duckdb.list_type('DOUBLE')   # param_values (array of all parameters)
    ]

    def udf_wrapper(ze_values, fe_values, param_values):
        try:
            ze_values = np.array(ze_values, dtype=np.float64)
            fe_values = np.array(fe_values, dtype=np.float64)
            param_values = np.array(param_values, dtype=np.float64)  # Convert param_values to numpy array
            
            # Map param_values to expected parameters
            expected_params = list(emodel_instance.parameters.keys())
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = param_values[i]
            
            # Update instance parameters
            for k, v in param_dict.items():
                emodel_instance.parameters[k]["default"] = v
            
            ze_min = emodel_instance.get_value("minInd") * 1e-9 if "minInd" in emodel_instance.parameters else 0
            ze_max = emodel_instance.get_value("maxInd") * 1e-9 if "maxInd" in emodel_instance.parameters else 800e-9
  
            x, y = getEizi(ze_min, ze_max, ze_values, fe_values)
            
            result = emodel_instance.calculate(x, y)
            print("result", result)
            return result if result is not None else None
        except Exception as e:
            print(f"Error in UDF for {emodel_name}: {e}")
            return None

    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))
        # Remove existing function if it exists
    # try:
    #     conn.remove_function(udf_name)
    #     print(f"Removed existing UDF: {udf_name}")
    # except duckdb.Error:
    #     # Ignore if the function doesn't exist yet
    #     pass

    # Register the new function
    conn.create_function(
        udf_name,
        udf_wrapper,
        udf_param_types,
        return_type=return_type,
        null_handling='SPECIAL'
    )
    print(f"UDF {udf_name} registered with types: {udf_param_types}, return type: {return_type}")



    # if emodel_name in ["elasticfit", "driftedelastic"]:
    #     udf_param_types = [
    #         duckdb.list_type('DOUBLE'),  # zi_values
    #         duckdb.list_type('DOUBLE'),  # ei_values
    #         'DOUBLE',                    # zi_min
    #         'DOUBLE',                    # zi_max
    #         'DOUBLE'                     # poisson
    #     ]
    # else:  # elasticeffective
    #     udf_param_types = [
    #         duckdb.list_type('DOUBLE'),  # zi_values
    #         duckdb.list_type('DOUBLE'),  # ei_values
    #         'DOUBLE',                    # zi_min
    #         'DOUBLE',                    # zi_max
    #     ]
    # udf_param_types = [
    #     duckdb.list_type('DOUBLE'),  # zi_values
    #     duckdb.list_type('DOUBLE'),  # ei_values
    #     'DOUBLE',                    # zi_min
    #     'DOUBLE',                    # zi_max
    #     'DOUBLE'                     # poisson
    # ]
    # udf_name = f"{emodel_name.lower()}_fit"
    # return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))

    # conn.create_function(udf_name, udf_wrapper, udf_param_types, return_type=return_type, null_handling='SPECIAL')
    # print(f"UDF {udf_name} registered with types: {udf_param_types}, return type: {return_type}")

def save_emodel_to_db(emodel_class, conn: duckdb.DuckDBPyConnection):
    """Save emodel metadata to the database."""
    emodel_instance = emodel_class()
    emodel_instance.create()
    parameters_json = json.dumps(emodel_instance.parameters)
    conn.execute("""
        INSERT OR REPLACE INTO emodels (name, description, doi, parameters)
        VALUES (?, ?, ?, ?)
    """, (emodel_class.NAME, emodel_class.DESCRIPTION, emodel_class.DOI, parameters_json))