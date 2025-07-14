import logging
from typing import Dict, Any
from file_types.csv import get_csv_structure, process_csv  # Assuming functions are defined in file_types/csv.py
from models.force_curve import ForceCurve
from .base import Opener

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("csv_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class CSVOpener(Opener):
    def validate_metadata(self, metadata: Dict) -> bool:
        mandatory_fields = ["file_id", "date", "instrument", "sample", "spring_constant", "inv_ols", "tip_geometry", "tip_radius"]
        try:
            for field in mandatory_fields:
                if field not in metadata or metadata[field] is None:
                    logger.warning(f"Missing or None metadata field: {field}")
                    return False
                if field in ["spring_constant", "inv_ols", "tip_radius"] and not isinstance(metadata[field], (int, float)):
                    logger.warning(f"Invalid type for {field}: expected number, got {type(metadata[field])}")
                    return False
                if field in ["spring_constant", "inv_ols", "tip_radius"] and float(metadata[field]) <= 0:
                    logger.warning(f"Invalid value for {field}: must be positive, got {metadata[field]}")
                    return False
            return True
        except Exception as e:
            logger.error(f"Metadata validation error: {str(e)}")
            return False

    def get_structure(self, file_path: str) -> Dict[str, Any]:
        return get_csv_structure(file_path)
    
    def process(self, file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
        return process_csv(file_path, force_path, z_path, metadata)

    