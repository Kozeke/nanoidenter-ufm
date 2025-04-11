import numpy as np
from scipy.optimize import curve_fit
from ..fmodel_base import FmodelBase

class HertzFmodel(FmodelBase):
    NAME = "Hertz"
    DESCRIPTION = "Fit indentation data with Hertz contact mechanics model"
    DOI = ""  # Add a DOI if applicable
    PARAMETERS = {"E [Pa]": "Young's modulus"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("poisson", "float", "Poisson ratio", 0.5, options={"min": -1, "max": 0.5})

    def theory(self, x, elastic):
        """
        Hertz model for various tip geometries.
        :param x: Indentation depth (m)
        :param elastic: Young's modulus (Pa)
        :return: Theoretical force values (N)
        # """
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     raise ValueError("Curve data with tip geometry is required")

        # geometry = self.curve.tip["geometry"]
        poisson = self.get_value("poisson")
        geometry = "sphere"

        x = np.array(x)
        if geometry == "sphere":
            # R = self.curve.tip["radius"]
            R = 1e-05
            return (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(R * x ** 3)
        elif geometry == "pyramid":
            ang = self.curve.tip["angle"]  # Angle in degrees
            return 0.7453 * ((elastic * np.tan(ang * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
        elif geometry == "cylinder":
            R = self.curve.tip["radius"]
            return (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (R * x)
        elif geometry == "cone":
            ang = self.curve.tip["angle"]  # Angle in degrees
            return (2.0 / 1.0) * ((elastic * np.tan(ang * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
        else:
            raise ValueError(f"No data for the tip geometry: {geometry}")

    def calculate(self, x, y):
        """
        Fit the Hertz model to the data.
        :param x: Indentation depth (m, DOUBLE[])
        :param y: Force values (N, DOUBLE[])
        :return: Fitted parameter [E] or None if fitting fails
        """
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Validate inputs
        if len(x) < 2 or len(y) < 2:
            return None
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     return None

        try:
            # Fit the theory function with elastic modulus as the only parameter
            popt, pcov = curve_fit(self.theory, x, y, p0=[1000], maxfev=1000)
            elastic = popt[0]
            if elastic < 0:  # Ensure positive modulus
                return None
            # Compute the fitted curve using the theory function
            y_fit = self.theory(x, elastic)
            print("hertz res", len(x), len(y_fit))  # Debug output to match second
            return [x.tolist(), y_fit.tolist()]         
        except (RuntimeError, ValueError) as e:
            print(f"Fitting failed: {str(e)}")
            return None