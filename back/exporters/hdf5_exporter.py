import re
from typing import Dict, Any, List, Optional
import logging
from file_types.hdf5 import  export_from_duckdb_to_hdf5
from .base import Exporter

logger = logging.getLogger(__name__)

class HDF5Exporter(Exporter):
    def validate_hdf5_path(self, path: str) -> None:
        if not path or not isinstance(path, str):
            raise ValueError("HDF5 path must be a non-empty string")
        if path.startswith("/") or path.endswith("/"):
            raise ValueError("HDF5 path cannot start or end with '/'")
        if "//" in path:
            raise ValueError("HDF5 path cannot contain consecutive '/'")
        if not re.match(r'^[a-zA-Z0-9][a-zA-Z0-9_/]*[a-zA-Z0-9]$', path):
            raise ValueError("HDF5 path contains invalid characters")

    def validate_params(self, data: Dict[str, Any]) -> None:
        # HDF5-specific validations
        level_names = data.get("level_names", ["curve0", "segment0"])
        if not isinstance(level_names, list) or len(level_names) < 1:
            raise ValueError("level_names must be a non-empty list")
        dataset_path = data.get("dataset_path")
        if not dataset_path:
            raise ValueError("Missing dataset_path for HDF5")
        self.validate_hdf5_path(dataset_path)
        metadata_path = data.get("metadata_path", "")
        if metadata_path:
            self.validate_hdf5_path(metadata_path)
        # Add more as needed for other parameters

    def export(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        # Implement or call export_from_duckdb_to_hdf5
        # Assuming export_from_duckdb_to_hdf5 is defined here or imported
        num_exported = export_from_duckdb_to_hdf5(
            db_path=db_path,
            output_path=output_path,
            curve_ids=curve_ids,
            dataset_path=kwargs.get("dataset_path"),
            level_names=kwargs.get("level_names"),
            metadata_path=kwargs.get("metadata_path"),
            metadata=kwargs.get("metadata")
        )
        return num_exported