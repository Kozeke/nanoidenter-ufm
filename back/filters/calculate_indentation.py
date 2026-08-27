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

    # Controls whether detailed indentation unit/range debug logs are printed.
    debug_units_logging_enabled = True

    # Determine the overall sweep direction robustly.
    # np.all(np.diff(Z) >= 0) is too strict: a single noisy step (e.g. z[i+1] = z[i] - 1e-15)
    # flips the branch and negates every zi even though the array is overwhelmingly ascending.
    # Strategy: use the net endpoint displacement as the primary signal, confirmed by a
    # majority vote on the diffs so genuinely descending data still triggers the right branch.
    _dz   = np.diff(Z)
    _net  = Z[-1] - Z[0]                          # positive = ascending overall
    _frac = np.sum(_dz >= 0) / max(len(_dz), 1)   # fraction of non-decreasing steps
    is_increasing = (_net >= 0) and (_frac >= 0.5)
    i_contact = int(np.argmin(np.abs(Z - z_cp)))
    tail = len(Z) - i_contact
    if debug_units_logging_enabled:
        print(
            "DEBUG INDENTATION INPUT UNITS: "
            f"spring_constant={spring_constant:.6e} N/m, "
            f"set_zero_force={set_zero_force}, points={len(Z)}"
        )
        print(
            f"  z_values range: [{Z.min():.6e}, {Z.max():.6e}] m, "
            f"is_increasing={is_increasing}"
        )
        print(f"  force_values range: [{F.min():.6e}, {F.max():.6e}] N")
        print(
            f"  contact point: z_cp={z_cp:.6e} m, f_cp={f_cp:.6e} N, "
            f"i_contact={i_contact}, tail={tail}"
        )

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

    # Calculate indentation (Zi) and force (Fi).
    # For ascending z (negative z convention): indentation = (z - z_cp) - yf/k
    # For descending z (positive z convention): after contact z < z_cp so xf is
    # negative; flip its sign so indentation is always positive.
    if is_increasing:
        zi = xf - yf / k
        if debug_units_logging_enabled:
            print("calc_indentation branch: ascending-z formula zi = (z-z_cp) - yf/k")
    else:
        zi = -xf - yf / k
        if debug_units_logging_enabled:
            print("calc_indentation branch: descending-z formula zi = -(z-z_cp) - yf/k")
    fi = yf
    if debug_units_logging_enabled:
        print("DEBUG INDENTATION OUTPUT UNITS:")
        print(f"  validated spring constant (k): {k:.6e} N/m")
        if zi.size > 0:
            print(f"  zi range: [{np.min(zi):.6e}, {np.max(zi):.6e}] m")
        else:
            print("  zi range: EMPTY ARRAY")
        if fi.size > 0:
            print(f"  fi range: [{np.min(fi):.6e}, {np.max(fi):.6e}] N")
        else:
            print("  fi range: EMPTY ARRAY")
        print(f"  points: {len(zi)}")
    # print("zi", len(zi))
    # print("fi", len(fi))
    # Return as a list of [Zi, Fi] arrays
    return [zi.tolist(), fi.tolist()]