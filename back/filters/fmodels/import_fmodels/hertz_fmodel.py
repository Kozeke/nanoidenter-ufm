# Applies Hertz contact fitting using per-curve tip metadata from DuckDB.
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
        self.add_parameter('maxInd','float','Max indentation [nm]',800)
        self.add_parameter('minInd','float','Min indentation [nm]',0)
        # Provides a fallback tip radius (meters) only when per-curve metadata radius is missing or invalid.
        self.add_parameter('tip_radius','float','Tip radius (m)',1e-5)

    # Resolves tip geometry, radius, and angle from runtime curve metadata with safe defaults.
    def _get_tip_metadata(self):
        # Stores fallback geometry when DB metadata is unavailable.
        default_geometry = "sphere"
        # Stores fallback radius in meters when DB metadata is unavailable.
        default_radius = float(self.get_value("tip_radius"))
        # Stores runtime geometry set by fmodel UDF wrapper for this call.
        runtime_geometry = getattr(self, "runtime_tip_geometry", default_geometry)
        # Stores runtime radius set by fmodel UDF wrapper for this call.
        runtime_radius = getattr(self, "runtime_tip_radius", default_radius)
        # Stores runtime angle (degrees) set by fmodel UDF wrapper for this call.
        # 0.0 means unknown geometry → use C=1 approximation (F = E·δ²).
        runtime_angle = getattr(self, "runtime_tip_angle", 0.0)

        # Stores normalized geometry string used by theory branch selection.
        geometry = str(runtime_geometry or default_geometry).lower()
        # Stores radius from runtime metadata while preserving fallback on invalid values.
        radius = runtime_radius
        try:
            radius = float(radius)
        except (TypeError, ValueError):
            radius = default_radius
        if radius <= 0:
            radius = default_radius

        try:
            angle = float(runtime_angle)
        except (TypeError, ValueError):
            angle = 0.0

        return geometry, radius, angle

    def theory(self, x, elastic):
        """
        Hertz model for various tip geometries.
        :param x: Indentation depth (m)
        :param elastic: Young's modulus (Pa)
        :return: Theoretical force values (N)
        """
        # Stores Poisson ratio selected by UI parameters.
        poisson = self.get_value("poisson")
        # Stores geometry, radius and angle fetched from DB metadata via UDF runtime context.
        geometry, tip_radius, tip_angle = self._get_tip_metadata()

        x = np.array(x)
        if geometry == "sphere":
            R = tip_radius
            return (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(R * x ** 3)
        elif geometry == "pyramid":
            ang = tip_angle if tip_angle > 0 else 30.0
            return 0.7453 * ((elastic * np.tan(ang * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
        elif geometry == "cylinder":
            R = tip_radius
            return (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (R * x)
        elif geometry == "cone":
            if tip_angle == 0.0:
                # Unknown geometry: F = C·E·δ²  with C = 1
                # Poisson term dropped (absorbed into effective E, consistent with C=1 slide)
                return elastic * x**2
            else:
                return (2.0 / np.pi) * ((elastic * np.tan(tip_angle * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
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
        try:
            # Fit the theory function with elastic modulus as the only parameter
            popt, pcov = curve_fit(self.theory, x, y, p0=[1000], maxfev=1000)
            elastic = popt[0]
            if elastic < 0:  # Ensure positive modulus
                return None
            # Compute the fitted curve using the theory function
            y_fit = self.theory(x, elastic)
            # print("hertz res", len(x), len(y_fit))  # Debug output to match second
            return [x.tolist(), y_fit.tolist(), [elastic]]         
        except (RuntimeError, ValueError) as e:
            # print(f"Fitting failed: {str(e)}")
            return None