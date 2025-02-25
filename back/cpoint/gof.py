from scipy.stats import linregress
import numpy as np

def get_indentation(self, z, f, iContact, win):
    """Returns indentation and force arrays"""
    slice_range = slice(iContact, iContact + win)
    Zf = z[slice_range] - z[iContact]
    force = f[slice_range] - f[iContact]
    delta = Zf - force / self.curve.spring_constant
    return delta, force

def getFit(self, delta, force):
    """Returns R-squared value from linear regression"""
    linforce = np.cbrt(force**2)  # More efficient than (force**2)**(1/3)
    slope, intercept, r_value, _, _ = linregress(delta, linforce)
    return r_value**2

def calculate(self, x, y):
    """Returns contact point (z0, f0) based on max R-squared"""
    # Convert to numpy arrays once
    x = np.asarray(x)
    y = np.asarray(y)
    
    # Calculate constants outside loop
    dx = (x.max() - x.min()) / (len(x) - 1)
    window = int(self.getValue('fitwindow') * 1e-9 / dx)
    fthreshold = y.min() + (y.max() - y.min()) * self.getValue('maxf') / 100
    xthreshold = x.min() + (x.max() - x.min()) * self.getValue('minx') / 100
    
    # Use searchsorted for thresholds (more efficient than argmin with squares)
    jmin = np.searchsorted(x, xthreshold, side='left')
    jmax = np.searchsorted(y, fthreshold, side='left')
    
    # Pre-allocate R2 array
    R2 = np.zeros(jmax - jmin)
    
    # Vectorize where possible
    for j in range(jmin, jmax):
        try:
            d, f = self.get_indentation(x, y, j, window)
            R2[j - jmin] = self.getFit(d, f)
        except:
            continue  # Keep 0 as default value
    
    # Find best fit
    r_best_ind = np.argmax(R2)
    j_gof = jmin + r_best_ind
    
    return [x[j_gof], y[j_gof]]