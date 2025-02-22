from scipy.signal import medfilt
import numpy as np

# ✅ Function to apply median filtering to an array with configurable window size
def median_filter_array(force_values, window_size=5):
    """
    Apply a median filter to an array of force values.

    :param force_values: List of force values.
    :param window_size: Window size for median filter (must be odd).
    :return: Filtered force values.
    """
    if not isinstance(force_values, list) or len(force_values) == 0:
        return force_values  # ✅ Return original if empty or invalid

    # ✅ Ensure the window size is odd
    window_size = max(3, window_size)  # Minimum window size = 3
    window_size = window_size + 1 if window_size % 2 == 0 else window_size  

    # ✅ Apply median filter
    filtered = medfilt(np.array(force_values), window_size)

    return filtered.tolist()  # ✅ Convert back to list for DuckDB
