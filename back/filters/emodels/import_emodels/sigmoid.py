from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np

class SigmoidModel(EmodelBase):
    NAME = "Sigmoid"
    DESCRIPTION = "Fit with a generic sigmoidal (logistic) function"
    DOI = ""
    PARAMETERS = {"EH [Pa]": "Higher modulus", "EL [Pa]": "Lower modulus", "T [nm]": "Thickness", "k [Pa/nm]": "Sharpness"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("Smooth", "int", "Upper Percentile threshold", 100, options={"min": 60, "max": 100})
        self.add_parameter("Lower", "int", "Lower Percentile threshold", 10, options={"min": 5, "max": 50})

    def theory(self, x, *parameters):
        EH, EL, T, k = parameters
        A = EH - EL
        return EL + A / (1 + np.exp(-4 * (x - T) / k))

    def calculate(self, x, y):
        # print("Sigmoid calculate called with x length:", len(x), "y length:", len(y))
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        if len(x) < 2 or len(y) < 2:
            # print("Sigmoid: len(x)<2", len(x), len(y))
            return None

        # theory_local is a pure closure — never reads self.get_value(),
        # so it is fully thread-safe (same formula as original theory()).
        def theory_local(x, EH, EL, T, k):
            A = EH - EL
            return EL + A / (1 + np.exp(-4 * (x - T) / k))

        try:
            popt, pcov = curve_fit(theory_local, x, y, p0=[1000, 200000, 1e-6, 1e-6], maxfev=10000)
            # print("Sigmoid popt:", popt)
            params = list(map(float, popt))  # [EH, EL, T, k]
            # print("Sigmoid params:", params)
        except RuntimeError as e:
            # print("Sigmoid fitting failed:", e)
            return None

        # Reject physically meaningless fits where any parameter is negative
        # (matches original: "for p in popt: if p<0: return False")
        for p in popt:
            if p < 0:
                return None

        y_fit = theory_local(x, *popt)
        # print("Sigmoid returning:", len(popt), "parameters")
        return [x.tolist(), y_fit.tolist(), params]