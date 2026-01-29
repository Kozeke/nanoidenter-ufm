import numpy as np
import math
from typing import List, Optional, Dict

def format_stat(values: List[float]) -> Optional[Dict]:
    """
    Format mean ± std using the same logic as desktop dataformat().
    Returns raw + formatted values.
    """
    if not values:
        return None

    arr = np.asarray(values, dtype=float)

    mean = float(np.mean(arr))
    std  = float(np.std(arr))

    if std <= 0 or not math.isfinite(std):
        return {
            "mean": mean,
            "std": std,
            "formatted": f"{mean:.3g}"
        }

    if std > mean:
        formatted = f"{mean:.4g} ± {std:.4g}"
    else:
        p = int(math.floor(math.log10(std)))
        if abs(p) < 2:
            er  = int(std / 10**p) * 10**p
            val = int(mean / 10**p) * 10**p
            formatted = f"{val} ± {er}"
        else:
            er  = int(std / 10**p)
            val = int(mean / 10**p)
            formatted = f"({val} ± {er}) × 10^{p}"

    return {
        "mean": mean,
        "std": std,
        "formatted": formatted
    }


import numpy as np

def is_valid_param_vector(p):
    return (
        isinstance(p, (list, tuple)) and
        len(p) > 0 and
        all(np.isfinite(x) for x in p)
    )
