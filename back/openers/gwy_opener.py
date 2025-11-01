from gwyfile import GwyContainer
from typing import Dict
import numpy as np
from .base import Opener
from models.force_curve import ForceCurve, Segment
import logging

logger = logging.getLogger(__name__)

class GwyOpener(Opener):
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        curves = {}
        try:
            # Load Gwyddion file
            gwy = GwyContainer.from_file(file_path)
            curve_id = os.path.basename(file_path)

            # Extract force curve data (Gwyddion stores in channels)
            # Note: Gwyddion is image-focused, so force curves may be limited
            data_field = gwy.get("/0/data")  # Example channel
            if not data_field:
                logger.warning(f"No force curve data found in {file_path}")
                return {}

            # Assume single force curve for simplicity
            force_data = data_field.data  # Adjust based on actual channel
            z_data = np.linspace(0, 1, len(force_data))  # Placeholder z-data
            metadata = self._extract_gwy_metadata(gwy, file_path)
            if not self.validate_metadata(metadata):
                logger.warning(f"Invalid metadata for {file_path}")
                return {}

            segments = [
                Segment(
                    type="approach",
                    deflection=force_data,
                    z_sensor=z_data,
                    sampling_rate=float(metadata.get("sampling_rate", 1e5)),
                    velocity=float(metadata.get("velocity", 1e-6)),
                    no_points=len(force_data)
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
            logger.info(f"Processed Gwyddion curve: {curve_id}")
            return curves
        except Exception as e:
            logger.error(f"Failed to process Gwyddion file {file_path}: {str(e)}")
            raise

    def validate_metadata(self, metadata: Dict) -> bool:
        return HDF5Opener().validate_metadata(metadata)

    def _extract_gwy_metadata(self, gwy: GwyContainer, file_path: str) -> Dict:
        """Extract metadata from Gwyddion file."""
        metadata = {
            "file_id": os.path.basename(file_path),
            "date": gwy.get("/meta/date", "2025-05-20"),
            "instrument": gwy.get("/meta/instrument", "unknown"),
            "sample": gwy.get("/meta/sample", "unknown"),
            "spring_constant": float(gwy.get("/meta/spring_constant", 0.1)),
            "inv_ols": float(gwy.get("/meta/sensitivity", 22e-9)),
            "tip_geometry": gwy.get("/meta/tip_geometry", "pyramid"),
            "tip_radius": float(gwy.get("/meta/tip_radius", 1e-6)),
            "sampling_rate": float(gwy.get("/meta/sampling_rate", 1e5)),
            "velocity": float(gwy.get("/meta/velocity", 1e-6))
        }
        return metadata

# Register the opener
# OpenerRegistry.register_opener(".gwy", GwyOpener)