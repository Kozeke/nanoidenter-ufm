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

    def calculate(self, x, y, metadata=None):
        """
        Returns contact point (z0, f0) based on max R-squared for spherical data.
        :param x: Array of force values (DOUBLE[])
        :param y: Array of z-values (DOUBLE[])
        :param metadata: Dictionary containing metadata values (spring_constant, tip_radius, tip_geometry)
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        fit_window = self.get_value("fit_window")
        x_range = self.get_value("x_range")
        force_threshold = self.get_value("force_threshold")

        # Extract metadata values with defaults
        spring_constant = metadata.get('spring_constant', 1.0) if metadata else 1.0
        tip_radius = metadata.get('tip_radius', 1e-5) if metadata else 1e-5  # Default 10 nm in meters
        tip_geometry = metadata.get('tip_geometry', 'sphere') if metadata else 'sphere'
        
        # print(f"🔍 GofSphereFilter.calculate() DEBUG:")
        # print(f"  📊 Input data: x={len(x)} points, y={len(y)} points")
        # print(f"  📋 Parameters from filter instance:")
        # print(f"    - fit_window: {fit_window}")
        # print(f"    - x_range: {x_range}")
        # print(f"    - force_threshold: {force_threshold}")
        # print(f"  🔧 Metadata values:")
        # print(f"    - spring_constant: {spring_constant}")
        # print(f"    - tip_radius: {tip_radius}")
        # print(f"    - tip_geometry: {tip_geometry}")

        # DO NOT SWAP: keep x=z, y=f
        z = np.asarray(x, dtype=np.float64)  # z-values
        f = np.asarray(y, dtype=np.float64)  # force-values

        try:
            # print(f"  🚀 Calling getWeight with: fit_window={fit_window}, x_range={x_range}, force_threshold={force_threshold}")
            zz_x, r_squared = self.getWeight(z, f, fit_window, x_range, force_threshold, spring_constant, tip_radius)
            # print(f"  📊 getWeight returned: zz_x.size={zz_x.size}, r_squared.size={r_squared.size}")
            
            if zz_x.size == 0 or r_squared.size == 0:  # Explicit size check
                # print(f"  ❌ Empty arrays returned from getWeight, returning None")
                return None
                
            r_best_ind = np.argmax(r_squared)
            j_gof = np.argmin(np.abs(z - zz_x[r_best_ind]))
            # print(f"  ✅ Contact point found at index {j_gof}: z={z[j_gof]:.6e}, f={f[j_gof]:.6e}")
            # print(f"  📈 R-squared values range: [{r_squared.min():.6f}, {r_squared.max():.6f}], best={r_squared[r_best_ind]:.6f}")
            return [[float(z[j_gof]), float(f[j_gof])]]  # Ensure list of floats
        except (TypeError, ValueError) as e:
            # print(f"  ❌ Error in calculation: {e}")
            # import traceback
            # traceback.print_exc()
            return None

    def getRange(self, x, y, x_range, force_threshold):
        """Returns min and max indices of f-z data considered."""
        try:
            thr_N = float(force_threshold) * 1e-9   # nN → N
            xr_m  = float(x_range)        * 1e-9    # nm → m

            # print(f"    🔍 getRange called with: x_range={x_range}nm, force_threshold={force_threshold}nN")
            # print(f"    📊 Data ranges: x=[{x.min():.2e}, {x.max():.2e}], y=[{y.min():.2e}, {y.max():.2e}]")
            # print(f"    🎯 Looking for y closest to {thr_N:.2e}")

            # ORIGINAL BEHAVIOR: pick the index where y is closest to +threshold
            jmax = int(np.argmin((y - thr_N)**2))
            # print(f"    ✅ Found closest point to threshold at index {jmax} (y={y[jmax]:.2e})")

            # Choose a left bound ~ x_range to the left of jmax
            jmin = int(np.argmin(np.abs(x - (x[jmax] - xr_m))))
            # print(f"    📏 Initial range: jmin={jmin}, jmax={jmax}")

            # Guard: if inverted (can happen near edges), pull jmin left
            if jmin >= jmax:
                jmin = max(0, jmax - max(10, len(x)//20))  # ~5% or >=10 pts
                # print(f"    ⚠️  Inverted range detected, adjusted jmin to {jmin}")

            # print(f"    📏 Final range: jmin={jmin}, jmax={jmax}, force_range=[{y[jmin]:.2e}, {y[jmax]:.2e}]")
            # print(f"    📏 x_range: [{x[jmin]:.2e}, {x[jmax]:.2e}]")
            return jmin, jmax
        except ValueError as e:
            # print(f"    ❌ ValueError in getRange: {e}")
            return False

    def getWeight(self, x, y, fit_window, x_range, force_threshold, spring_constant, tip_radius):
        """Returns weight array (R-squared) and corresponding index array."""
        out = self.getRange(x, y, x_range, force_threshold)
        if not out:
            # print("DEBUG: GofSphereFilter - getRange returned False")
            return np.array([]), np.array([])
        jmin, jmax = out
        
        zwin = fit_window * 1e-9  # nm to m
        zstep = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1
        win = int(zwin / zstep)
        
        # Cap the window size to a reasonable maximum (e.g., 10% of data length)
        max_win = max(10, len(x) // 10)  # At least 10 points, but no more than 10% of data
        min_win = 5  # Minimum window size for meaningful analysis
        
        if win > max_win:
            # print(f"DEBUG: GofSphereFilter - Capping window size from {win} to {max_win}")
            win = max_win
        elif win < min_win:
            # print(f"DEBUG: GofSphereFilter - Increasing window size from {win} to {min_win}")
            win = min_win
        
        # print(f"DEBUG: GofSphereFilter - Window calculation: zwin={zwin:.2e}, zstep={zstep:.2e}, win={win}")
        # print(f"DEBUG: GofSphereFilter - Before adjustment: jmin={jmin}, jmax={jmax}, len(y)={len(y)}")
        
        if len(y) - jmax < win:
            jmax = len(y) - 1 - win
            # print(f"DEBUG: GofSphereFilter - Adjusted jmax to {jmax} due to window size")
        if jmax <= jmin:
            # print(f"DEBUG: GofSphereFilter - jmax <= jmin ({jmax} <= {jmin}), returning empty arrays")
            return np.array([]), np.array([])

        j_x = np.arange(jmin, jmax)
        r_squared = np.zeros(len(j_x))
        # print(f"DEBUG: GofSphereFilter - Processing {len(j_x)} points from {jmin} to {jmax}")
        
        for i, j in enumerate(j_x):
            try:
                ind, Yf = self.get_indentation(x, y, j, win, spring_constant, tip_radius)
                if ind is False or ind.size == 0:
                    continue
                r_squared[i] = self.fit(x, y, ind, Yf, tip_radius)
            except TypeError:
                # print("DEBUG: GofSphereFilter - TypeError in getWeight loop, returning empty arrays")
                return np.array([]), np.array([])
        
        result_x = x[jmin:jmax]
        # print(f"DEBUG: GofSphereFilter - getWeight returning: x_len={len(result_x)}, r_squared_len={len(r_squared)}")
        # print(f"DEBUG: GofSphereFilter - r_squared range: [{r_squared.min():.6f}, {r_squared.max():.6f}]")
        return result_x, r_squared

    def get_indentation(self, x, y, iContact, win, spring_constant, tip_radius):
        """Returns indentation and force arrays for small indentations."""
        if iContact + win > len(x):
            # print(f"DEBUG: GofSphereFilter - get_indentation: iContact + win ({iContact + win}) > len(x) ({len(x)})")
            return False
        slice_range = slice(iContact, iContact + win)
        
        Zf = x[slice_range] - x[iContact]
        Yf = y[slice_range] - y[iContact]
        ind = Zf - Yf / spring_constant
        
        threshold = 0.1 * tip_radius
        mask = ind <= threshold
        # print(f"DEBUG: GofSphereFilter - get_indentation: iContact={iContact}, win={win}, threshold={threshold:.2e}")
        # print(f"DEBUG: GofSphereFilter - get_indentation: ind range=[{ind.min():.2e}, {ind.max():.2e}], mask sum={mask.sum()}/{len(mask)}")
        
        if mask.sum() == 0:
            # print("DEBUG: GofSphereFilter - get_indentation: No points pass the indentation threshold")
            return False, np.array([])
        
        return ind[mask], Yf[mask]

    def fit(self, x, y, ind, f, tip_radius):
        """Returns R-squared value from Hertz model fit."""
        seeds = [1000.0 / 1e9]  # E in GPa to Pa
        
        def hertz(x, E):
            x = np.abs(x)
            poisson = 0.5
            return (4.0 / 3.0) * (E / (1 - poisson**2)) * np.sqrt(tip_radius * x**3)
        
        try:
            popt, _ = curve_fit(hertz, ind, f, p0=seeds, maxfev=10000)
            residuals = f - hertz(ind, *popt)
            r_squared = 1 - np.sum(residuals**2) / np.sum((f - np.mean(f))**2)
            # print(f"DEBUG: GofSphereFilter - fit: r_squared={r_squared:.6f}")
            return r_squared if r_squared > 0 else 0
        except (RuntimeError, ValueError) as e:
            # print(f"DEBUG: GofSphereFilter - fit error: {e}")
            return 0