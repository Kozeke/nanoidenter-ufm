from typing import Dict
from file_types.json import read_json, transform_data_for_force_vs_z_json
from models.force_curve import ForceCurve
from .base import Opener

class JSONOpener(Opener):
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        json_data = read_json(file_path)
        return transform_data_for_force_vs_z_json(json_data)

    def validate_metadata(self, metadata: Dict) -> bool:
        mandatory_fields = ["file_id", "date", "instrument", "sample", "spring_constant", "inv_ols", "tip_geometry", "tip_radius"]
        return all(k in metadata for k in mandatory_fields)