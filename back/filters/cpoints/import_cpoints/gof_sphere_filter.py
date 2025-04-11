import numpy as np
from scipy.optimize import curve_fit
from ..cpoint_base import CpointBase

class GofSphereFilter(CpointBase):
    NAME = "GofSphere"
    DESCRIPTION = "Goodness-of-fit filter for spherical data to find contact point"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("fit_window", "int", "Fit window size [nm]", 200)
        self.add_parameter("x_range", "int", "X range [nm]", 1000)
        self.add_parameter("force_threshold", "int", "Force threshold [nN]", 10)

    def calculate(self, x, y):
        """
        Returns contact point (z0, f0) based on max R-squared for spherical data.
        :param x: Array of force values (DOUBLE[])
        :param y: Array of z-values (DOUBLE[])
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        fit_window = self.get_value("fit_window")
        x_range = self.get_value("x_range")
        force_threshold = self.get_value("force_threshold")

        # Note: Original class had x as force_values and y as z_values, but function expects x as z and y as force
        # Swapping x and y to match gof_sphere_filter logic
        z = np.asarray(y, dtype=np.float64)  # z-values
        f = np.asarray(x, dtype=np.float64)  # force values

        try:
            zz_x, r_squared = self.getWeight(z, f, fit_window, x_range, force_threshold)
            if zz_x.size == 0 or r_squared.size == 0:  # Explicit size check
                return None
            r_best_ind = np.argmax(r_squared)
            j_gof = np.argmin(np.abs(z - zz_x[r_best_ind]))
            return [[float(z[j_gof]), float(f[j_gof])]]  # Ensure list of floats
        except (TypeError, ValueError):
            return None

    def getRange(self, x, y, x_range, force_threshold):
        """Returns min and max indices of f-z data considered."""
        try:
            force_threshold_nN = force_threshold * 1e-9  # nN to N
            x_range_nm = x_range * 1e-9  # nm to m
            jmax = np.argmin(np.abs(y - force_threshold_nN))
            jmin = np.argmin(np.abs(x - (x[jmax] - x_range_nm)))
            return jmin, jmax
        except ValueError:
            return False

    def getWeight(self, x, y, fit_window, x_range, force_threshold):
        """Returns weight array (R-squared) and corresponding index array."""
        out = self.getRange(x, y, x_range, force_threshold)
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
                ind, Yf = self.get_indentation(x, y, j, win)
                if ind is False or ind.size == 0:
                    continue
                r_squared[i] = self.fit(x, y, ind, Yf)
            except TypeError:
                return np.array([]), np.array([])
                
        return x[jmin:jmax], r_squared

    def get_indentation(self, x, y, iContact, win):
        """Returns indentation and force arrays for small indentations."""
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

    def fit(self, x, y, ind, f):
        """Returns R-squared value from Hertz model fit."""
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