import json
from typing import Dict
import duckdb
import numpy as np

CONTACT_POINT_REGISTRY: Dict[str, Dict] = {}

def register_contact_point_filter(filter_class):
    """Register a contact point filter class in the global registry."""
    filter_instance = filter_class()  # Create instance
    filter_instance.create()          # Initialize parameters
    udf_function_name = f"{filter_class.NAME.lower()}"  # e.g., "autothresh"
    CONTACT_POINT_REGISTRY[filter_class.NAME.lower()] = {
        "instance": filter_instance,
        "udf_function": udf_function_name
    }
    
def create_contact_point_udf(filter_name: str, conn: duckdb.DuckDBPyConnection):
    """Register a contact point filter as a DuckDB UDF with dynamic parameter array."""
    filter_instance = CONTACT_POINT_REGISTRY[filter_name.lower()]["instance"]
    udf_name = CONTACT_POINT_REGISTRY[filter_name.lower()]["udf_function"]  # e.g., "autothresh"
    # print("Contact point filter setup complete:", filter_instance)

    # Define parameter types: x_values, y_values, and a single DOUBLE[] for all parameters
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # x_values (z_values)
        duckdb.list_type('DOUBLE'),  # y_values (force_values)
        duckdb.list_type('DOUBLE')   # param_values (array of all parameters)
    ]

    def udf_wrapper(x_values, y_values, param_values):
        try:
            x_values = np.array(x_values, dtype=np.float64)
            y_values = np.array(y_values, dtype=np.float64)
            param_values = np.array(param_values, dtype=np.float64)

            # Map param_values to expected parameters
            expected_params = list(filter_instance.parameters.keys())
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = param_values[i]

            # Update instance parameters
            for k, v in param_dict.items():
                filter_instance.parameters[k]["value"] = v

            # Calculate contact point
            result = filter_instance.calculate(x_values, y_values)
            if result is None:
                return None
            return result
        except Exception as e:
            print(f"Error in UDF for {filter_name}: {e}")
            return None

    # Consistent return type: DOUBLE[][]
    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))

    try:
        conn.create_function(
            udf_name,
            udf_wrapper,
            udf_param_types,
            return_type=return_type,
            null_handling="SPECIAL" if filter_name in ["Autothresh", "GofSphere", "StepDrift"] else "DEFAULT"
        )
    except duckdb.CatalogException as e:
        if "already exists" in str(e):
            print(f"Function {udf_name} already exists. Skipping creation.")
        else:
            raise

    # print(f"UDF {udf_name} registered with types: {udf_param_types}, return type: {return_type}")


def save_cp_to_db(filter_class, conn):
    filter_instance = filter_class()
    filter_instance.create()
    parameters_json = json.dumps(filter_instance.parameters)
    conn.execute("""
        INSERT OR REPLACE INTO cps (name, description, doi, parameters)
        VALUES (?, ?, ?, ?)
    """, (filter_class.NAME, filter_class.DESCRIPTION, filter_class.DOI, parameters_json))