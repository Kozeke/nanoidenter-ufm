# Target location in your repo: filters/filters/import_filters/linear_window_fit_filter.py
import numpy as np
from ..filter_base import FilterBase


class LinearWindowFitFilter(FilterBase):
    NAME = "LinearWindowFit"
    DESCRIPTION = (
        "Fit a straight line to y within a fixed x-window [t1_nm, t2_nm] and "
        "return that line evaluated across the full curve. Since the output "
        "is already a straight line, the slope (stiffness K) can be read back "
        "from any two points of the returned array — no contact-point "
        "detection or fmodel step required."
    )
    DOI = ""

    def create(self):
        """Define the filter's parameters."""
        self.add_parameter(
            "t1_nm",
            "float",
            "Start of the linear fit window (nm)",
            317000.0
        )
        self.add_parameter(
            "t2_nm",
            "float",
            "End of the linear fit window (nm)",
            535000.0
        )

    def calculate(self, x, y):
        """
        Fit a line to (x, y) restricted to [t1_nm, t2_nm] and return that
        line evaluated across the entire x array.

        :param x: List or NumPy array of x-axis values (meters)
        :param y: List or NumPy array of y-axis values (baseline-corrected force)
        :return: Fitted line values (same length as x) as a list
        """
        t1_nm = float(self.get_value("t1_nm"))
        t2_nm = float(self.get_value("t2_nm"))

        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Diagnostics only — see note in calculate()'s docstring / the plan
        # about why these shouldn't be trusted across a batched DB query.
        self.last_slope_per_meter = None
        self.last_intercept = None
        self.last_fit_point_count = 0
        # Boolean mask (same length as x) marking which points fall inside
        # [t1_nm, t2_nm]. Exposed so callers can slice the overlay curve down
        # to just this window instead of drawing the fitted line across the
        # whole curve — matching the original script, which never extrapolates
        # the fit line outside the region it was actually fit on.
        self.last_window_mask = None

        if len(x) == 0 or len(y) == 0:
            return y.tolist() if y.size else []

        low_m, high_m = sorted((t1_nm * 1e-9, t2_nm * 1e-9))
        mask = (x >= low_m) & (x <= high_m)
        self.last_fit_point_count = int(np.count_nonzero(mask))
        self.last_window_mask = mask

        if self.last_fit_point_count < 2:
            # Not enough points in the window to fit: pass the curve through unchanged
            return y.tolist()

        slope, intercept = np.polyfit(x[mask], y[mask], 1)
        self.last_slope_per_meter = float(slope)
        self.last_intercept = float(intercept)

        fitted_line = slope * x + intercept
        return fitted_line.tolist()