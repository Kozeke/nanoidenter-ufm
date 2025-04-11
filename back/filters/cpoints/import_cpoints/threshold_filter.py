import numpy as np
from ..cpoint_base import CpointBase

class ThresholdFilter(CpointBase):
    NAME = "Threshold"
    DESCRIPTION = "Threshold-based filter to find contact point"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("starting_threshold", "float", "Initial threshold [nN]", 2)
        self.add_parameter("min_x", "float", "Minimum x range [%]", 1)
        self.add_parameter("max_x", "float", "Maximum x range [%]", 60)
        self.add_parameter("force_offset", "float", "Force offset [pN]", 0)


    def calculate(self, x, y):
        """
        Returns contact point based on threshold and offset conditions.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        # Retrieve parameters
        starting_threshold = self.get_value("starting_threshold")
        min_x = self.get_value("min_x")
        max_x = self.get_value("max_x")
        force_offset = self.get_value("force_offset")

        # Convert to numpy arrays once
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        
        if len(x) < 2 or len(y) < 2:
            return None  # Return None if insufficient data

        # Pre-calculate constants
        yth = starting_threshold * 1e-9  # Convert nN to N
        offset = force_offset * 1e-12    # Convert pN to N
        x_min, x_max = x.min(), x.max()
        x_range = x_max - x_min
        
        # Early validation
        y_min = y.min()
        if yth < y_min or y_min + offset >= yth:
            return None  # Changed from False to None for consistency
        
        # Find threshold and range points
        jstart = np.argmin(np.abs(y - yth))
        imin = np.argmin(np.abs(x - (x_min + x_range * min_x / 100)))
        imax = np.argmin(np.abs(x - (x_min + x_range * max_x / 100)))
        
        # Calculate baseline and find contact point
        baseline = np.mean(y[imin:imax])  # mean is slightly faster than average
        threshold = baseline + offset
        
        # Vectorized search for contact point
        y_slice = y[:jstart+1][::-1]  # Reverse slice from start to beginning
        mask = (y_slice > threshold) & (np.roll(y_slice, 1) <= threshold)
        jcp = jstart - np.argmax(mask) if mask.any() else 0
        
        if jcp >= len(x):  # Ensure jcp is within bounds
            return None

        return [[float(x[jcp]), float(y[jcp])]]  # Ensure float output as 2D list