from abc import ABC, abstractmethod
from typing import Dict
from models.force_curve import ForceCurve

class Opener(ABC):
    @abstractmethod
    def open(self, file_path: str) -> Dict[str, ForceCurve]:
        """Read file and return a dictionary of ForceCurve objects."""
        pass

    @abstractmethod
    def validate_metadata(self, metadata: Dict) -> bool:
        """Validate mandatory UFF metadata."""
        pass