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

    def calculate(self, x, y, params=None):
        """
        Fit the bilayer model to the data.
        
        Args:
            x: Indentation depth (m, DOUBLE[])
            y: Elastic modulus values (Pa, DOUBLE[])
            params: Optional parameter array [Lambda, maxInd, minInd] matching create() order
        
        Returns:
            Fitted parameters [E0, Eb, d] or None if fitting fails
        """
        try:
            z = np.asarray(x, dtype=np.float64)
            e = np.asarray(y, dtype=np.float64)
            
            print(f"\n{'='*60}")
            print(f"CALCULATE CALLED - RAW INPUT DATA:")
            print(f"  x length: {len(z)}")
            print(f"  y length: {len(e)}")
            print(f"  x range: [{z.min()*1e9:.3f}, {z.max()*1e9:.3f}] nm")
            print(f"  y range: [{e.min():.6e}, {e.max():.6e}] Pa")
            print(f"  params: {params}")
            print(f"{'='*60}\n")
            
            # Require at least 3 points for a 3-parameter fit
            if z.size < 3 or e.size < 3 or z.size != e.size:
                return None
            
            # Check for empty or invalid data
            if not np.any(np.isfinite(z)) or not np.any(np.isfinite(e)):
                return None

            # Extract maxInd and minInd parameters for windowing
            # Parameters are in order: [Lambda, maxInd, minInd] based on create() method
            if params is not None and len(params) >= 3:
                # params array: [Lambda, maxInd, minInd]
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
            
            print(f"AFTER WINDOWING:")
            print(f"  Window: [{min_ind_nm:.1f}, {max_ind_nm:.1f}] nm")
            print(f"  Mask sum: {mask.sum()} / {len(mask)} points")
            print(f"  z_windowed length: {len(z_windowed)}")
            print(f"  z_windowed range: [{z_windowed.min()*1e9:.3f}, {z_windowed.max()*1e9:.3f}] nm")
            print(f"  e_windowed range: [{e_windowed.min():.6e}, {e_windowed.max():.6e}] Pa")
            
            if len(z_windowed) < 3:
                # print(f"\nERROR: Not enough points after windowing! Need at least 3 for 3-parameter fit.")
                return None

            print(f"\nSTARTING CURVE_FIT...")
            print(f"  Initial guess: p0=[100000, 1000, 1000] (E0, Eb, d)")
            
            p0 = [100000, 1000, 1000]  # Initial guesses: E0 (Pa), Eb (Pa), d (nm)
            popt, _ = curve_fit(self.theory, z_windowed, e_windowed, p0=p0, maxfev=10000)
            
            print(f"\nFIT RESULT:")
            print(f"  E0 = {popt[0]:.6f} Pa")
            print(f"  Eb = {popt[1]:.6f} Pa")
            print(f"  d = {popt[2]:.6f} nm")
            
            # Calculate y_fit using the fitted parameters
            y_fit = self.theory(z_windowed, popt[0], popt[1], popt[2])
            
            # Calculate residuals
            residuals = e_windowed - y_fit
            rms_error = np.sqrt(np.mean(residuals**2))
            print(f"  RMS error: {rms_error:.6e} Pa")
            print(f"  Max residual: {np.abs(residuals).max():.6e} Pa")
            print(f"{'='*60}\n")
            
            return [z_windowed.tolist(), y_fit.tolist(), popt.tolist()]  # Return with parameters

        except (RuntimeError, ValueError, Exception) as e:
            print(f"\nFITTING FAILED: {str(e)}")
            print(f"{'='*60}\n")
            return None