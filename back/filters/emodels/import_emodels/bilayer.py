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
        :param y: Elastic modulus values (Pa, DOUBLE[])
        :return: Fitted parameters [E0, Eb, d] or None if fitting fails
        """
        try:
            z = np.asarray(x, dtype=np.float64)
            e = np.asarray(y, dtype=np.float64)
            
            # Require at least 3 points for a 3-parameter fit
            if z.size < 3 or e.size < 3 or z.size != e.size:
                return None
            
            # Check for empty or invalid data
            if not np.any(np.isfinite(z)) or not np.any(np.isfinite(e)):
                return None

            p0 = [100000, 1000, 1000]  # Initial guesses: E0 (Pa), Eb (Pa), d (nm)
            popt, _ = curve_fit(self.theory, z, e, p0=p0, maxfev=10000)
            
            # Calculate y_fit using the fitted parameters
            y_fit = self.theory(z, popt[0], popt[1], popt[2])
            return [z.tolist(), y_fit.tolist(), popt.tolist()]  # Return with parameters

        except (RuntimeError, ValueError, Exception):
            return None