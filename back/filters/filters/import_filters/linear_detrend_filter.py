import numpy as np
from scipy.signal import savgol_filter
from ..filter_base import FilterBase

class LinearDetrendFilter(FilterBase):
    NAME = "LinearDetrend"
    DESCRIPTION = "Remove the linear trend from y-values using Savitzky-Golay filtering"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters."""
        self.add_parameter(
            "smoothing_window",
            "int",
            "Window size for Savitzky-Golay filter (must be odd)",
            51
        )
        self.add_parameter(
            "threshold",
            "float",
            "Threshold for detecting the baseline trend",
            1e-12
        )

    def calculate(self, x, y):
        """
        Remove the linear trend from y-values using Savitzky-Golay filtering.

        :param x: List or NumPy array of x-axis values
        :param y: List or NumPy array of y-axis values
        :return: Detrended y-values as a list
        """
        # Retrieve parameters
        smoothing_window = int(self.get_value("smoothing_window"))  # Force to integer
        threshold = self.get_value("threshold")

        # Ensure inputs are NumPy arrays
        x = np.array(x, dtype=np.float64)
        y = np.array(y, dtype=np.float64)
        # print("before", x)
        # print("y", y)
        if len(x) == 0 or len(y) == 0:
            return []  # Return an empty list if input is empty
        # print("after")

        # Ensure the smoothing window is valid
        smoothing_window = max(5, min(smoothing_window, len(y) - 1))  # Within valid range
        if smoothing_window % 2 == 0:
            smoothing_window += 1  # Savitzky-Golay requires an odd window size
        # print("here", smoothing_window, threshold)
        # print("y",y)
        # Compute derivative using Savitzky-Golay filter
        dy = savgol_filter(y, smoothing_window, polyorder=3, deriv=1)
        # print("here")
        # Find the first index where derivative exceeds threshold
        j = int(np.argmax(dy > threshold)) if np.any(dy > threshold) else len(dy) - 1
        # print("heere")

        if j > 0:
            # Find the last index before j where derivative drops below 0
            reversed_slice = dy[:j][::-1]
            k = j - int(np.argmax(reversed_slice < 0)) if np.any(reversed_slice < 0) else 0
            # print("heere")

        else:
            k = 0
        # print("heere")
        # Extract baseline data
        x_base = x[:k]
        y_base = y[:k]

        # Linear baseline fitting
        if len(x_base) > 1 and len(y_base) > 1:
            m, q = np.polyfit(x_base, y_base, 1)
            y_corrected = y - (m * x + q)
        else:
            y_corrected = y  # Prevent errors for too short data

        return y_corrected.tolist()  # Return as a list