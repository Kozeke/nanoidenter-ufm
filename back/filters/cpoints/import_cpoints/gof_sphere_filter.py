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
        # Optional: Add parameter to enable window capping if needed for stability
        # self.add_parameter("cap_window", "bool", "Cap window size to 10% of data", False)

    def calculate(self, x, y, metadata=None):
        """
        Returns contact point (z0, f0) based on max R-squared for spherical data.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :param metadata: Dictionary containing metadata values (spring_constant, tip_radius, tip_geometry)
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        fit_window = self.get_value("fit_window")
        x_range = self.get_value("x_range")
        force_threshold = self.get_value("force_threshold")

        # Extract metadata values with defaults
        spring_constant = metadata.get('spring_constant', 1.0) if metadata else 1.0
        tip_radius = metadata.get('tip_radius', 1e-5) if metadata else 1e-5  # Default 10 μm in meters
        tip_geometry = metadata.get('tip_geometry', 'sphere') if metadata else 'sphere'
        
        # Convert to numpy arrays
        z = np.asarray(x, dtype=np.float64)  # z-values
        f = np.asarray(y, dtype=np.float64)  # force-values

        try:
            zz_x, r_squared = self.getWeight(z, f, fit_window, x_range, force_threshold, spring_constant, tip_radius)
            
            # Check for empty results
            if zz_x.size == 0 or r_squared.size == 0:
                return None
                
            # Find best contact point based on maximum R-squared
            r_best_ind = np.argmax(r_squared)
            j_gof = np.argmin((z - zz_x[r_best_ind])**2)
            
            return [[float(z[j_gof]), float(f[j_gof])]]
            
        except (TypeError, ValueError) as e:
            # Return None if any error occurs
            return None

    def getRange(self, x, y, x_range, force_threshold):
        """Returns min and max indices of f-z data considered."""
        try:
            # Convert parameters to SI units
            thr_N = float(force_threshold) * 1e-9   # nN → N
            xr_m  = float(x_range) * 1e-9           # nm → m

            # Find index where force is closest to threshold
            # Match SoftMech: use **2 instead of abs
            jmax = np.argmin((y - thr_N) ** 2)
            
            # Find left bound x_range to the left of jmax
            # Match SoftMech: use **2 instead of abs
            jmin = np.argmin((x - (x[jmax] - xr_m)) ** 2)
            
            return jmin, jmax
            
        except ValueError:
            return False

    def getWeight(self, x, y, fit_window, x_range, force_threshold, spring_constant, tip_radius):
        """Returns weight array (R-squared) and corresponding index array."""
        # Get the range of indices to consider
        out = self.getRange(x, y, x_range, force_threshold)
        if not out:
            return np.array([]), np.array([])
        
        jmin, jmax = out
        
        # Calculate window size in data points
        zwin = fit_window * 1e-9  # nm to m
        zstep = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1
        win = int(zwin / zstep)
        
        # REMOVED: Window capping to match SoftMech behavior
        # If you need stability, uncomment this and add cap_window parameter:
        # if self.get_value("cap_window"):
        #     max_win = max(10, len(x) // 10)
        #     min_win = 5
        #     win = np.clip(win, min_win, max_win)
        
        # Ensure we have enough data after jmax for the fitting window
        if len(y) - jmax < win:
            jmax = len(y) - 1 - win
        
        # Check if we still have a valid range
        if jmax <= jmin:
            return np.array([]), np.array([])

        # Evaluate R-squared for each candidate contact point
        j_x = np.arange(jmin, jmax)
        r_squared = np.zeros(len(j_x))
        
        for i, j in enumerate(j_x):
            try:
                ind, Yf = self.get_indentation(x, y, j, win, spring_constant, tip_radius)
                if ind is False or ind.size == 0:
                    continue
                r_squared[i] = self.fit(ind, Yf, tip_radius)
            except (TypeError, ValueError):
                # Keep r_squared[i] = 0 for failed fits
                continue
        
        return x[jmin:jmax], r_squared

    def get_indentation(self, x, y, iContact, win, spring_constant, tip_radius):
        """Returns indentation and force arrays for small indentations."""
        # FIXED: Consistent return signature - always return tuple
        if iContact + win > len(x):
            return False, np.array([])
        
        # Extract window of data
        slice_range = slice(iContact, iContact + win)
        
        # Calculate indentation and force relative to contact point
        Zf = x[slice_range] - x[iContact]
        Yf = y[slice_range] - y[iContact]
        ind = Zf - Yf / spring_constant
        
        # Filter to small indentations only (≤10% of tip radius)
        threshold = 0.1 * tip_radius
        mask = ind <= threshold
        
        # Return False if no points pass the threshold
        if mask.sum() == 0:
            return False, np.array([])
        
        return ind[mask], Yf[mask]

    def fit(self, ind, f, tip_radius):
        """Returns R-squared value from Hertz model fit."""
        # Initial guess for elastic modulus (1 GPa in Pa)
        seeds = [1000.0e6]  # 1 GPa = 1000 MPa = 1e9 Pa
        
        def hertz(x, E):
            """Hertz contact model for spherical indenter."""
            x = np.abs(x)
            poisson = 0.5
            return (4.0 / 3.0) * (E / (1 - poisson**2)) * np.sqrt(tip_radius * x**3)
        
        try:
            # Fit the Hertz model
            popt, _ = curve_fit(hertz, ind, f, p0=seeds, maxfev=10000)
            
            # Calculate R-squared
            residuals = f - hertz(ind, *popt)
            ss_res = np.sum(residuals**2)
            ss_tot = np.sum((f - np.mean(f))**2)
            r_squared = 1 - (ss_res / ss_tot)
            
            # Return R-squared (clamp to 0 if negative)
            return r_squared if r_squared > 0 else 0
            
        except (RuntimeError, ValueError):
            # Return 0 if fitting fails
            return 0