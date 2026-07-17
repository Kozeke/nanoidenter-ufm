# Target location in your repo: filters/filters/import_filters/fixed_baseline_filter.py
import numpy as np
from ..filter_base import FilterBase


class FixedBaselineFilter(FilterBase):
    NAME = "FixedBaseline"
    DESCRIPTION = (
        "Remove baseline drift by fitting a polynomial to a fixed pre-contact "
        "window and subtracting it from the whole curve"
    )
    DOI = ""

    def create(self):
        """Define the filter's parameters."""
        # Entered by the user in micrometers (µm); x itself is also
        # µm-native (device-raw Z, not converted to SI meters anywhere in
        # the ingest pipeline), so these are used directly in calculate()
        # with no unit conversion.
        self.add_parameter(
            "baseline_start_um",
            "float",
            "Start of the baseline window (µm)",
            0.0
        )
        self.add_parameter(
            "baseline_dz_um",
            "float",
            "Width of the baseline window (µm)",
            270.0
        )
        self.add_parameter(
            "degree",
            "int",
            "Polynomial degree for the baseline fit",
            1
        )

    def calculate(self, x, y):
        """
        Fit a polynomial to a fixed window of (x, y) and subtract it from
        the whole curve.

        :param x: List or NumPy array of x-axis values (micrometers, µm —
                   the DB-native, device-raw Z unit; not SI meters)
        :param y: List or NumPy array of y-axis values (force, micronewtons, µN)
        :return: Baseline-corrected y-values as a list
        """
        baseline_start_um = float(self.get_value("baseline_start_um"))
        baseline_dz_um = float(self.get_value("baseline_dz_um"))
        degree = int(self.get_value("degree"))

        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Reset per-call diagnostics so a slow curve never leaks into the next one
        self.last_baseline_slope = None
        # Full-length baseline curve (np.polyval evaluated across the whole x
        # domain, NOT clipped to the fit window) — exposed so callers can draw
        # it as its own overlay curve, matching the reference script's
        # `curve.baseline`, which is drawn across the entire curve rather than
        # just the region it was fit on (unlike the LinearWindowFit K line).
        self.last_baseline_values = None
        # Boolean mask (same length as x) marking which points were actually
        # used for the polynomial fit — useful if a caller wants to highlight
        # just the fit region (e.g. the reference script's baseline_mask scatter).
        self.last_window_mask = None

        if len(x) == 0 or len(y) == 0:
            return y.tolist() if y.size else []

        # Window bounds come in as µm (user-facing UI unit) and x is also
        # µm-native — no unit conversion needed, compare directly.
        start_um = baseline_start_um
        end_um = start_um + baseline_dz_um

        mask = (x >= start_um) & (x <= end_um)

        needed_points = degree + 2
        if np.count_nonzero(mask) < needed_points:
            # Not enough points in the requested window: fall back to the
            # first 20% of the curve (same fallback as the reference pipeline).
            end_idx = min(len(x), max(needed_points, int(0.2 * len(x))))
            mask = np.arange(len(x)) < end_idx

        if np.count_nonzero(mask) < 2:
            # Still nothing usable: don't fail the whole curve, just skip correction.
            return y.tolist()

        self.last_window_mask = mask

        actual_degree = min(degree, np.count_nonzero(mask) - 1)

        coeffs = np.polyfit(x[mask], y[mask], actual_degree)
        baseline = np.polyval(coeffs, x)
        self.last_baseline_values = baseline.tolist()
        corrected = y - baseline
        corrected = corrected - float(np.median(corrected[mask]))

        # Diagnostic only — see the note on why this shouldn't be relied on
        # for anything downstream (DuckDB UDFs return arrays, not scalars,
        # and this instance is shared across every row in a query).
        # Units: x is µm-native and y is µN-native, so this slope (µN/µm)
        # is numerically identical to N/m — the micro- prefixes on both
        # axes cancel, no extra SI conversion is needed here.
        self.last_baseline_slope = float(coeffs[-2]) if actual_degree >= 1 else None

        return corrected.tolist()