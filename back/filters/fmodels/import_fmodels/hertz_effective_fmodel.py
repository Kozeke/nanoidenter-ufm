import numpy as np
from scipy.optimize import curve_fit
from ..fmodel_base import FmodelBase

# Updated HertzEffectiveModel class
class HertzEffectiveModel(FmodelBase):
    NAME = "HertzEffective"
    DESCRIPTION = "Fit indentation data with Hertz model using effective elastic modulus"
    DOI = ""  # Add a DOI if applicable
    PARAMETERS = {"E_eff [Pa]": "Effective Young's modulus"}

    def create(self):
        """Define the filter's parameters for the UI."""
        # No additional parameters needed since Poisson's ratio is omitted
        self.add_parameter('maxInd','float','Max indentation [nm]',800)
        self.add_parameter('minInd','float','Min indentation [nm]',0)
        # pass

    def theory(self, x, elastic):
        """
        Hertz model with effective elastic modulus for various tip geometries.
        :param x: Indentation depth (m)
        :param elastic: Effective Young's modulus (Pa)
        :return: Theoretical force values (N)
        """
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     raise ValueError("Curve data with tip geometry is required")

        # tip_geometry = self.curve.tip["geometry"]
        x = np.array(x)
        tip_geometry = "sphere"
        # tip_geometry = 'sphere'
        radius = 0.5
        if tip_geometry == "sphere":
            # R = self.curve.tip["radius"]
            R = 0.5
            return (4.0 / 3.0) * elastic * np.sqrt(R * x ** 3)
        elif tip_geometry == "pyramid":
            ang = self.curve.tip["angle"]  # Angle in degrees
            return 0.7453 * (elastic * np.tan(ang * np.pi / 180.0)) * x**2
        elif tip_geometry == "cylinder":
            R = self.curve.tip["radius"]
            return (2.0 / 1.0) * elastic * (R * x)
        elif tip_geometry == "cone":
            ang = self.curve.tip["angle"]  # Angle in degrees
            return (2.0 / 1.0) * (elastic * np.tan(ang * np.pi / 180.0)) / np.pi * x**2
        else:
            raise ValueError(f"No data for the tip geometry: {tip_geometry}")

    def calculate(self, x, y):
        """
        Fit the Hertz model with effective modulus to the data.
        :param x: Indentation depth (m, DOUBLE[])
        :param y: Force values (N, DOUBLE[])
        :return: 
        """
        # print("calc hertz effective")
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Validate inputs
        if len(x) < 2 or len(y) < 2:
            return None
        # if self.curve is None or "tip" not in self.curve or "geometry" not in self.curve["tip"]:
        #     return None

        try:
            # Fit the theory function to get the effective modulus
            popt, _ = curve_fit(self.theory, x, y, p0=[1000], maxfev=1000)
            E_eff = popt[0]  # Fitted parameter

            # Evaluate the theory function over x to get the fitted curve
            y_fit = self.theory(x, E_eff)
            # print("hertz effective res", len(x), len(y_fit))
            return [x.tolist(), y_fit.tolist()]  # Return as DOUBLE[][]
        except (RuntimeError, ValueError) as e:
            print(f"Fitting failed: {str(e)}")
            return None