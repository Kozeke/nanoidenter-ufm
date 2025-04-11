import numpy as np
from scipy.optimize import curve_fit
from ..fmodel_base import FmodelBase


class DriftedHertzModel(FmodelBase):
    NAME = "DriftedHertz"
    DESCRIPTION = "Fit indentation data with the Hertz model including drift - Supports multiple tip geometries"
    DOI = ""  # Add a DOI if applicable
    PARAMETERS = {"E [Pa]": "Young's modulus", "m [N/m]": "Drift coefficient"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("poisson", "float", "Poisson ratio", 0.5, options={"min": -1, "max": 0.5})

    def theory(self, x, *parameters):
        """
        Hertz model with drift: m * x + Hertz term
        :param x: Indentation depth (m)
        :param parameters: [E, m] (Young's modulus in Pa, drift coefficient in N/m)
        :return: Theoretical force values (N)
        """
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     raise ValueError("Curve data with tip geometry is required")
        # print("params",parameters)

        # Normalize parameters to always unpack E and m safely
        if len(parameters) == 1 and isinstance(parameters[0], (list, tuple, np.ndarray)):
            E, m = parameters[0]
        else:
            E, m = parameters
        # geometry = self.curve.tip["geometry"]
        geometry = "sphere"
        poisson = self.get_value("poisson")
        x = np.array(x)
        # print('passed')
        drift_term = m * x
        if geometry == "sphere":
            # R = self.curve.tip["radius"]
            R = 1e-05
            hertz_term = (4.0 / 3.0) * (E / (1 - poisson ** 2)) * np.sqrt(R * x ** 3)
        elif geometry == "pyramid":
            ang = self.curve.tip["angle"]  # Angle in degrees
            hertz_term = 0.7453 * ((E * np.tan(ang * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
        elif geometry == "cylinder":
            R = self.curve.tip["radius"]
            hertz_term = (2.0 / 1.0) * (E / (1 - poisson ** 2)) * (R * x)
        elif geometry == "cone":
            ang = self.curve.tip["angle"]  # Angle in degrees
            hertz_term = (2.0 / 1.0) * ((E * np.tan(ang * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
        else:
            raise ValueError(f"Unsupported tip geometry: {geometry}")

        return drift_term + hertz_term

    def calculate(self, x, y):
        """
        Fit the drifted Hertz model to the data.
        :param x: Indentation depth (m, DOUBLE[])
        :param y: Force values (N, DOUBLE[])
        :return: Fitted parameters [E, m] or None if fitting fails
        """
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Validate inputs
        if len(x) < 2 or len(y) < 2:
            return None
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     return None

        try:
            # Fit the theory function with E and m as parameters
            popt, pcov = curve_fit(self.theory, x, y, p0=[1000, 1], maxfev=1000)
            E, m = popt
            if E < 0:  # Ensure positive modulus (drift coefficient m can be negative)
                return None
                    # Compute the fitted curve using the theory function
            # print(popt)
            y_fit = self.theory(x, popt)
            # print("i am ")
            return [x.tolist(), y_fit.tolist()]  #
        except (RuntimeError, ValueError) as e:
            print(f"Fitting failed: {str(e)}")
            return None