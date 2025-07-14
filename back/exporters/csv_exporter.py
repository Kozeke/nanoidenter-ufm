import csv
from typing import Dict, Any, List, Optional
import logging
from file_types.csv import export_from_duckdb_to_csv
import duckdb
import numpy as np
from .base import Exporter

class CSVExporter(Exporter):
    def validate_params(self, data: Dict[str, Any]) -> None:
        # CSV-specific validations: require curve_ids, export_path, metadata
        if "curve_ids" not in data or not isinstance(data["curve_ids"], list):
            raise ValueError("curve_ids must be provided as a list")
        if "export_path" not in data or not isinstance(data["export_path"], str) or not data["export_path"].strip():
            raise ValueError("export_path must be a non-empty string")
        if "metadata" not in data or not isinstance(data["metadata"], dict):
            raise ValueError("metadata must be provided as a dictionary")

    def export(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        return export_from_duckdb_to_csv(
            db_path=db_path,
            output_path=output_path,
            curve_ids=curve_ids,
            metadata=kwargs.get("metadata", {})
        )