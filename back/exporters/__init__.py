from .base import Exporter  # Re-export if needed
from .hdf5_exporter import HDF5Exporter
from .json_exporter import JSONExporter
from .csv_exporter import CSVExporter  # New
from .txt_exporter import TXTExporter  # New

def get_exporter(file_type: str) -> Exporter:
    if file_type == "json":
        return JSONExporter()
    elif file_type == "hdf5":
        return HDF5Exporter()
    elif file_type == "csv":
        return CSVExporter()
    elif file_type == "txt":
        return TXTExporter()
    else:
        raise ValueError(f"Unsupported export type: {file_type}")