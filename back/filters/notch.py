import numpy as np
from scipy.signal import iirnotch, filtfilt

def notch_filter(x, y, period_nm=100.0, quality_factor=10):
    """
    Apply a notch filter to remove periodic noise from signal.

    :param x: Array of x-axis values.
    :param y: Array of y-axis values.
    :param period_nm: Notch period in nanometers (default: 100.0).
    :param quality_factor: Quality factor for notch filter (default: 10).
    :return: Filtered y-values.
    """
    if len(x) < 2 or len(y) < 2:
        return y  # ✅ Return original if too few points for filtering

    # ✅ Compute frequency (Hz) from period (nm)
    dz = (x[-1] - x[0]) / (len(x) - 1)  # Spacing between x-values
    freq = dz / (period_nm * 1e-9)  # Convert period to Hz

    # ✅ Ensure valid quality factor (Q) > 0 to prevent division issues
    Q = max(1, quality_factor)

    # ✅ Apply IIR Notch filter
    b, a = iirnotch(freq, Q)
    y_filtered = filtfilt(b, a, y)  # ✅ Zero-phase filtering (avoids phase shift)

    return y_filtered.tolist()  # ✅ Convert back to list
