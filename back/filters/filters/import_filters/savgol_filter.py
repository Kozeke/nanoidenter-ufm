import numpy as np
from scipy.signal import savgol_filter
from ..filter_base import FilterBase

class SavgolSmoothFilter(FilterBase):
    NAME = "SavgolSmooth"
    DESCRIPTION = "Applies the Savitzky-Golay filter to smooth data while preserving steps"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters."""
        self.add_parameter(
            "window_size",
            "float",
            "Window size for filtering (in nm)",
            25.0
        )
        self.add_parameter(
            "polyorder",
            "int",
            "Polynomial order for smoothing",
            3
        )

    def calculate(self, x, y):
        """
        Applies the Savitzky-Golay filter to smooth data while preserving steps.

        :param x: List or NumPy array of x-axis values
        :param y: List or NumPy array of y-axis values
        :return: Smoothed y-values as a list
        """
        # Retrieve parameters
        window_size = int(self.get_value("window_size"))
        polyorder = int(self.get_value("polyorder"))
        print(window_size, polyorder)
        # Convert input to NumPy arrays for efficiency
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        if len(x) == 0 or len(y) == 0:
            return y  # Return original if empty
        print("here")
        # Compute step size
        xstep = (max(x) - min(x)) / (len(x) - 1) if len(x) > 1 else 1.0  # Avoid division by zero

        # Convert window size from nm to number of points
        win = max(1, int(window_size * 1e-9 / xstep))

        # Ensure window size is odd
        if win % 2 == 0:
            win += 1

        # Ensure polyorder is not greater than window size
        polyorder = min(polyorder, win - 1)

        # Apply Savitzky-Golay filter
        y_smooth = savgol_filter(y, win, polyorder)

        return y_smooth.tolist()  # Return as a list