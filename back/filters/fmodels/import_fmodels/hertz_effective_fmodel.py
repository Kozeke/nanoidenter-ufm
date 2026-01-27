import numpy as np
from scipy.optimize import curve_fit
from ..fmodel_base import FmodelBase

class HertzEffectiveModel(FmodelBase):
    NAME = "HertzEffective"
    DESCRIPTION = "Fit indentation data with Hertz model using effective elastic modulus"
    DOI = ""
    PARAMETERS = {"E_eff [Pa]": "Effective Young's modulus"}

    def create(self):
        """Define the filter's parameters for the UI."""
        # These define what appears in the UI and the parameter order
        self.add_parameter('maxInd', 'float', 'Max indentation [nm]', 800)
        self.add_parameter('minInd', 'float', 'Min indentation [nm]', 0)

    def theory(self, x, elastic):
        """
        Hertz model with effective elastic modulus for various tip geometries.
        
        Args:
            x: Indentation depth (m)
            elastic: Effective Young's modulus (Pa)
        
        Returns:
            Theoretical force values (N)
        """
        x = np.array(x)
        # print("elastic", elastic)
        # Get tip parameters from curve metadata
        if hasattr(self, 'curve') and self.curve is not None:
            tip_geometry = self.curve.get('tip', {}).get('geometry', 'sphere')
            tip_radius = self.curve.get('tip', {}).get('radius', 1e-5)
            tip_angle = self.curve.get('tip', {}).get('angle', 30.0)
        else:
            tip_geometry = 'sphere'
            tip_radius = 1e-5
            tip_angle = 30.0
        
        if tip_geometry == "sphere":
            R = float(tip_radius)
            return (4.0 / 3.0) * elastic * np.sqrt(R * x ** 3)
        elif tip_geometry == "pyramid":
            return 0.7453 * (elastic * np.tan(tip_angle * np.pi / 180.0)) * x**2
        elif tip_geometry == "cylinder":
            R = float(tip_radius)
            return (2.0 / 1.0) * elastic * (R * x)
        elif tip_geometry == "cone":
            return (2.0 / 1.0) * (elastic * np.tan(tip_angle * np.pi / 180.0)) / np.pi * x**2
        else:
            raise ValueError(f"Unsupported tip geometry: {tip_geometry}")

    def calculate(self, x, y, params=None):
        """Debug version with detailed logging"""
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # print(f"\n{'='*60}")
        # print(f"CALCULATE CALLED - RAW INPUT DATA:")
        # print(f"  x length: {len(x)}")
        # print(f"  y length: {len(y)}")
        # print(f"  x range: [{x.min()*1e9:.3f}, {x.max()*1e9:.3f}] nm")
        # print(f"  y range: [{y.min():.6e}, {y.max():.6e}] N")
        # print(f"  params: {params}")
        # print(f"{'='*60}\n")

        if len(x) < 2 or len(y) < 2:
            return None

        # Extract parameters
        if params is not None and len(params) >= 2:
            max_ind_nm = float(params[0])
            min_ind_nm = float(params[1])
        else:
            max_ind_nm = 800.0
            min_ind_nm = 0.0
        
        min_ind_m = min_ind_nm * 1e-9
        max_ind_m = max_ind_nm * 1e-9
        
        # Window the data
        mask = (x >= min_ind_m) & (x <= max_ind_m)
        x_windowed = x[mask]
        y_windowed = y[mask]
        
        # print(f"AFTER WINDOWING:")
        # print(f"  Window: [{min_ind_nm:.1f}, {max_ind_nm:.1f}] nm")
        # print(f"  Mask sum: {mask.sum()} / {len(mask)} points")
        # print(f"  x_windowed length: {len(x_windowed)}")
        # print(f"  x_windowed range: [{x_windowed.min()*1e9:.3f}, {x_windowed.max()*1e9:.3f}] nm")
        # print(f"  y_windowed range: [{y_windowed.min():.6e}, {y_windowed.max():.6e}] N")
        
        # Print first and last few points
        # print(f"\nFIRST 5 POINTS:")
        # for i in range(min(5, len(x_windowed))):
        #     print(f"    x[{i}] = {x_windowed[i]*1e9:.6f} nm, y[{i}] = {y_windowed[i]:.6e} N")
        
        # print(f"\nLAST 5 POINTS:")
        # for i in range(max(0, len(x_windowed)-5), len(x_windowed)):
        #     print(f"    x[{i}] = {x_windowed[i]*1e9:.6f} nm, y[{i}] = {y_windowed[i]:.6e} N")
        
        if len(x_windowed) < 2:
            # print(f"\nERROR: Not enough points after windowing!")
            return None

        # Get tip parameters
        if hasattr(self, 'curve') and self.curve is not None:
            tip_geometry = self.curve.get('tip', {}).get('geometry', 'sphere')
            tip_radius = self.curve.get('tip', {}).get('radius', 1e-5)
        else:
            tip_geometry = 'sphere'
            tip_radius = 1e-5
        
        # print(f"\nTIP PARAMETERS:")
        # print(f"  geometry: {tip_geometry}")
        # print(f"  radius: {tip_radius:.6e} m")
        
        try:
            # print(f"\nSTARTING CURVE_FIT...")
            # print(f"  Initial guess: p0=[1000]")
            
            # Fit
            popt, _ = curve_fit(self.theory, x_windowed, y_windowed, p0=[1000], maxfev=1000)
            E_eff = popt[0]
            
            # print(f"\nFIT RESULT:")
            # print(f"  E_eff = {E_eff:.6f} Pa")
            
            y_fit = self.theory(x_windowed, E_eff)
            
            # Calculate residuals
            residuals = y_windowed - y_fit
            rms_error = np.sqrt(np.mean(residuals**2))
            # print(f"  RMS error: {rms_error:.6e} N")
            # print(f"  Max residual: {np.abs(residuals).max():.6e} N")
            # print(f"{'='*60}\n")
            
            return [x_windowed.tolist(), y_fit.tolist(), [E_eff]]
            
        except (RuntimeError, ValueError) as e:
            # print(f"\nFITTING FAILED: {str(e)}")
            # print(f"{'='*60}\n")
            return None