from abc import ABC, abstractmethod
from typing import Dict, Any
from models.force_curve import ForceCurve

class Opener(ABC):
    @abstractmethod
    def validate_metadata(self, metadata: Dict) -> bool:
        """Validate mandatory UFF metadata."""
        pass

    @abstractmethod
    def get_structure(self, file_path: str) -> Dict[str, Any]:
        """Return the file structure as a nested dictionary for frontend display."""
        pass

    @abstractmethod
    def process(self, file_path: str, force_path: str, z_path: str, metadata: Dict[str, Any]) -> Dict[str, ForceCurve]:
        """Process the file with user-selected dataset paths and metadata into ForceCurve objects."""
        pass