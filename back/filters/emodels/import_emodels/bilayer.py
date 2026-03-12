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
        """
        # Tip radius comes from the experiment metadata (set via tip_radius parameter).
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
            params: Optional parameter array [Lambda, maxInd, minInd, tip_radius] matching create() order
        
        Returns:
            Fitted parameters [E0, Eb, d] or None if fitting fails
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

            # Snapshot these NOW — before any other thread can mutate self.parameters
            # This ensures thread-safety when curve_fit calls the theory function
            Lambda = float(self.get_value("Lambda"))
            R = float(self.get_value("tip_radius"))

            # Use a closure so curve_fit never touches self.get_value()
            def theory_local(x, E0, Eb, d):
                d_m = d * 1e-9  # Convert nm to m
                phi = np.exp(-Lambda * np.sqrt(R * x) / d_m)
                return Eb + (E0 - Eb) * phi

            # Extract maxInd and minInd parameters for windowing
            # Parameters are in order: [Lambda, maxInd, minInd, tip_radius] based on create() method
            if params is not None and len(params) >= 3:
                # params array: [Lambda, maxInd, minInd, tip_radius]
                max_ind_nm = float(params[1])  # maxInd is at index 1
                min_ind_nm = float(params[2])  # minInd is at index 2
            else:
                # Try to get from model parameters if not provided
                max_ind_nm = self.get_value('maxInd')
                min_ind_nm = self.get_value('minInd')
            
            min_ind_m = min_ind_nm * 1e-9
            max_ind_m = max_ind_nm * 1e-9
            
            # Window the data
            mask = (z >= min_ind_m) & (z <= max_ind_m)
            z_windowed = z[mask]
            e_windowed = e[mask]
            
            if len(z_windowed) < 3:
                return None

            p0 = [100000, 1000, 1000]  # Initial guesses: E0 (Pa), Eb (Pa), d (nm)
            popt, _ = curve_fit(theory_local, z_windowed, e_windowed, p0=p0, maxfev=10000)
            
            # Calculate y_fit using the closure function (not self.theory)
            y_fit = theory_local(z_windowed, popt[0], popt[1], popt[2])
            
            return [z_windowed.tolist(), y_fit.tolist(), popt.tolist()]  # Return with parameters

        except (RuntimeError, ValueError, Exception) as e:
            return None