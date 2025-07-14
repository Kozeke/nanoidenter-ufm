from .base import Opener
from .hdf5_opener import HDF5Opener
from .json_opener import JSONOpener
from .csv_opener import CSVOpener  # New
from .txt_opener import TXTOpener  # New

def get_opener(file_type: str) -> Opener:
    if file_type == "json":
        return JSONOpener()
    elif file_type == "hdf5":
        return HDF5Opener()
    elif file_type == "csv":
        return CSVOpener()
    elif file_type == "txt":
        return TXTOpener()
    else:
        raise ValueError(f"Unsupported file type: {file_type}")