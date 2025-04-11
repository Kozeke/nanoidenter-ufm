from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np

class SigmoidModel(EmodelBase):
    NAME = "SigmoidNEW"
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
        # print("calc sigmoid", len(x), len(y))
        # print("x",x)
        # print("y",y)
        try:
            # Better initial guesses based on data
            y_max, y_min = np.max(y), np.min(y)
            x_mid = (x.max() + x.min()) / 2 * 1e9  # Convert to nm
            p0 = [y_max, y_min, x_mid, 10]  # EH, EL (Pa), T (nm), k (Pa/nm)
            bounds = ([0, 0, 0, 1e-3], [1e6, 1e6, 1000, 1e3])  # Realistic ranges
            popt, _ = curve_fit(self.theory, x, y, p0=p0, bounds=bounds, maxfev=10000)
            # print("popt", popt)
            y_fit = self.theory(x, *popt)
            # print("y_fit sample", y_fit[:5])
            return [x.tolist(), y_fit.tolist()]
        except (RuntimeError, ValueError) as e:
            print(f"Fitting failed: {e}")
            return None