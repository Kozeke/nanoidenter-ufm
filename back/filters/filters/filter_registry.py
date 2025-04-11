# filter_registry.py
from typing import Dict
import duckdb
import numpy as np
import json

FILTER_REGISTRY: Dict[str, Dict] = {}

def register_filter(filter_class):
    """Register a filter class in the global registry."""
    filter_instance = filter_class()  # Create instance
    filter_instance.create()          # Initialize parameters
    udf_function_name = f"{filter_class.NAME.lower()}"  # e.g., "median"
    FILTER_REGISTRY[filter_class.NAME.lower()] = {
        "instance": filter_instance,
        "udf_function": udf_function_name
    }

def create_udf(filter_name: str, conn: duckdb.DuckDBPyConnection):
    """Register a filter as a DuckDB UDF with a single parameter array, dynamically handling inputs."""
    filter_instance = FILTER_REGISTRY[filter_name.lower()]["instance"]
    udf_name = FILTER_REGISTRY[filter_name.lower()]["udf_function"]  # e.g., "median"
    print("Filter setup complete:", filter_instance)

    # Define parameter types: always three inputs for consistency
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # x_values (z_values or force_values)
        duckdb.list_type('DOUBLE'),  # y_values (force_values or None)
        duckdb.list_type('DOUBLE')   # param_values
    ]

    def udf_wrapper(x_values, y_values, param_values):
        try:
            x_values = np.array(x_values, dtype=np.float64)
            y_values = np.array(y_values, dtype=np.float64) if y_values is not None else None
            param_values = np.array(param_values, dtype=np.float64)

            # Map param_values to expected parameters
            expected_params = list(filter_instance.parameters.keys())
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = param_values[i]

            # Update instance parameters
            for k, v in param_dict.items():
                filter_instance.parameters[k]["default"] = v

            # Call calculate, passing y_values as-is (could be None)
            result = filter_instance.calculate(x_values, y_values)
            return result if result is not None else None
        except Exception as e:
            print(f"Error in UDF for {filter_name}: {e}")
            return None

    # Consistent return type: DOUBLE[]
    return_type = duckdb.list_type('DOUBLE')

    conn.create_function(
        udf_name,
        udf_wrapper,
        udf_param_types,
        return_type=return_type,
        null_handling='SPECIAL'
    )
    print(f"UDF {udf_name} registered with types: {udf_param_types}, return type: {return_type}")
    



def save_filter_to_db(filter_class, conn):
    filter_instance = filter_class()
    filter_instance.create()
    parameters_json = json.dumps(filter_instance.parameters)
    conn.execute("""
        INSERT OR REPLACE INTO filters (name, description, doi, parameters)
        VALUES (?, ?, ?, ?)
    """, (filter_class.NAME, filter_class.DESCRIPTION, filter_class.DOI, parameters_json))