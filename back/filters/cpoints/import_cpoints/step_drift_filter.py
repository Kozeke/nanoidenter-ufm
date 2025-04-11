import numpy as np
from ..cpoint_base import CpointBase
from scipy.signal import savgol_filter


class StepDriftFilter(CpointBase):
    NAME = "StepDrift"
    DESCRIPTION = "Step drift filter to find contact point based on derivative thresholds"
    DOI = ""
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("window", "int", "Window size for Savitzky-Golay filter", 51)
        self.add_parameter("threshold", "float", "Derivative threshold [pN/nm]", 1000)
        self.add_parameter("thratio", "float", "Threshold ratio for drop detection", 0.1)

    def calculate(self, x, y):
        """
        Returns contact point based on derivative thresholds.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :return: List of [z0, f0] as [float, float] or None if no valid point is found
        """
        # Convert to numpy arrays once
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        if len(x) < 2 or len(y) < 2:
            return None  # Return None if insufficient data

        # Pre-calculate constants
        window = self.get_value("window")
        threshold = self.get_value("threshold") / 1e12  # Convert pN/nm to N/m
        thr_ratio = self.get_value("thratio") * self.get_value("threshold") / 1e14  # Adjust ratio

        # Ensure window is valid
        window = max(5, min(window, len(y) - 1))  # Within valid range
        if window % 2 == 0:
            window += 1  # Savitzky-Golay requires odd window size

        # Calculate derivative with Savitzky-Golay filter
        dy = savgol_filter(y, window, 3, deriv=1)
        
        # Find first point exceeding threshold
        j = np.argmax(dy > threshold)
        if j == 0 and dy[0] <= threshold:  # No point found
            return [[float(x[0]), float(y[0])]]  # Return first point as fallback
        
        # Find point dropping below ratio threshold
        dy_slice = dy[:j+1][::-1]  # Reverse slice up to j
        k_rel = np.argmax(dy_slice < thr_ratio)
        k = j - k_rel if k_rel > 0 or dy_slice[0] < thr_ratio else j
        
        if k >= len(x):  # Ensure k is within bounds
            return None

        return [[float(x[k]), float(y[k])]]