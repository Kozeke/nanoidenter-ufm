from scipy.stats import linregress
import numpy as np

def get_indentation(z, f, iContact, win):
    spring_constant = 1.0
    """Returns indentation and force arrays"""
    slice_range = slice(iContact, iContact + win)
    Zf = z[slice_range] - z[iContact]
    force = f[slice_range] - f[iContact]
    delta = Zf - force / spring_constant
    return delta, force

def getFit(delta, force):
    """Returns R-squared value from linear regression"""
    linforce = np.cbrt(force**2)  # More efficient than (force**2)**(1/3)
    slope, intercept, r_value, _, _ = linregress(delta, linforce)
    return r_value**2

import numpy as np

def gof_filter(x, y, fitwindow=200, maxf=50, minx=50):
    """
    Returns contact point (z0, f0) based on max R-squared.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - fitwindow: Window size in nanometers for indentation fit (default: 10 nm)
    - maxf: Percentage of force range to set force threshold (default: 10%)
    - minx: Percentage of x range to set x threshold (default: 10%)
    """
    # Convert to numpy arrays once
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    
    # Calculate constants outside loop
    dx = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1  # Avoid division by zero
    window = int(fitwindow * 1e-9 / dx)  # Convert fitwindow from nm to index units
    
    # Compute thresholds
    fthreshold = y.min() + (y.max() - y.min()) * maxf / 100  # Force threshold based on maxf
    xthreshold = x.min() + (x.max() - x.min()) * minx / 100
    
    # Use searchsorted for thresholds (more efficient than argmin with squares)
    jmin = np.searchsorted(x, xthreshold, side='left')
    jmax = np.searchsorted(y, fthreshold, side='left')
    
    # Ensure jmax is at least jmin + 1 and within bounds
    jmax = max(jmax, jmin + 1)
    jmax = min(jmax, len(x))  # Cap at array length to avoid index errors
    
    # Pre-allocate R2 array
    R2 = np.zeros(jmax - jmin)
    
    # Vectorize where possible
    for j in range(jmin, jmax):
        try:
            d, f = get_indentation(x, y, j, window)
            R2[j - jmin] = getFit(d, f)
        except:
            continue  # Keep 0 as default value
    
    # Find best fit
    r_best_ind = np.argmax(R2)
    j_gof = jmin + r_best_ind
    
    return [[float(x[j_gof]), float(y[j_gof])]]
