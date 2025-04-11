import numpy as np
from scipy.stats import linregress
from ..cpoint_base import CpointBase


class GofFilter(CpointBase):
    NAME = "Gof"
    DESCRIPTION = "Goodness-of-fit filter to find contact point based on max R-squared"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("fitwindow", "float", "Window size for indentation fit [nm]", 200)
        self.add_parameter("maxf", "float", "Percentage of force range for threshold [%]", 50)
        self.add_parameter("minx", "float", "Percentage of x range for threshold [%]", 50)

    def calculate(self, x, y):
        """
        Returns contact point (z0, f0) based on max R-squared.
        :param x: Array of z-values
        :param y: Array of force values
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        fitwindow = self.get_value("fitwindow")
        maxf = self.get_value("maxf")
        minx = self.get_value("minx")

        # Convert to numpy arrays once
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        
        if len(x) < 2 or len(y) < 2:
            return None  # Return None if insufficient data

        # Calculate constants outside loop
        dx = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1  # Avoid division by zero
        window = int(fitwindow * 1e-9 / dx)  # Convert fitwindow from nm to index units
        
        # Compute thresholds
        fthreshold = y.min() + (y.max() - y.min()) * maxf / 100  # Force threshold based on maxf
        xthreshold = x.min() + (x.max() - x.min()) * minx / 100
        
        # Use searchsorted for thresholds
        jmin = np.searchsorted(x, xthreshold, side='left')
        jmax = np.searchsorted(y, fthreshold, side='left')
        
        # Ensure jmax is at least jmin + 1 and within bounds
        jmax = max(jmax, jmin + 1)
        jmax = min(jmax, len(x))  # Cap at array length to avoid index errors
        
        if jmax <= jmin or jmax > len(x):
            return None  # No valid range to process
        
        # Pre-allocate R2 array
        R2 = np.zeros(jmax - jmin)
        
        # Process each point
        for j in range(jmin, jmax):
            try:
                d, f = self.get_indentation(x, y, j, window)
                R2[j - jmin] = self.getFit(d, f)
            except:
                continue  # Keep 0 as default value
        
        # Find best fit
        r_best_ind = np.argmax(R2)
        if R2[r_best_ind] == 0:  # No valid fit found
            return None
        
        j_gof = jmin + r_best_ind
        
        return [[float(x[j_gof]), float(y[j_gof])]]

    def get_indentation(self, z, f, iContact, win):
        """Returns indentation and force arrays."""
        spring_constant = 1.0
        slice_range = slice(iContact, iContact + win)
        Zf = z[slice_range] - z[iContact]
        force = f[slice_range] - f[iContact]
        delta = Zf - force / spring_constant
        return delta, force

    def getFit(self, delta, force):
        """Returns R-squared value from linear regression."""
        linforce = np.cbrt(force**2)  # More efficient than (force**2)**(1/3)
        slope, intercept, r_value, _, _ = linregress(delta, linforce)
        return r_value**2