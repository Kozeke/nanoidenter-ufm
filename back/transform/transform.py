from typing import Dict
from models.force_curve import ForceCurve
import numpy as np

def transform_data(curves: Dict[str, ForceCurve]) -> Dict[str, ForceCurve]:
    """Apply transformations to ForceCurve objects (e.g., baseline correction)."""
    for curve in curves.values():
        for segment in curve.segments:
            # Example: Baseline correction
            segment.deflection -= np.mean(segment.deflection[:100])
        # Example: Add analysis results
        curve.analysis = {"youngs_modulus": 1000, "model": "hertz"}
    return curves