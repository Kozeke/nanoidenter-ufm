from abc import ABC, abstractmethod

# Define the EmodelBase abstract base class
class EmodelBase(ABC):
    def __init__(self):
        self.parameters = {}
        self.curve = None  # Placeholder for curve data, if needed

    @abstractmethod
    def create(self):
        """Define the filter's parameters for the UI."""
        pass

    @abstractmethod
    def theory(self, x, parameters):
        """Calculate the theoretical fitting function for a specific set of parameters."""
        pass

    @abstractmethod
    def calculate(self, x, y):
        """Process the input data and return fitted parameters."""
        pass

    def add_parameter(self, name, param_type, description, default, options=None):
        """Helper to define parameters dynamically."""
        self.parameters[name] = {
            "type": param_type,
            "description": description,
            "default": default,
            "options": options  # For combo types
        }

    def get_value(self, name):
        """Retrieve parameter value (to be set by the UI later)."""
        return self.parameters[name].get("value", self.parameters[name]["default"])