import numpy as np
from scipy.signal import savgol_filter

def savgol_smooth(x, y, window_size=25.0, polyorder=3):
    """
    Applies the Savitzky-Golay filter to smooth data while preserving steps.
    
    :param x: List or NumPy array of x-axis values
    :param y: List or NumPy array of y-axis values
    :param window_size: Window size for filtering (default=25.0 nm)
    :param polyorder: Polynomial order for smoothing (default=3)
    :return: Smoothed y-values
    """
    # ✅ Convert input to NumPy arrays for efficiency
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)

    if len(x) == 0 or len(y) == 0:
        return y  # ✅ Return original if empty

    # ✅ Compute step size
    xstep = (max(x) - min(x)) / (len(x) - 1)

    # ✅ Convert window size from nm to number of points
    win = max(1, int(window_size * 1e-9 / xstep))

    # ✅ Ensure window size is odd
    if win % 2 == 0:
        win += 1

    # ✅ Ensure polyorder is not greater than window size
    polyorder = min(polyorder, win - 1)

    # ✅ Apply Savitzky-Golay filter
    y_smooth = savgol_filter(y, win, polyorder)

    return y_smooth.tolist()  # ✅ Ensure returning list
