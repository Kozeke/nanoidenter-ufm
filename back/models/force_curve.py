from dataclasses import dataclass
from typing import List, Dict, Optional
import numpy as np

@dataclass
class Segment:
    type: str  # e.g., "approach", "retract", "pause"
    deflection: np.ndarray  # Deflection in meters
    z_sensor: np.ndarray  # Z position in meters
    sampling_rate: float  # Hz
    velocity: float  # m/s
    no_points: int

@dataclass
class ForceCurve:
    file_id: str
    date: str
    instrument: str
    sample: str
    spring_constant: float  # N/m
    inv_ols: float  # m/V
    tip_geometry: str  # e.g., "pyramid", "sphere"
    tip_radius: float  # m
    segments: List[Segment]
    analysis: Optional[Dict] = None  # e.g., {"youngs_modulus": 1000, "model": "hertz"}