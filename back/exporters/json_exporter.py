import re
from typing import Dict, Any, List, Optional
import logging
from file_types.json import export_from_duckdb_to_json
from .base import Exporter

logger = logging.getLogger(__name__)

class JSONExporter(Exporter):


    def validate_params(self, data: Dict[str, Any]) -> None:
        # JSON-specific validations: only require curve_ids, export_path, metadata
        if "curve_ids" not in data or not isinstance(data["curve_ids"], list):
            raise ValueError("curve_ids must be provided as a list")
        if "export_path" not in data or not isinstance(data["export_path"], str) or not data["export_path"].strip():
            raise ValueError("export_path must be a non-empty string")
        if "metadata" not in data or not isinstance(data["metadata"], dict):
            raise ValueError("metadata must be provided as a dictionary")
    
        # Add more as needed for other parameters

    def export(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        # Implement or call export_from_duckdb_to_hdf5
        # Assuming export_from_duckdb_to_hdf5 is defined here or imported
        logger.info("exporter44")

        num_exported = export_from_duckdb_to_json(
            db_path=db_path,
            output_path=output_path,
            curve_ids=curve_ids,
            metadata=kwargs.get("metadata")
        )
        return num_exported