from typing import Dict
from models.force_curve import ForceCurve

def transform_data(curves: Dict[str, ForceCurve]) -> Dict[str, ForceCurve]:
    """Apply transformations to ForceCurve objects (e.g., baseline correction)."""
    for curve in curves.values():
        for segment in curve.segments:
            # Baseline correction disabled so imported force_values match raw HDF5 Force data.
            # segment.deflection -= np.mean(segment.deflection[:100])
        # Example: Add analysis results
        curve.analysis = {"youngs_modulus": 1000, "model": "hertz"}
    return curves