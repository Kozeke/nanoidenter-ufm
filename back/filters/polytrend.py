import numpy as np

def polytrend_filter(x, y, percentile=90, degree=2):
    """
    Removes the baseline from y-values using polynomial fitting.

    :param x: List or NumPy array of x-axis values
    :param y: List or NumPy array of y-axis values
    :param percentile: Percentile threshold for baseline detection (1-99)
    :param degree: Polynomial degree for baseline fitting (2-6)
    :return: Detrended y-values
    """
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)

    if len(x) == 0 or len(y) == 0:
        return y  # ✅ Return original if empty

    # ✅ Ensure percentile is within a valid range
    percentile = np.clip(percentile, 1, 99)

    # ✅ Compute percentile threshold
    threshold = np.percentile(y, percentile)

    # ✅ Find last valid index where y is below the threshold
    i_last = np.max(np.where(y <= threshold)[0], initial=len(y)-1)

    # ✅ Select points up to i_last for polynomial fitting
    x_fit, y_fit = x[:i_last+1], y[:i_last+1]

    # ✅ Ensure polynomial degree is valid
    degree = np.clip(degree, 2, min(6, len(x_fit) - 1))  # Avoid overfitting

    # ✅ Fit a polynomial & remove baseline
    pol_coeff = np.polyfit(x_fit, y_fit, degree)
    y_corrected = y - np.polyval(pol_coeff, x)

    return y_corrected.tolist()  # ✅ Ensure returning a list
