"""Savitzky-Golay smoothing import filter.

Architectural role: this module defines an import-stage filter that smooths a
force/indentation curve (or any x/y signal) using SciPy's Savitzky-Golay
algorithm. The Savitzky-Golay method fits a low-degree polynomial to a sliding
window of points, which reduces noise while preserving the shape of features
(peaks/steps) better than a plain moving average. It is registered alongside the
other import filters and applied through the shared FilterBase pipeline.
"""

import logging

import numpy as np
from scipy.signal import savgol_filter
from ..filter_base import FilterBase

# Module-level logger; inherits app-wide logging config (see back/main.py).
logger = logging.getLogger(__name__)

# Filter implementation exposed to the pipeline; inherits parameter handling and
# registration behavior from FilterBase.
class SavgolSmoothFilter(FilterBase):
    # Unique identifier used by the pipeline/UI to select this filter.
    NAME = "SavgolSmooth"
    # Human-readable summary shown in the UI.
    DESCRIPTION = "Applies the Savitzky-Golay filter to smooth data while preserving steps"
    # Reference DOI (empty: no associated publication).
    DOI = ""
    
    def create(self):
        """Define the filter's parameters."""
        # Physical width of the smoothing window, entered by the user in
        # micrometers (µm); x itself is also µm-native (device-raw Z, not
        # converted to SI meters anywhere in the ingest pipeline), so this
        # is converted directly to a sample count at runtime based on x
        # spacing with no unit conversion.
        self.add_parameter(
            "window_size_um",
            "float",
            "Window size for filtering (in µm)",
            25.0
        )
        # Degree of the polynomial fitted inside each window; higher orders track
        # sharper features but smooth less.
        self.add_parameter(
            "polyorder",
            "int",
            "Polynomial order for smoothing",
            2
        )

    def calculate(self, x, y):
        """
        Applies the Savitzky-Golay filter to smooth data while preserving steps.

        :param x: List or NumPy array of x-axis values (micrometers, µm —
                  the DB-native, device-raw Z unit; not SI meters)
        :param y: List or NumPy array of y-axis values
        :return: Smoothed y-values as a list
        """
        # Read the user-configured window width (µm); x is also µm-native
        # (see calculate()'s docstring), so no unit conversion is needed below.
        window_size_um = float(self.get_value("window_size_um"))
        # Read the polynomial order used for the local fit.
        polyorder = int(self.get_value("polyorder"))
        # Log the raw parameters as received from the UI/config.
        # logger.info("[SavgolSmooth] params: window_size_um=%s, polyorder=%s", window_size_um, polyorder)
        # Work in float64 NumPy arrays so SciPy gets contiguous numeric data.
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        # Log input shape so we can confirm data actually reached the filter.
        # logger.debug("[SavgolSmooth] input lengths: x=%d, y=%d", len(x), len(y))
        # Log one sample point (first element) from this curve to inspect actual values/units.
        # if len(x) > 0 and len(y) > 0:
        #     logger.info("[SavgolSmooth] sample point: x[0]=%.6e, y[0]=%.6e", x[0], y[0])

        # Nothing to smooth if either axis is empty; return input unchanged.
        if len(x) == 0 or len(y) == 0:
            # Warn because an empty axis usually signals an upstream problem.
            # logger.warning("[SavgolSmooth] empty input (x=%d, y=%d); returning original", len(x), len(y))
            return y  # Return original if empty

        # Average spacing between consecutive x samples (micrometers, µm —
        # the DB-native, device-raw Z unit). Guards against division by
        # zero when there is only a single point.
        xstep = (max(x) - min(x)) / (len(x) - 1) if len(x) > 1 else 1.0  # Avoid division by zero
        # Log computed spacing to sanity-check the µm->sample conversion.
        # logger.debug("[SavgolSmooth] xstep=%.6e um", xstep)

        # Translate the µm window into a whole number of samples: (window in
        # µm) / (µm per sample) — both already in µm, so no unit conversion.
        win = max(1, int(window_size_um / xstep))
        # Log the raw sample count before the odd-length adjustment.
        # logger.debug("[SavgolSmooth] window in samples (raw)=%d", win)

        # Savitzky-Golay requires an odd window length (needs a symmetric center point).
        if win % 2 == 0:
            win += 1
            # Log when we bump the window to keep it odd.
            # logger.debug("[SavgolSmooth] window bumped to odd length=%d", win)

        # scipy.signal.savgol_filter requires window_length <= len(x); a
        # window_size_um much larger than the curve's actual span (or a
        # curve with very fine/short sampling) can otherwise push `win`
        # past len(x), which raises ValueError inside scipy. That error was
        # previously swallowed by the UDF wrapper (filter_registry.py),
        # silently turning the whole curve into NULL/empty on the frontend
        # with no visible error — clamp here instead so the filter degrades
        # gracefully to the largest odd window that actually fits the curve.
        max_odd_window = len(x) if len(x) % 2 == 1 else len(x) - 1
        win = max(1, min(win, max_odd_window))

        # polyorder must be strictly less than the window length, otherwise SciPy errors.
        adjusted_polyorder = min(polyorder, win - 1)
        # Log if we had to clamp polyorder to satisfy the window constraint.
        # if adjusted_polyorder != polyorder:
        #     logger.warning(
        #         "[SavgolSmooth] polyorder clamped from %s to %s (must be < window=%d)",
        #         polyorder, adjusted_polyorder, win,
        #     )
        polyorder = adjusted_polyorder

        # Log the final effective parameters used for the actual smoothing call.
        # logger.info("[SavgolSmooth] applying savgol_filter with window=%d, polyorder=%d", win, polyorder)
        # Run the actual smoothing: fit `polyorder` polynomials over each `win`-sample window.
        y_smooth = savgol_filter(y, win, polyorder)
        # Log a quick before/after range so the smoothing effect is visible in logs.
        # logger.debug(
        #     "[SavgolSmooth] y range before=[%.6e, %.6e], after=[%.6e, %.6e]",
        #     float(np.min(y)), float(np.max(y)),
        #     float(np.min(y_smooth)), float(np.max(y_smooth)),
        # )

        # Return a plain Python list so the result is JSON/pipeline friendly.
        return y_smooth.tolist()  # Return as a list
