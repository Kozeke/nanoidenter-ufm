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

    # Define parameter types: x_values, y_values, param_values, and metadata values
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # x_values (z_values)
        duckdb.list_type('DOUBLE'),  # y_values (force_values)
        duckdb.list_type('DOUBLE'),  # param_values (array of all parameters)
        'DOUBLE',                    # spring_constant
        'DOUBLE',                    # tip_radius
        'VARCHAR'                    # tip_geometry
    ]

    def udf_wrapper(x_values, y_values, param_values, spring_constant, tip_radius, tip_geometry):
        try:
            # print(f"🔍 UDF DEBUG for {filter_name}:")
            # print(f"  📊 Input data: x_values={len(x_values)} points, y_values={len(y_values)} points")
            # print(f"  📋 Raw param_values: {param_values}")
            # print(f"  🔧 Metadata: spring_constant={spring_constant}, tip_radius={tip_radius}, tip_geometry={tip_geometry}")
            
            x_values = np.array(x_values, dtype=np.float64)
            y_values = np.array(y_values, dtype=np.float64)
            param_values = np.array(param_values, dtype=np.float64)

            # Create metadata dictionary
            metadata = {
                'spring_constant': spring_constant,
                'tip_radius': tip_radius,
                'tip_geometry': tip_geometry
            }

            # Map param_values to expected parameters using deterministic order
            # Force deterministic order to prevent parameter swapping
            # Use parameter_order which tracks the order parameters were added in create()
            expected_params = filter_instance.parameter_order
            # print(f"  📝 Expected parameter order: {expected_params}")
            # print(f"  📝 Parameter values array: {param_values}")
            
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = float(param_values[i])
                    # print(f"    ✅ {param_name} = {param_values[i]} (index {i})")
                else:
                    # print(f"    ⚠️  {param_name} = MISSING (index {i} >= {len(param_values)})")
                    pass

            # print(f"  🎯 Final parameter mapping: {param_dict}")

            # Update instance parameters
            for k, v in param_dict.items():
                filter_instance.parameters[k]["value"] = v

            # Calculate contact point with metadata
            # All contact point filters now accept metadata parameter
            # print(f"  🚀 Calling calculate() with metadata...")
            result = filter_instance.calculate(x_values, y_values, metadata)
            # print(f"  📤 Calculate result: {result}")
            
            # Debug logs after CP calculation
            if result is not None and len(result) > 0 and len(result[0]) >= 2:
                xcp = result[0][0]
                ycp = result[0][1]
                print(f"[DEBUG] CP raw values: xcp={xcp}, ycp={ycp}")
                print(f"[DEBUG] Z range: {np.min(x_values)} to {np.max(x_values)}")
            
            if result is None:
                # print(f"  ❌ Result is None - no contact point found")
                return None
            # print(f"  ✅ Contact point found: {result}")
            return result
        except Exception as e:
            print(f"❌ Error in UDF for {filter_name}: {e}")
            import traceback
            traceback.print_exc()
            return None

    # Consistent return type: DOUBLE[][]
    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))

    try:
        conn.create_function(
            udf_name,
            udf_wrapper,
            udf_param_types,
            return_type=return_type,
            null_handling="SPECIAL"  # All contact point filters can return None
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