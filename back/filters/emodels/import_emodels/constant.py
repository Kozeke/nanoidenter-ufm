from ..emodel_base import EmodelBase
import numpy as np

class ConstantModel(EmodelBase):
    NAME = "Constant"
    DESCRIPTION = "Evaluate the average value"
    DOI = ""
    PARAMETERS = {"E [Pa]": "Young's modulus"}

    def create(self):
        """Define the filter's parameters for the UI."""
        # No parameters needed for this simple model
        pass

    def theory(self, x, *parameters):
        """
        Constant model: E * ones(len(x))
        :param x: Input array (e.g., indentation depth)
        :param parameters: [E] (average modulus)
        :return: Constant array of average modulus
        """
        return parameters[0] * np.ones(len(x))

    def calculate(self, x, y):
        """
        Calculate the average value of y.
        :param x: Input array (e.g., indentation depth, DOUBLE[])
        :param y: Input array (e.g., force values, DOUBLE[])
        :return: Parameter [E] as a list or None if error occurs
        """
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        if len(y) < 1:
            return None
         # Compute the average of y
        avg = float(np.average(y))
        print("Average modulus:", avg)

        # Use the average to generate y_fit via theory
        y_fit = self.theory(x, avg)
        return [x.tolist(), y_fit.tolist()]