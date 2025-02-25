import numpy as np


def calculate(self, x, y):
    """Returns contact point (z0, f0) based on max R-squared"""
    x = np.asarray(x)
    y = np.asarray(y)
    try:
        zz_x, r_squared = self.getWeight(x, y)
        if not zz_x.size or not r_squared:  # Check for empty results
            return False
        r_best_ind = np.argmax(r_squared)
        j_gof = np.argmin(np.abs(x - zz_x[r_best_ind]))  # Avoid squaring
        return [x[j_gof], y[j_gof]]
    except TypeError:
        return False

def getRange(self, x, y):
    """Returns min and max indices of f-z data considered"""
    try:
        force_threshold = self.getValue('force threshold') * 1e-9
        x_range = self.getValue('x range') * 1e-9
        jmax = np.argmin(np.abs(y - force_threshold))
        jmin = np.argmin(np.abs(x - (x[jmax] - x_range)))
        return jmin, jmax
    except ValueError:
        return False

def getWeight(self, x, y):
    """Returns weight array (R-squared) and corresponding index array"""
    out = self.getRange(x, y)
    if not out:
        return False
    jmin, jmax = out
    
    zwin = self.getValue('fit window') * 1e-9
    zstep = (x.max() - x.min()) / (len(x) - 1)
    win = int(zwin / zstep)
    
    if len(y) - jmax < win:
        jmax = len(y) - 1 - win
    if jmax <= jmin:
        return False

    j_x = np.arange(jmin, jmax)
    r_squared = np.zeros(len(j_x))
    
    for i, j in enumerate(j_x):
        try:
            ind, Yf = self.get_indentation(x, y, j, win)
            if ind is False:
                continue
            r_squared[i] = self.fit(x, y, ind, Yf)
        except TypeError:
            return False
            
    return x[jmin:jmax], r_squared

def get_indentation(self, x, y, iContact, win):
    """Returns indentation and force arrays for small indentations"""
    if iContact + win > len(x):
        return False
        
    R = self.curve.tip['radius']
    slice_range = slice(iContact, iContact + win)
    
    Zf = x[slice_range] - x[iContact]
    Yf = y[slice_range] - y[iContact]
    ind = Zf - Yf / self.curve.spring_constant
    
    # Filter for small indentations
    mask = ind <= 0.1 * R
    return ind[mask], Yf[mask]

def fit(self, x, y, ind, f):
    """Returns R-squared value from Hertz model fit"""
    R = self.curve.tip['radius']
    seeds = [1000.0 / 1e9]
    
    def hertz(x, E):
        x = np.abs(x)
        poisson = 0.5
        return (4.0 / 3.0) * (E / (1 - poisson**2)) * np.sqrt(R * x**3)
    
    try:
        popt, _ = curve_fit(hertz, ind, f, p0=seeds, maxfev=10000)
        residuals = f - hertz(ind, *popt)
        r_squared = 1 - np.sum(residuals**2) / np.sum((f - np.mean(f))**2)
        return r_squared if r_squared > 0 else 0  # Ensure non-negative R²
    except (RuntimeError, ValueError):
        return 0  # Return 0 instead of False for consistency