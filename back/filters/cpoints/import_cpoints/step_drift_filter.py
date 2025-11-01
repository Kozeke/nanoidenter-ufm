import numpy as np
from ..cpoint_base import CpointBase


class StepDriftFilter(CpointBase):
    NAME = "StepDrift"
    DESCRIPTION = "Ratio of Variances (RoV) filter to find contact point"
    DOI = ""
    
    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("Fthreshold", "float", "Safe Threshold [nN]", 10.0)
        self.add_parameter("Xrange", "float", "X Range [nm]", 1000.0)
        self.add_parameter("windowr", "float", "Window RoV [nm]", 200.0)

    def calculate(self, x, y, metadata=None):
        """
        Returns contact point based on ratio of variances (RoV).
        :param x: Array of z-values (DOUBLE[])
        :param y: Array of force values (DOUBLE[])
        :param metadata: Dictionary containing metadata values (spring_constant, tip_radius, tip_geometry)
        :return: List of [z0, f0] as [[float, float]] or None if no valid point is found
        """
        # Convert to numpy arrays
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        
        if len(x) < 2 or len(y) < 2:
            return None

        try:
            out = self.getWeight(x, y)
            if out is False:
                return None
            zz_x, rov = out
            rov_best_ind = np.argmax(rov)
            j_rov = np.argmin((x - zz_x[rov_best_ind])**2)
            return [[float(x[j_rov]), float(y[j_rov])]]
        except Exception as e:
            print(f"StepDrift error: {e}")
            return None

    def getRange(self, x, y):
        """Get the range for RoV calculation."""
        try:
            Fthreshold = self.get_value("Fthreshold") * 1e-9  # Convert nN to N
            Xrange = self.get_value("Xrange") * 1e-9  # Convert nm to m
            
            jmax = np.argmin((y - Fthreshold) ** 2)
            jmin = np.argmin((x - (x[jmax] - Xrange)) ** 2)
            return int(jmin), int(jmax)
        except Exception:
            return False

    def getWeight(self, x, y):
        """Calculate ratio of variances (RoV) for each point."""
        out = self.getRange(x, y)
        if out is False:
            return False
        
        jmin, jmax = out
        windowr = self.get_value("windowr") * 1e-9  # Convert nm to m
        
        # Calculate step size
        if len(x) > 1:
            xstep = (x.max() - x.min()) / (len(x) - 1)
        else:
            return False
            
        win = int(windowr / xstep)
        
        # Adjust bounds
        if (len(y) - jmax) < win:
            jmax = len(y) - 1 - win
        if jmin < win:
            jmin = win
        if jmax <= jmin:
            return False
            
        rov = []
        for j in range(jmin, jmax):
            try:
                # Calculate variance ratio
                var_after = np.var(y[j+1:j+win])
                var_before = np.var(y[j-win:j])
                if var_before > 0:
                    rov.append(var_after / var_before)
                else:
                    rov.append(0)
            except:
                rov.append(0)
                
        return x[jmin:jmax], rov