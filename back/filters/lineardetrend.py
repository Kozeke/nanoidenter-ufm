import numpy as np
from scipy.signal import savgol_filter

def lineardetrend_filter(x, y, smoothing_window=51, threshold=1e-12):
    """
    Remove the linear trend from y-values using Savitzky-Golay filtering.

    :param x: List or NumPy array of x-axis values
    :param y: List or NumPy array of y-axis values
    :param smoothing_window: Window size for Savitzky-Golay filter (must be odd and < len(y))
    :param threshold: Threshold for detecting the baseline trend
    :return: Detrended y-values
    """
    # ✅ Ensure inputs are NumPy arrays
    x = np.array(x, dtype=np.float64)
    y = np.array(y, dtype=np.float64)

    if len(x) == 0 or len(y) == 0:
        return []  # ✅ Return an empty list if input is empty (prevents errors)

    # ✅ Ensure the smoothing window is valid
    smoothing_window = max(5, min(smoothing_window, len(y) - 1))  # Ensure it's within valid range
    if smoothing_window % 2 == 0:
        smoothing_window += 1  # ✅ Savitzky-Golay filter requires an odd window size

    # ✅ Compute derivative using Savitzky-Golay filter
    dy = savgol_filter(y, smoothing_window, polyorder=3, deriv=1)

    # ✅ Ensure valid threshold filtering
    j = np.argmax(dy > threshold) if np.any(dy > threshold) else len(dy) - 1
    k = j - np.argmax(dy[:j][::-1] < 0) if j > 0 else 0

    # ✅ Extract baseline data
    x_base = x[:k]
    y_base = y[:k]

    # ✅ Linear baseline fitting
    if len(x_base) > 1 and len(y_base) > 1:
        m, q = np.polyfit(x_base, y_base, 1)
        y_corrected = y - (m * x + q)
    else:
        y_corrected = y  # ✅ Prevent errors for too short data

    return y_corrected.tolist()  # ✅ Ensure returning a list, NOT NumPy array
