from igor import binarywave
from typing import Dict
import numpy as np
from .base import Opener
from models.force_curve import ForceCurve, Segment
import logging

logger = logging.getLogger(__name__)

class IBWOpener(Opener):
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        curves = {}
        try:
            # Load IBW file
            ibw_data = binarywave.load(file_path)
            wave = ibw_data["wave"]
            data = wave["wData"]  # Numpy array of force/z data
            notes = wave["note"].decode("utf-8").split("\r")  # Metadata in notes

            # Parse metadata from notes
            metadata = self._extract_ibw_metadata(notes, file_path)
            if not self.validate_metadata(metadata):
                logger.warning(f"Invalid metadata for {file_path}")
                return {}

            # Assume single curve per IBW file (common for Asylum Research)
            curve_id = os.path.basename(file_path)
            force_data = data[:, 0]  # First column typically deflection
            z_data = data[:, 1]  # Second column typically z-sensor
            min_length = min(len(force_data), len(z_data))

            segments = [
                Segment(
                    type="approach",
                    deflection=force_data[:min_length],
                    z_sensor=z_data[:min_length],
                    sampling_rate=float(metadata.get("sampling_rate", 1e5)),
                    velocity=float(metadata.get("velocity", 1e-6)),
                    no_points=min_length
                )
            ]

            curves[curve_id] = ForceCurve(
                file_id=metadata["file_id"],
                date=metadata["date"],
                instrument=metadata["instrument"],
                sample=metadata["sample"],
                spring_constant=float(metadata["spring_constant"]),
                inv_ols=float(metadata["inv_ols"]),
                tip_geometry=metadata["tip_geometry"],
                tip_radius=float(metadata["tip_radius"]),
                segments=segments
            )
            logger.info(f"Processed IBW curve: {curve_id}")
            return curves
        except Exception as e:
            logger.error(f"Failed to process IBW file {file_path}: {str(e)}")
            raise

    def validate_metadata(self, metadata: Dict) -> bool:
        return HDF5Opener().validate_metadata(metadata)

    def _extract_ibw_metadata(self, notes: list, file_path: str) -> Dict:
        """Extract metadata from IBW notes."""
        metadata = {
            "file_id": os.path.basename(file_path),
            "date": "2025-05-20",
            "instrument": "Asylum Research",
            "sample": "unknown",
            "spring_constant": 0.1,
            "inv_ols": 22e-9,
            "tip_geometry": "pyramid",
            "tip_radius": 1e-6,
            "sampling_rate": 1e5,
            "velocity": 1e-6
        }
        for note in notes:
            if "SpringConstant" in note:
                metadata["spring_constant"] = float(note.split(":")[1])
            elif "InvOLS" in note:
                metadata["inv_ols"] = float(note.split(":")[1])
            elif "TipShape" in note:
                metadata["tip_geometry"] = note.split(":")[1].strip()
            elif "TipRadius" in note:
                metadata["tip_radius"] = float(note.split(":")[1])
            elif "ScanRate" in note:
                metadata["sampling_rate"] = float(note.split(":")[1])
        return metadata

# Register the opener
