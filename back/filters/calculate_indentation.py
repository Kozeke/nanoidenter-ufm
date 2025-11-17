# Provides indentation calculation utilities for force curve processing workflows
from typing import List, Optional

import numpy as np


def calc_indentation(
    z_values: List[float],
    force_values: List[float],
    cp: List[List[float]],
    spring_constant: float = 1.0,
    set_zero_force: bool = True,
) -> Optional[List[List[float]]]:
    """
    Calculate indentation (Zi, Fi) based on Z, Force, and contact point (cp).

    Args:
        z_values: Array of Z values (meters)
        force_values: Array of Force values (Newtons)
        cp: Contact point as 2D array [[z_cp, f_cp], ...], using first row
        spring_constant: Cantilever spring constant [N/m]
        set_zero_force: Whether to zero the force at contact point



    Returns:
        [Zi, Fi] where:
          Zi: indentation array (meters)
          Fi: force array (Newtons, zeroed at CP if set_zero_force=True)
        or None if calculation fails.
    """
    # Basic sanity checks
    if not z_values or not force_values:
        return None
    if len(z_values) != len(force_values):
        return None
    if not cp or not isinstance(cp, list) or not cp[0] or len(cp[0]) != 2:
        return None



    # Convert to numpy arrays
    Z = np.asarray(z_values, dtype=np.float64)
    F = np.asarray(force_values, dtype=np.float64)



    # Contact point (from CP filter)
    z_cp = float(cp[0][0])
    f_cp = float(cp[0][1])



    # Ensure Z is increasing like in SoftMech; if not, reverse both arrays
    if Z[0] > Z[-1]:
        Z = Z[::-1]
        F = F[::-1]



    # Contact index: closest Z sample to z_cp
    i_contact = int(np.argmin(np.abs(Z - z_cp)))
    if i_contact >= len(Z):
        return None



    # Slice starting from contact point
    z_slice = Z[i_contact:]
    f_slice = F[i_contact:]



    if z_slice.size < 2 or f_slice.size < 2:
        return None



    # Force relative to contact point
    if set_zero_force:
        yf = f_slice - f_cp
    else:
        yf = f_slice



    # Distance from contact point
    xf = z_slice - z_cp



    # Validate spring constant
    try:
        k = float(spring_constant)
    except (TypeError, ValueError):
        k = 1.0
    if not np.isfinite(k) or k == 0.0:
        k = 1.0



    # SoftMech-like indentation definition:
    # indentation δ = (Z - Z_cp) - (F - F_cp) / k
    zi = xf - yf / k
    fi = yf



    return [zi.tolist(), fi.tolist()]
