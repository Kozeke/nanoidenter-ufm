# filters/median_filter.py
from filter_base import FilterBase
from scipy.signal import medfilt
import numpy as np

class MedianFilter(FilterBase):
    NAME = "Median"
    DESCRIPTION = "Applies a median filter to smooth force values"
    DOI = ""

    def create(self):
        # Define a single parameter for window size
        self.add_parameter("window_size", "int", "Window size for median filter (odd)", 5)

    def calculate(self, x, y):
        force_values = x  # Use x as the data to filter, ignore y
        window_size = self.get_value("window_size")

        if not isinstance(force_values, list) or len(force_values) == 0:
            return force_values  # Return original if invalid

        # Ensure window size is odd and at least 3
        window_size = max(3, window_size)
        window_size = window_size + 1 if window_size % 2 == 0 else window_size

        # Apply median filter
        filtered = medfilt(np.array(force_values), window_size)
        return filtered.tolist()