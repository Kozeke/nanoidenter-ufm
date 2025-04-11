from typing import List, Optional, Dict
import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import savgol_filter

from typing import List, Optional
import numpy as np
from scipy.interpolate import interp1d
from scipy.signal import savgol_filter

def calc_elspectra(
    z_values: List[float],
    force_values: List[float],
    win: int,
    order: int,
    tip_geometry: str = 'sphere',
    tip_radius: float = 1e-05,
    tip_angle: float = 30.0,
    interp: bool = True
) -> Optional[List[List[float]]]:
    """
    Computes the elastic modulus spectrum based on indentation data.

    Parameters:
    - z_values: List of indentation depths.
    - force_values: List of corresponding force values.
    - win: Window size for Savitzky-Golay filter (must be odd).
    - order: Polynomial order for the filter.
    - tip_geometry: Geometry of the tip ('sphere', 'cylinder', 'cone', 'pyramid').
    - tip_radius: Radius of the tip (for spherical or cylindrical tips).
    - tip_angle: Angle of the tip in degrees (for cone or pyramid).
    - interp: Whether to interpolate force values.

    Returns:
    - A list containing two lists: [Ze, E], where Ze is the array of adjusted indentation depths and E is the elastic modulus.
    - Returns None if there are insufficient data points (for compatibility, adjusted to match original).
    """

    print("calc_elspectra")
    print("Tip Radius:", tip_radius)
    print(win, order)
    x = np.array(z_values)
    y = np.array(force_values)

    print("Input lengths:", len(x), len(y))

    if len(x) < 2:
        return None  # Not enough data to process

    if interp:
        yi = interp1d(x, y)  # Match original: no extrapolate
        max_x = np.max(x)
        min_x = 1e-9
        if np.min(x) > 1e-9:
            min_x = np.min(x)
        xx = np.arange(min_x, max_x, 1.0e-9)
        yy = yi(xx)
        ddt = 1.0e-9
    else:
        xx = x[1:]
        yy = y[1:]
        ddt = (x[-1] - x[1]) / (len(x) - 2)

    # Compute contact radius based on tip geometry
    if tip_geometry == 'sphere':
        aradius = np.sqrt(xx * tip_radius)
    elif tip_geometry == 'cylinder':
        aradius = tip_radius
    elif tip_geometry == 'cone':
        aradius = 2 * xx / np.tan(np.radians(tip_angle)) / np.pi
    elif tip_geometry == 'pyramid':  # Bilodeau formula
        aradius = 0.709 * xx * np.tan(np.radians(tip_angle))
    else:
        return False  # Match original: False for invalid geometry

    coeff = 3 / (8 * aradius)  # Match original spacing

    # Ensure window size is odd
    if win % 2 == 0:
        win += 1

    if len(yy) <= win:
        return False  # Match original: False if too short

    # Compute derivative
    deriv = savgol_filter(yy, win, order, delta=ddt, deriv=1)
    Ey = coeff * deriv

    dwin = int(win - 1)  # Fix: Match original trimming (60 for win=61)
    Ex = xx[dwin:-dwin]  # Adjusted depth values
    Ey = Ey[dwin:-dwin]  # Elastic modulus values

    print("Processed lengths - Ey:", len(Ey), "Ex:", len(Ex))

    return [Ex.tolist(), Ey.tolist()]