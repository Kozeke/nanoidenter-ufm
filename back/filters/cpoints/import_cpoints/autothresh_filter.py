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

    def calculate(self, x, y, metadata=None):
        """
        Apply autothresh filter to find contact point.
        Returns [[z_cp, f_cp]] or None.
        """
        zeroRange = self.get_value("zeroRange")  # same name, same units (nm)

        if len(x) < 2 or len(y) < 2:
            return None

        # --- cast & copy
        x = np.asarray(x, dtype=np.float64)
        worky = np.copy(np.asarray(y, dtype=np.float64))

        # --- pick zero-range target (x is in meters; zeroRange is nm)
        xtarget = np.min(x) + zeroRange * 1e-9
        jtarget = np.argmin(np.abs(x - xtarget))
        if jtarget == 0 or jtarget >= len(x):
            return None

        # --- baseline: linear fit on the pre-contact side (depends on x direction)
        if x[0] < x[-1]:
            xlin, ylin = x[:jtarget], worky[:jtarget]
        else:
            xlin, ylin = x[jtarget:], worky[jtarget:]

        if len(xlin) < 2:
            return None

        m, q = np.polyfit(xlin, ylin, 1)
        worky -= (m * x + q)

        # --- midpoints of adjacent samples (original logic)
        differences = (worky[1:] + worky[:-1]) / 2.0
        # use set() then sort() to mirror the original behavior
        midpoints = np.array(list(set(differences)), dtype=np.float64)
        midpoints.sort()

        # only positive midpoints
        positive_midpoints = midpoints[midpoints > 0.0]
        if positive_midpoints.size == 0:
            return None

        # --- scan thresholds in order; pick the FIRST with exactly ONE crossing
        #     crossing definition: y[k] < th and y[k+1] > th
        inflection = None
        for th in positive_midpoints:
            cross = np.logical_and(worky[:-1] < th, worky[1:] > th)
            if np.count_nonzero(cross) == 1:
                inflection = th
                break

        if inflection is None:
            return None

        # closest midpoint index (+1 to map midpoint to the right sample index)
        jcpguess = int(np.argmin(np.abs(differences - inflection)) + 1)
        if jcpguess >= len(x):
            return None

        # return z_cp, f_cp from the ORIGINAL (un-detrended) signal
        return [[float(x[jcpguess]), float(y[jcpguess])]]
