import numpy as np
from scipy.optimize import curve_fit

def gof_sphere_filter(x, y, fit_window=200, x_range=1000, force_threshold=10):
    """
    Returns contact point (z0, f0) based on max R-squared.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - fit_window: Window size in nanometers for indentation fit (default: 200 nm)
    - x_range: Range in nanometers for x threshold (default: 1000 nm)
    - force_threshold: Force threshold in nanoNewtons (default: 10 nN)
    """
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    try:
        zz_x, r_squared = getWeight(x, y, fit_window, x_range, force_threshold)
        if zz_x.size == 0 or r_squared.size == 0:  # Explicit size check
            return None
        r_best_ind = np.argmax(r_squared)
        j_gof = np.argmin(np.abs(x - zz_x[r_best_ind]))
        return [[float(x[j_gof]), float(y[j_gof])]]  # Ensure list of floats
    except (TypeError, ValueError):
        return None

def getRange(x, y, x_range, force_threshold):
    """
    Returns min and max indices of f-z data considered.
    """
    try:
        force_threshold_nN = force_threshold * 1e-9  # nN to N
        x_range_nm = x_range * 1e-9  # nm to m
        jmax = np.argmin(np.abs(y - force_threshold_nN))
        jmin = np.argmin(np.abs(x - (x[jmax] - x_range_nm)))
        return jmin, jmax
    except ValueError:
        return False

def getWeight(x, y, fit_window, x_range, force_threshold):
    """
    Returns weight array (R-squared) and corresponding index array.
    """
    out = getRange(x, y, x_range, force_threshold)
    if not out:
        return np.array([]), np.array([])
    jmin, jmax = out
    
    zwin = fit_window * 1e-9  # nm to m
    zstep = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1
    win = int(zwin / zstep)
    
    if len(y) - jmax < win:
        jmax = len(y) - 1 - win
    if jmax <= jmin:
        return np.array([]), np.array([])

    j_x = np.arange(jmin, jmax)
    r_squared = np.zeros(len(j_x))
    
    for i, j in enumerate(j_x):
        try:
            ind, Yf = get_indentation(x, y, j, win)
            if ind is False or ind.size == 0:
                continue
            r_squared[i] = fit(x, y, ind, Yf)
        except TypeError:
            return np.array([]), np.array([])
            
    return x[jmin:jmax], r_squared

def get_indentation(x, y, iContact, win):
    """Returns indentation and force arrays for small indentations"""
    if iContact + win > len(x):
        return False
    spring_constant = 1.0
    R = 1e-5  # 10 µm
    slice_range = slice(iContact, iContact + win)
    
    Zf = x[slice_range] - x[iContact]
    Yf = y[slice_range] - y[iContact]
    ind = Zf - Yf / spring_constant
    
    mask = ind <= 0.1 * R
    return ind[mask], Yf[mask]

def fit(x, y, ind, f):
    """Returns R-squared value from Hertz model fit"""
    R = 1e-5
    seeds = [1000.0 / 1e9]  # E in GPa to Pa
    
    def hertz(x, E):
        x = np.abs(x)
        poisson = 0.5
        return (4.0 / 3.0) * (E / (1 - poisson**2)) * np.sqrt(R * x**3)
    
    try:
        popt, _ = curve_fit(hertz, ind, f, p0=seeds, maxfev=10000)
        residuals = f - hertz(ind, *popt)
        r_squared = 1 - np.sum(residuals**2) / np.sum((f - np.mean(f))**2)
        return r_squared if r_squared > 0 else 0
    except (RuntimeError, ValueError):
        return 0