import numpy as np
import logging
from ..cpoint_base import CpointBase

# Provides module-level logger for ROV filter debug traces.
logger = logging.getLogger(__name__)

class RovFilter(CpointBase):
    NAME = "Rov"
    DESCRIPTION = "Region of validity filter to find contact point based on maximum variance ratio"
    DOI = ""
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("safe_threshold", "float", "Force threshold [nN]", 10)
        self.add_parameter("x_range", "float", "X range [nm]", 1000)
        self.add_parameter("windowRov", "float", "Window size for variance ratio [nm]", 200)

    def calculate(self, x, y, metadata=None):
        """
        Returns contact point based on maximum variance ratio.
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :param metadata: Dictionary containing metadata values (spring_constant, tip_radius, tip_geometry)
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        safe_threshold = self.get_value("safe_threshold")
        x_range = self.get_value("x_range")
        windowRov = self.get_value("windowRov")
        logger.debug(
            "ROV calculate started: safe_threshold=%s nN, x_range=%s nm, windowRov=%s nm, points=%s",
            safe_threshold,
            x_range,
            windowRov,
            len(x) if x is not None else 0,
        )
        print(
            f"[RovFilter] safe_threshold={safe_threshold} nN, "
            f"x_range={x_range} nm, windowRov={windowRov} nm, points={len(x) if x is not None else 0}"
        )

        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        out = self.getWeight(x, y, safe_threshold, x_range, windowRov)
        if not out:
            logger.debug("ROV getWeight returned no valid output; skipping contact point.")
            print("[RovFilter] no valid contact point candidate")
            return None  # Changed from False to None for consistency
        zz_x, rov = out
        rov_best_ind = np.argmax(rov)
        j_rov = np.argmin(np.abs(x - zz_x[rov_best_ind]))  # Avoid squaring
        logger.debug(
            "ROV contact point selected: index=%s, z=%s, force=%s, max_rov=%s",
            j_rov,
            float(x[j_rov]),
            float(y[j_rov]),
            float(rov[rov_best_ind]) if len(rov) else None,
        )
        print(
            f"[RovFilter] selected contact point: index={int(j_rov)}, "
            f"z={float(x[j_rov]):.6e}, force={float(y[j_rov]):.6e}"
        )
        return [[float(x[j_rov]), float(y[j_rov])]]  # Ensure float output

    def getRange(self, x, y, safe_threshold, x_range):
        """Returns min and max indices based on thresholds."""
        try:
            f_threshold = safe_threshold * 1e-9  # Convert nN to N
            x_range_nm = x_range * 1e-9  # Convert nm to m
            jmax = np.argmin(np.abs(y - f_threshold))
            jmin = np.argmin(np.abs(x - (x[jmax] - x_range_nm)))
            logger.debug(
                "ROV range computed: f_threshold=%s N, x_range=%s m, jmin=%s, jmax=%s",
                f_threshold,
                x_range_nm,
                jmin,
                jmax,
            )
            return jmin, jmax
        except ValueError as exc:
            logger.debug("ROV getRange failed with ValueError: %s", exc)
            return False

    def getWeight(self, x, y, safe_threshold, x_range, windowRov):
        """Returns x values and variance ratios for contact point detection."""
        out = self.getRange(x, y, safe_threshold, x_range)
        if not out:
            logger.debug("ROV getWeight aborted: getRange returned invalid bounds.")
            return False
        jmin, jmax = out
        
        # Calculate window size
        winr = windowRov * 1e-9  # Convert nm to m
        xstep = (x.max() - x.min()) / (len(x) - 1) if len(x) > 1 else 1
        win = int(winr / xstep)
        logger.debug("ROV window computed: winr=%s m, xstep=%s, win=%s", winr, xstep, win)
        
        # Adjust bounds
        if len(y) - jmax < win:
            jmax = len(y) - 1 - win
        if jmin < win:
            jmin = win
        if jmax <= jmin:
            logger.debug("ROV bounds invalid after adjustment: jmin=%s, jmax=%s, win=%s", jmin, jmax, win)
            return False
        
        # Pre-allocate array and use rolling window calculation
        n = jmax - jmin
        rov = np.zeros(n)
        
        # Vectorized variance calculation
        past_windows = np.lib.stride_tricks.sliding_window_view(y[jmin-win:jmax-1], win)
        future_windows = np.lib.stride_tricks.sliding_window_view(y[jmin+1:jmax+win], win)
        
        # Calculate variances and ratios
        past_vars = np.var(past_windows, axis=1)
        future_vars = np.var(future_windows, axis=1)
        np.divide(future_vars, past_vars, out=rov, where=past_vars != 0)
        logger.debug("ROV variance ratio computed: points=%s, nonzero_denominator=%s", n, int(np.count_nonzero(past_vars)))
        
        return x[jmin:jmax], rov