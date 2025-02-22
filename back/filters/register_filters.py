from filters.median import median_filter_array
from filters.lineardetrend import lineardetrend_filter
from filters.notch import notch_filter
from filters.polytrend import polytrend_filter
from filters.prominence import prominence_filter
from filters.savgol import savgol_smooth

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

    print("✅ All filters registered successfully in DuckDB.")
