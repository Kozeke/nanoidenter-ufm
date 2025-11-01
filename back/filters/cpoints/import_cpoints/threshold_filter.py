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


    def calculate(self, x, y, metadata=None):
        """
        Returns contact point based on threshold and offset conditions.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :param metadata: Dictionary containing metadata values (spring_constant, tip_radius, tip_geometry)
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        starting_threshold = self.get_value("starting_threshold")
        min_x = self.get_value("min_x")
        max_x = self.get_value("max_x")
        force_offset = self.get_value("force_offset")

        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        if len(x) < 2 or len(y) < 2:
            return None

        yth = float(starting_threshold) * 1e-9  # nN → N
        offset = float(force_offset) * 1e-12    # pN → N

        # keep original early guards (same semantics as the reference)
        if yth < np.min(y):
            return None
        if np.min(y) + offset >= yth:
            return None

        # index closest to the starting threshold (like the reference)
        jstart = int(np.argmin((y - yth) ** 2))

        # baseline window from min_x% to max_x% of x-range
        xmin = x.min() + (x.max() - x.min()) * (min_x / 100.0)
        xmax = x.min() + (x.max() - x.min()) * (max_x / 100.0)
        imin = int(np.argmin((x - xmin) ** 2))
        imax = int(np.argmin((x - xmax) ** 2))
        if imax <= imin:
            imin, imax = min(imin, imax), max(imin, imax)
        if imax - imin < 2:
            # fallback: small baseline window around jstart if the % window collapses
            imin = max(0, jstart - 10)
            imax = min(len(y) - 1, jstart + 10)

        baseline = float(np.mean(y[imin:imax]))
        thr = baseline + offset

        # find the last upward crossing at/left of jstart WITHOUT wraparound
        yy = y[: jstart + 1]
        if len(yy) >= 2:
            up = (yy[1:] > thr) & (yy[:-1] <= thr)
            if np.any(up):
                jcp = int(np.max(np.where(up)[0])) + 1
            else:
                # fallback: pick point closest to threshold at/left of jstart
                jcp = int(np.argmin(np.abs(yy - thr)))
        else:
            jcp = 0

        # avoid returning the very last index (which causes tail=1 downstream)
        if jcp >= len(x) - 1:
            jcp = max(len(x) - 2, 0)

        return [[float(x[jcp]), float(y[jcp])]]