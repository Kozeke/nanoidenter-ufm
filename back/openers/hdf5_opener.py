from typing import Dict
from file_types.hdf5 import read_hdf5
from models.force_curve import ForceCurve
from .base import Opener

class HDF5Opener(Opener):
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        return read_hdf5(file_path)

    def validate_metadata(self, metadata: Dict) -> bool:
        mandatory_fields = ["file_id", "date", "instrument", "sample", "spring_constant", "inv_ols", "tip_geometry", "tip_radius"]
        return all(k in metadata for k in mandatory_fields)