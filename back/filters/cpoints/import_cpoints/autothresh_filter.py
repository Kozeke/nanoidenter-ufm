from ..cpoint_base import CpointBase
import numpy as np

class AutothreshFilter(CpointBase):
    NAME = "Autothresh"
    DESCRIPTION = "Automatic threshold filter to find contact point"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters for the UI."""
        # Add zeroRange as a parameter for user control
        self.add_parameter("zeroRange", "float", "Zero range offset [nm]", 500)

    def calculate(self, x, y):
        """
        Apply autothresh filter to find contact point.
        :param x: Input array (e.g., z_values)
        :param y: Input array (e.g., force_values)
        :return: List of [z_cp, f_cp] as [[float, float]] or None if no valid point is found
        """
        zeroRange = self.get_value("zeroRange")
        # print("autothreshhg", len(x), len(y))
        if len(x) < 2 or len(y) < 2:
            return None  # Return None instead of [[]]
        # print("autorthresh")
        # Ensure inputs are numpy arrays
        x = np.asarray(x, dtype=np.float64)
        worky = np.copy(np.asarray(y, dtype=np.float64))

        # Find target index for zero range
        xtarget = np.min(x) + zeroRange * 1e-9
        jtarget = np.argmin(np.abs(x - xtarget))

        if jtarget == 0 or jtarget >= len(x):
            print(jtarget,len(x) )
            return None

        # Linear fit based on direction of x
        if x[0] < x[-1]:
            xlin, ylin = x[:jtarget], worky[:jtarget]
        else:
            xlin, ylin = x[jtarget:], worky[jtarget:]

        if len(xlin) < 2 or len(ylin) < 2:
            return None

        # Compute linear fit and subtract from y-values
        m, q = np.polyfit(xlin, ylin, 1)
        worky -= (m * x + q)

        # Compute midpoints efficiently
        differences = (worky[1:] + worky[:-1]) / 2
        midpoints = np.unique(differences)

        # Filter for positive midpoints
        positive_midpoints = midpoints[midpoints > 0]
        if len(positive_midpoints) == 0:
            return None

        # Identify crossings in y
        crossings = np.sum(
            np.logical_and(worky[1:] > positive_midpoints[:, None],
                        worky[:-1] < positive_midpoints[:, None]), axis=1)

        # Find candidates where exactly one crossing occurs
        candidates = np.where(crossings == 1)[0]
        if len(candidates) == 0:
            return None

        # Select first valid inflection point
        inflection = positive_midpoints[candidates[0]]
        jcpguess = np.argmin(np.abs(differences - inflection)) + 1

        if jcpguess >= len(x):
            return None

        # Return contact point as [z, f], ensuring non-empty
        return [[x[jcpguess], y[jcpguess]]]