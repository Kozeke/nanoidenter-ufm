from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

class Exporter(ABC):
    @abstractmethod

    def validate_params(self, data: Dict[str, Any]) -> None:
        """Validate export parameters."""
        pass
    
    @abstractmethod
    def export(self, db_path: str, output_path: str, curve_ids: Optional[List[int]] = None, **kwargs) -> int:
        """Export curves from DuckDB to the specified format."""
        pass

