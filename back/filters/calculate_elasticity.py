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

    # DEBUG: Check force values units
    print(f"DEBUG FORCE VALUES UNITS:", tip_radius, tip_geometry, tip_angle)
    print(f"  force_values range: [{y.min():.6e}, {y.max():.6e}]")
    print(f"  force_values mean: {y.mean():.6e}")
    print(f"  force_values std: {y.std():.6e}")
    print(f"  z_values range: [{x.min():.6e}, {x.max():.6e}] m")
    print(f"  Expected: Force should be in Newtons (N), typical range: 1e-9 to 1e-6 N")
    print(f"  If values are ~1e-3 to 1e0, they might be in milliNewtons (mN)")
    print(f"  If values are ~1e-6 to 1e-3, they might be in microNewtons (uN)")

    # Early exit check from nano.py - check on length of indentation
    if x.size < 2:
        return None

    if interp:
        # Match original: no 'fill_value' / no 'bounds_error' change, linear interpolation
        yi = interp1d(x, y)
        x_min = float(x.min())
        x_max = float(x.max())

        # Preserve original min bound logic (same as nano.py)
        min_x = x_min if x_min > 1e-9 else 1.0e-9
        max_x = x_max

        # Same 1 nm grid step and range semantics as original
        xx = np.arange(min_x, max_x, 1.0e-9, dtype=np.float64)
        # If range collapses to empty array, return early
        if xx.size == 0:
            print(f"  WARNING: Empty array after interpolation (min_x={min_x:.6e}, max_x={max_x:.6e})")
            return None
        
        yy = yi(xx)
        ddt = 1.0e-9
    else:
        # Original skipping of the first point
        xx = x[1:]
        yy = y[1:]
        # Same finite-difference spacing definition
        ddt = (x[-1] - x[1]) / (x.size - 2)

    # Additional safety check: ensure arrays are not empty after processing
    if xx.size == 0 or yy.size == 0:
        print(f"  WARNING: Empty arrays after processing (xx.size={xx.size}, yy.size={yy.size})")
        return None

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

    # Same length check as original (from nano.py line 189)
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

    # DEBUG: Print unit information before returning (with safety checks like nano.py)
    print(f"DEBUG ELASTICITY UNITS:")
    print(f"  tip_radius: {tip_radius:.6e} m")
    if aradius.size > 0:
        print(f"  aradius range: [{aradius.min():.6e}, {aradius.max():.6e}] m")
        print(f"  coeff range: [{coeff.min():.6e}, {coeff.max():.6e}]")
    else:
        print(f"  aradius: empty array (no data)")
    if deriv.size > 0:
        print(f"  deriv range: [{deriv.min():.6e}, {deriv.max():.6e}]")
    if Ey.size > 0:
        print(f"  Ey range: [{Ey.min():.6e}, {Ey.max():.6e}] Pa")
    else:
        print(f"  Ey range: EMPTY ARRAY (no data after trimming)")
    print(f"  ddt: {ddt:.6e} m")

    # Final safety check before returning
    if Ex.size == 0 or Ey.size == 0:
        print(f"  WARNING: Empty result arrays (Ex.size={Ex.size}, Ey.size={Ey.size})")
        return None

    return [Ex.tolist(), Ey.tolist()]