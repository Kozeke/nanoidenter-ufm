from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np

class BilayerModel(EmodelBase):
    NAME = "Bilayer"
    DESCRIPTION = "Bilayer model for fitting indentation data"
    DOI = ""
    PARAMETERS = {"E0 [Pa]": "Cortex Young's modulus", "Eb [Pa]": "Bulk Young's modulus", "d [nm]": "Cortex thickness"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("Lambda", "float", "Lambda coefficient", 1.74, options={"min": 1, "max": 2})
        self.add_parameter('maxInd','float','Max indentation [nm]',800)
        self.add_parameter('minInd','float','Min indentation [nm]',0)

    def theory(self, x, *parameters):
        """
        Bilayer model: Eb + (E0 - Eb) * exp(-Lambda * sqrt(R * x) / d)
        :param x: Indentation depth (m)
        :param parameters: [E0, Eb, d] (Pa, Pa, nm)
        :return: Theoretical force values
        """
        # if self.curve is None or "tip" not in self.curve or "radius" not in self.curve["tip"]:
        #     raise ValueError("Curve data with tip radius is required")
        # R = self.curve["tip"]["radius"]  # Tip radius in meters
        R = 1e-05
        E0, Eb, d = parameters
        d = d * 1e-9  # Convert nm to m
        phi = np.exp(-self.get_value("Lambda") * np.sqrt(R * x) / d)
        return Eb + (E0 - Eb) * phi

    def calculate(self, x, y):
        """
        Fit the bilayer model to the data.
        :param x: Indentation depth (m, DOUBLE[])
        :param y: Force values (N, DOUBLE[])
        :return: Fitted parameters [E0, Eb, d] or None if fitting fails
        """
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        print("calc bimodule", len(x),len(y))
        if len(x) < 2 or len(y) < 2:
            return None

        try:
            p0 = [100000, 1000, 1000]  # Initial guesses: E0 (Pa), Eb (Pa), d (nm)
            popt, _ = curve_fit(self.theory, x, y, p0=p0, maxfev=10000)
            
            # Check if popt is valid (assuming False means fitting failed, though unlikely)
            if popt is False:  # This condition is unusual; see note below
                print("popt is false")
                y_fit = [0] * len(x)  # Return zeros if fitting "fails"
                return [x.tolist(), y_fit]
            print(popt)
            # Calculate y_fit using the fitted parameters
            y_fit = self.theory(x, popt[0], popt[1], popt[2])
            return [x.tolist(), y_fit.tolist()]  # Return [x, y_fit] as lists

        except (RuntimeError, ValueError):
            return None