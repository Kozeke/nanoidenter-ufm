from typing import List, Optional
import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import savgol_filter

def calc_elspectra(
    z_values: List[float],
    force_values: List[float],
    win: int,
    order: int,
    tip_geometry: str = "sphere",
    tip_radius: float = 1e-05,
    tip_angle: float = 30.0,
    interp: bool = True
) -> Optional[List[List[float]]]:
    """
    Computes the elastic modulus spectrum based on indentation data.

    Returns:
        [Ze, E] or None/False exactly as in the original implementation.
    """
    # Use asarray once to avoid copies and ensure dtype
    x = np.asarray(z_values, dtype=np.float64)
    y = np.asarray(force_values, dtype=np.float64)

    # Same early-exit as original
    if x.size < 2:
        return None

    if interp:
        # Match original: no 'fill_value' / no 'bounds_error' change, linear interpolation
        yi = interp1d(x, y)
        x_min = float(x.min())
        x_max = float(x.max())

        # Preserve original min bound logic
        min_x = x_min if x_min > 1e-9 else 1.0e-9
        max_x = x_max

        # Same 1 nm grid step and range semantics as original
        xx = np.arange(min_x, max_x, 1.0e-9, dtype=np.float64)
        # If range collapses, behave like original savgol path (will fail length check later)
        if xx.size == 0:
            yy = np.empty(0, dtype=np.float64)
            ddt = 1.0e-9
        else:
            yy = yi(xx)
            ddt = 1.0e-9
    else:
        # Original skipping of the first point
        xx = x[1:]
        yy = y[1:]
        # Same finite-difference spacing definition
        ddt = (x[-1] - x[1]) / (x.size - 2)

    # --- Contact radius / geometry (same formulas as original) ---
    geom = tip_geometry
    if geom == "sphere":
        aradius = np.sqrt(xx * tip_radius)
    elif geom == "cylinder":
        aradius = tip_radius
    elif geom == "cone":
        ang_rad = np.radians(tip_angle)
        # 2 * xx / tan(angle) / pi
        aradius = (2.0 * xx) / (np.tan(ang_rad) * np.pi)
    elif geom == "pyramid":  # Bilodeau formula
        ang_rad = np.radians(tip_angle)
        # 0.709 * xx * tan(angle)
        aradius = 0.709 * xx * np.tan(ang_rad)
    else:
        return False  # invalid geometry (kept)

    coeff = 3.0 / (8.0 * aradius)

    # Ensure window is odd (same behavior)
    if win % 2 == 0:
        win += 1

    # Same length check as original
    if yy.size <= win:
        return False

    # Derivative via Savitzky–Golay (identical call signature)
    deriv = savgol_filter(yy, win, order, delta=ddt, deriv=1)
    Ey = coeff * deriv

    # Keep original trimming rule (not the usual win//2)
    dwin = int(win - 1)
    if dwin == 0:
        Ex = xx
        Ey = Ey
    else:
        Ex = xx[dwin:-dwin]
        Ey = Ey[dwin:-dwin]

    return [Ex.tolist(), Ey.tolist()]
