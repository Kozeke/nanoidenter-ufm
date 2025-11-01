from abc import ABC, abstractmethod
import numpy as np

class CpointBase(ABC):
    def __init__(self):
        self.parameters = {}
        # Track parameter order to ensure deterministic mapping
        self.parameter_order = []

    @abstractmethod
    def create(self):
        """Define the filter's parameters for the UI."""
        pass

    @abstractmethod
    def calculate(self, x, y, metadata=None):
        """Process the input data and return filtered output."""
        pass

    def add_parameter(self, name, param_type, description, default, options=None):
        """Helper to define parameters dynamically."""
        self.parameters[name] = {
            "type": param_type,
            "description": description,
            "default": default,
            "options": options  # For combo types
        }
        # Track parameter order for deterministic mapping
        if name not in self.parameter_order:
            self.parameter_order.append(name)

    def get_value(self, name):
        """Retrieve parameter value (to be set by the UI later)."""
        return self.parameters[name].get("value", self.parameters[name]["default"])