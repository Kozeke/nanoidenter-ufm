from filters.median import median_filter_array
from filters.lineardetrend import lineardetrend_filter
from filters.notch import notch_filter
from filters.polytrend import polytrend_filter
from filters.prominence import prominence_filter
from filters.savgol import savgol_smooth
# ✅ Import CP Filters from the cpoint folder
from filters.cpoint.autothresh import autothresh_filter
from filters.cpoint.gof import gof_filter
from filters.cpoint.gofSphere import gof_sphere_filter
from filters.cpoint.rov import rov_filter
from filters.cpoint.stepanddrift import step_drift_filter
from filters.cpoint.threshold import threshold_filter
import duckdb
from filters.apply_contact_point_filters import calc_indentation

def register_filters(conn):
    """Registers all filter functions inside DuckDB for SQL queries."""

    # ✅ Register Median Filter
    conn.create_function("median_filter_array", median_filter_array, return_type="DOUBLE[]")

    # ✅ Register Linear Detrend Filter
    conn.create_function("linear_detrend", lineardetrend_filter, return_type="DOUBLE[]")

    # ✅ Register Notch Filter
    conn.create_function("notch_filter", notch_filter, return_type="DOUBLE[]")

    # ✅ Register Baseline Filter
    conn.create_function("polytrend_filter", polytrend_filter, return_type="DOUBLE[]")

    # ✅ Register Prominency Filter
    conn.create_function("prominence_filter", prominence_filter, return_type="DOUBLE[]")

    # ✅ Register Savitzky-Golay (SavGol) Filter
    conn.create_function("savgol_smooth", savgol_smooth, 
                         return_type="DOUBLE[]")

    conn.create_function("autotresh_filter", autothresh_filter, return_type="DOUBLE[][]", null_handling='SPECIAL')
    conn.create_function("gof_filter", gof_filter, return_type="DOUBLE[][]")
    conn.create_function("gof_sphere_filter", gof_sphere_filter, return_type="DOUBLE[][]")
    conn.create_function("rov_filter", rov_filter, return_type="DOUBLE[][]")
    conn.create_function("step_drift_filter", step_drift_filter, return_type="DOUBLE[][]")
    conn.create_function("threshold_filter", threshold_filter, return_type="DOUBLE[][]")

    print("✅ All filters (Main + CP Filters) registered successfully in DuckDB.")


    conn.create_function(
        "calc_indentation",
        calc_indentation,
        [
            duckdb.list_type('DOUBLE'),                # z_values: DOUBLE[]
            duckdb.list_type('DOUBLE'),                # force_values: DOUBLE[]
            duckdb.list_type(duckdb.list_type('DOUBLE')),  # cp: DOUBLE[][]
            'DOUBLE',                                  # spring_constant: DOUBLE
            'BOOLEAN'                                  # set_zero_force: BOOLEAN
        ],
        duckdb.list_type(duckdb.list_type('DOUBLE')),  # Return: DOUBLE[][]
        null_handling='SPECIAL'
    )
    # Nested list return type
  # Returns [Zi, Fi]
    