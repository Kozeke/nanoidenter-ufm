import numpy as np
from scipy.signal import iirnotch, filtfilt
from ..filter_base import FilterBase

class NotchFilter(FilterBase):
    NAME = "Notch"
    DESCRIPTION = "Apply a notch filter to remove periodic noise from signal"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters."""
        self.add_parameter(
            "period_nm",
            "float",
            "Notch period in nanometers",
            100.0
        )
        self.add_parameter(
            "quality_factor",
            "int",
            "Quality factor for notch filter",
            10
        )

    def calculate(self, x, y):
        """
        Apply a notch filter to remove periodic noise from signal.

        :param x: Array of x-axis values.
        :param y: Array of y-axis values.
        :return: Filtered y-values as a list.
        """
        # Retrieve parameters
        period_nm = self.get_value("period_nm")
        quality_factor = self.get_value("quality_factor")

        if len(x) < 2 or len(y) < 2:
            return y  # Return original if too few points for filtering

        # Ensure inputs are NumPy arrays
        x = np.array(x, dtype=np.float64)
        y = np.array(y, dtype=np.float64)

        # Compute frequency (Hz) from period (nm)
        dz = (x[-1] - x[0]) / (len(x) - 1)  # Spacing between x-values
        freq = dz / (period_nm * 1e-9)  # Convert period to Hz

        # Ensure valid quality factor (Q) > 0 to prevent division issues
        Q = max(1, quality_factor)

        # Apply IIR Notch filter
        b, a = iirnotch(freq, Q)
        y_filtered = filtfilt(b, a, y)  # Zero-phase filtering

        return y_filtered.tolist()  # Convert back to list