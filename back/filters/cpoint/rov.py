import numpy as np

def rov_filter(x, y, safe_threshold=10, x_range=1000, windowRov=200):
    """
    Returns contact point based on maximum variance ratio.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - safe_threshold: Force threshold in nanoNewtons (default: 10 nN)
    - x_range: Range in nanometers for x threshold (default: 1000 nm)
    - windowRov: Window size in nanometers for variance ratio (default: 200 nm)
    """
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    out = getWeight(x, y, safe_threshold, x_range, windowRov)
    if not out:
        return False
    zz_x, rov = out
    rov_best_ind = np.argmax(rov)
    j_rov = np.argmin(np.abs(x - zz_x[rov_best_ind]))  # Avoid squaring
    return [[float(x[j_rov]), float(y[j_rov])]]  # Ensure float output

def getRange(x, y, safe_threshold, x_range):
    """
    Returns min and max indices based on thresholds.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - safe_threshold: Force threshold in nanoNewtons
    - x_range: Range in nanometers for x threshold
    """
    try:
        f_threshold = safe_threshold * 1e-9  # Convert nN to N
        x_range_nm = x_range * 1e-9  # Convert nm to m
        jmax = np.argmin(np.abs(y - f_threshold))
        jmin = np.argmin(np.abs(x - (x[jmax] - x_range_nm)))
        return jmin, jmax
    except ValueError:
        return False

def getWeight(x, y, safe_threshold, x_range, windowRov):
    """
    Returns x values and variance ratios for contact point detection.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - safe_threshold: Force threshold in nanoNewtons
    - x_range: Range in nanometers for x threshold
    - windowRov: Window size in nanometers for variance ratio
    """
    out = getRange(x, y, safe_threshold, x_range)
    if not out:
        return False
    jmin, jmax = out
    
    # Calculate window size
    winr = windowRov * 1e-9  # Convert nm to m
    xstep = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1
    win = int(winr / xstep)
    
    # Adjust bounds
    if len(y) - jmax < win:
        jmax = len(y) - 1 - win
    if jmin < win:
        jmin = win
    if jmax <= jmin:
        return False
    
    # Pre-allocate array and use rolling window calculation
    n = jmax - jmin
    rov = np.zeros(n)
    
    # Vectorized variance calculation
    past_windows = np.lib.stride_tricks.sliding_window_view(y[jmin-win:jmax-1], win)
    future_windows = np.lib.stride_tricks.sliding_window_view(y[jmin+1:jmax+win], win)
    
    # Calculate variances and ratios
    past_vars = np.var(past_windows, axis=1)
    future_vars = np.var(future_windows, axis=1)
    np.divide(future_vars, past_vars, out=rov, where=past_vars != 0)
    
    return x[jmin:jmax], rov