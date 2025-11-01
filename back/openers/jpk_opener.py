import h5py
import numpy as np
from typing import Dict
from .base import Opener
from models.force_curve import ForceCurve, Segment
import logging

logger = logging.getLogger(__name__)

class JPKOpener(Opener):
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        curves = {}
        try:
            with h5py.File(file_path, "r") as f:
                # JPK files typically have a 'segments' group with force-distance data
                segments_group = f.get("segments", None)
                if not segments_group:
                    logger.error("No 'segments' group found in JPK file")
                    raise ValueError("Invalid JPK file structure")

                for curve_id in segments_group:
                    curve_group = segments_group[curve_id]
                    try:
                        # Extract force and z-sensor data (JPK-specific paths)
                        force_data = np.array(curve_group.get("force-segment/0/data", []))
                        z_data = np.array(curve_group.get("height-segment/0/data", []))
                        if len(force_data) == 0 or len(z_data) == 0:
                            logger.warning(f"Skipping {curve_id}: Empty force or z data")
                            continue

                        # Extract metadata from JPK attributes
                        metadata = self._extract_jpk_metadata(curve_group, file_path)
                        if not self.validate_metadata(metadata):
                            logger.warning(f"Skipping {curve_id}: Invalid metadata")
                            continue

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
                        logger.info(f"Processed JPK curve: {curve_id}")
                    except Exception as e:
                        logger.warning(f"Skipping {curve_id}: {str(e)}")
                        continue
            if not curves:
                raise ValueError("No valid curves found in JPK file")
            return curves
        except Exception as e:
            logger.error(f"Failed to process JPK file {file_path}: {str(e)}")
            raise

    def validate_metadata(self, metadata: Dict) -> bool:
        # Reuse HDF5Opener's validation logic
        return HDF5Opener().validate_metadata(metadata)

    def _extract_jpk_metadata(self, curve_group: h5py.Group, file_path: str) -> Dict:
        """Extract metadata from JPK file."""
        metadata = {
            "file_id": os.path.basename(file_path),
            "date": curve_group.attrs.get("date", "2025-05-20"),
            "instrument": curve_group.attrs.get("instrument", "JPK"),
            "sample": curve_group.attrs.get("sample", "unknown"),
            "spring_constant": float(curve_group.attrs.get("springConstant", 0.1)),
            "inv_ols": float(curve_group.attrs.get("sensitivity", 22e-9)),
            "tip_geometry": curve_group.attrs.get("tipShape", "pyramid"),
            "tip_radius": float(curve_group.attrs.get("tipRadius", 1e-6)),
            "sampling_rate": float(curve_group.attrs.get("samplingRate", 1e5)),
            "velocity": float(curve_group.attrs.get("speed", 1e-6))
        }
        return metadata