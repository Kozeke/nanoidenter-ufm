from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np

class SigmoidModel(EmodelBase):
    NAME = "Sigmoid"
    DESCRIPTION = "Fit with a generic sigmoidal (logistic) function"
    DOI = ""
    PARAMETERS = {"EH [Pa]": "Higher modulus", "EL [Pa]": "Lower modulus", "T [nm]": "Thickness", "k [Pa/nm]": "Sharpness"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("Smooth", "int", "Upper Percentile threshold", 100, options={"min": 60, "max": 100})
        self.add_parameter("Lower", "int", "Lower Percentile threshold", 10, options={"min": 5, "max": 50})

    def theory(self, x, *parameters):
        """
        Sigmoidal model: EL + A / (1 + exp(-4 * (x - T) / k)), where A = EH - EL
        :param x: Input array (e.g., indentation depth)
        :param parameters: [EH, EL, T, k] (Pa, Pa, nm, Pa/nm)
        :return: Theoretical y-values
        """
        EH, EL, T, k = parameters
        A = EH - EL
        return EL + A / (1 + np.exp(-4 * (x - T) / k))

    def calculate(self, x, y):
        """
        Fit the sigmoidal model to the data.
        :param x: Input array (e.g., indentation depth, DOUBLE[])
        :param y: Input array (e.g., force values, DOUBLE[])
        :return: Fitted parameters [EH, EL, T, k] or None if fitting fails
        """
        print("calc sigmoid", len(x), len(y))
        print("x",x)
        print("y",y)
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        if len(x) < 2 or len(y) < 2:
            print("len(x)<2", len(x),len(y))
            return None

        try:
            p0 = [1000, 200000, 1e-6, 1e-6]  # Initial guesses: EH, EL, T, k
            popt, _ = curve_fit(self.theory, x, y, p0=p0, maxfev=10000)
            # if any(p < 0 for p in popt):  # Check for negative parameters
            #     return None
            print("popt",popt)
            params = list(map(float, popt))  # [EH, EL, T, k]
            print("params", params)
            y_fit = self.theory(x, params)
            return [x.tolist(), y_fit.tolist()]
        except (RuntimeError, ValueError):
            return None