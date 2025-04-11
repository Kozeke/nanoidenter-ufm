import numpy as np
from ..cpoint_base import CpointBase

class RovFilter(CpointBase):
    NAME = "Rov"
    DESCRIPTION = "Region of validity filter to find contact point based on maximum variance ratio"
    DOI = ""
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("safe_threshold", "float", "Force threshold [nN]", 10)
        self.add_parameter("x_range", "float", "X range [nm]", 1000)
        self.add_parameter("windowRov", "float", "Window size for variance ratio [nm]", 200)

    def calculate(self, x, y):
        """
        Returns contact point based on maximum variance ratio.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        safe_threshold = self.get_value("safe_threshold")
        x_range = self.get_value("x_range")
        windowRov = self.get_value("windowRov")

        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        out = self.getWeight(x, y, safe_threshold, x_range, windowRov)
        if not out:
            return None  # Changed from False to None for consistency
        zz_x, rov = out
        rov_best_ind = np.argmax(rov)
        j_rov = np.argmin(np.abs(x - zz_x[rov_best_ind]))  # Avoid squaring
        return [[float(x[j_rov]), float(y[j_rov])]]  # Ensure float output

    def getRange(self, x, y, safe_threshold, x_range):
        """Returns min and max indices based on thresholds."""
        try:
            f_threshold = safe_threshold * 1e-9  # Convert nN to N
            x_range_nm = x_range * 1e-9  # Convert nm to m
            jmax = np.argmin(np.abs(y - f_threshold))
            jmin = np.argmin(np.abs(x - (x[jmax] - x_range_nm)))
            return jmin, jmax
        except ValueError:
            return False

    def getWeight(self, x, y, safe_threshold, x_range, windowRov):
        """Returns x values and variance ratios for contact point detection."""
        out = self.getRange(x, y, safe_threshold, x_range)
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