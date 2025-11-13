# Provides indentation calculation utilities for force curve processing workflows
from typing import List, Optional
import numpy as np

def calc_indentation(z_values: List[float], force_values: List[float], cp: List[List[float]], spring_constant: float = 1.0, set_zero_force: bool = True) -> Optional[List[List[float]]]:
    """
    Calculate indentation (Zi, Fi) based on Z, Force, and contact point (cp).
    
    Args:
        z_values: Array of Z values
        force_values: Array of Force values
        cp: Contact point as 2D array [[z_cp, f_cp], ...], using first row
        spring_constant: Spring constant for indentation calculation (default 1.0)
        set_zero_force: Whether to zero the force at contact point
    
    Returns:
        List of [Zi, Fi] arrays or None if calculation fails
    """
    if not z_values or not force_values or len(z_values) != len(force_values):
        return None
    
    # Check if cp is a valid 2D array with at least one row of length 2
    if not cp or not isinstance(cp, list) or not cp[0] or len(cp[0]) != 2:
        return None
    
    # Extract z_cp and f_cp from the first row of the 2D cp array
    z_cp, f_cp = cp[0][0], cp[0][1]
    
    # Find the index of the contact point in z_values
    i_contact = np.argmin(np.abs(np.array(z_values) - z_cp))
    if i_contact >= len(z_values):
        return None
    
    Z = np.asarray(z_values, dtype=float)
    F = np.asarray(force_values, dtype=float)
    z_cp, f_cp = float(cp[0][0]), float(cp[0][1])

    # sanity
    is_increasing = np.all(np.diff(Z) >= 0)
    i_contact = int(np.argmin(np.abs(Z - z_cp)))
    tail = len(Z) - i_contact

    # print(
    #     f"[indent dbg] N={len(Z)} inc={is_increasing} "
    #     f"z_range=({Z[0]:.3e},{Z[-1]:.3e}) z_cp={z_cp:.3e} "
    #     f"i_contact={i_contact} tail={tail} "
    #     f"min|z-z_cp|={(np.abs(Z - z_cp)).min():.3e}"
    # )
    
    # Slice arrays from contact point onward
    z_array = np.array(z_values[i_contact:], dtype=np.float64)
    f_array = np.array(force_values[i_contact:], dtype=np.float64)
    
    # Calculate Yf (force adjusted for contact point)
    if set_zero_force:
        yf = f_array - f_cp
    else:
        yf = f_array
    
    # Calculate Xf (Z adjusted for contact point)
    xf = z_array - z_cp
    
    # Prevent crash when upstream provides invalid spring constant data
    try:
        # Stores validated spring constant to keep division safe and stable
        k = float(spring_constant)
    except (TypeError, ValueError):
        k = 1.0
    if not np.isfinite(k) or k == 0.0:
        k = 1.0

    # Calculate indentation (Zi) and force (Fi)
    zi = xf - yf / k
    fi = yf
    # print("zi", len(zi))
    # print("fi", len(fi))
    # Return as a list of [Zi, Fi] arrays
    return [zi.tolist(), fi.tolist()]