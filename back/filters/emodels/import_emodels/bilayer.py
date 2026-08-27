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
        self.add_parameter('tip_radius','float','Tip radius (m)',1e-5)

    def theory(self, x, *parameters):
        """
        Bilayer model: Eb + (E0 - Eb) * exp(-Lambda * sqrt(R * x) / d)
        :param x: Indentation depth (m)
        :param parameters: [E0, Eb, d] (Pa, Pa, nm)
        :return: Theoretical force values

        NOTE: This method reads self.get_value() and is NOT safe to use inside
        curve_fit when the instance may be shared across DuckDB UDF rows.
        Use the theory_local closure inside calculate() instead.
        """
        R = self.get_value("tip_radius")
        E0, Eb, d = parameters
        d = d * 1e-9  # Convert nm to m
        phi = np.exp(-self.get_value("Lambda") * np.sqrt(R * x) / d)
        return Eb + (E0 - Eb) * phi

    def calculate(self, x, y, params=None):
        """
        Fit the bilayer model to the data.

        Args:
            x: Indentation depth (m, DOUBLE[])
            y: Elastic modulus values (Pa, DOUBLE[])
            params: Optional parameter array [Lambda, maxInd, minInd, tip_radius]
                    matching the create() order. When provided, these values are
                    used directly instead of self.get_value(), making this method
                    safe to call from a shared UDF instance (sequential DuckDB).

        Returns:
            [z_windowed, y_fit, popt] or None if fitting fails.
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

            # --- Snapshot all parameters NOW, before any async/concurrent mutation ---
            # When params is provided (from udf_wrapper), use those values directly.
            # This is the key fix: never read self.get_value() inside curve_fit.
            if params is not None and len(params) >= 4:
                # params order matches create(): [Lambda, maxInd, minInd, tip_radius]
                Lambda     = float(params[0])
                max_ind_nm = float(params[1])
                min_ind_nm = float(params[2])
                R          = float(params[3])
            elif params is not None and len(params) >= 3:
                # Backward-compat: no tip_radius in params
                Lambda     = float(params[0])
                max_ind_nm = float(params[1])
                min_ind_nm = float(params[2])
                R          = float(self.get_value('tip_radius'))
            else:
                # Fallback: read from instance (safe only in single-threaded non-shared use)
                Lambda     = float(self.get_value("Lambda"))
                max_ind_nm = float(self.get_value('maxInd'))
                min_ind_nm = float(self.get_value('minInd'))
                R          = float(self.get_value('tip_radius'))

            min_ind_m = min_ind_nm * 1e-9
            max_ind_m = max_ind_nm * 1e-9

            # Window the data
            mask = (z >= min_ind_m) & (z <= max_ind_m)
            z_windowed = z[mask]
            e_windowed = e[mask]

            if len(z_windowed) < 3:
                return None

            # --- Pure closure: no reference to self at all ---
            # Lambda and R are captured by value from the snapshot above.
            # curve_fit calls this function many times; it must never read self.
            def theory_local(x_arr, E0, Eb, d):
                d_m = d * 1e-9  # d is in nm, convert to m
                phi = np.exp(-Lambda * np.sqrt(R * x_arr) / d_m)
                return Eb + (E0 - Eb) * phi

            p0 = [100000, 1000, 1000]  # Initial guesses: E0 (Pa), Eb (Pa), d (nm)
            popt, _ = curve_fit(theory_local, z_windowed, e_windowed, p0=p0, maxfev=10000)

            # Use the same closure for the fitted curve — NOT self.theory
            y_fit = theory_local(z_windowed, popt[0], popt[1], popt[2])

            return [z_windowed.tolist(), y_fit.tolist(), popt.tolist()]

        except (RuntimeError, ValueError, Exception):
            return None