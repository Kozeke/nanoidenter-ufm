from scipy.optimize import curve_fit
from ..emodel_base import EmodelBase
import numpy as np

class SigmoidModel(EmodelBase):
    NAME = "SigmoidNEW"
    DESCRIPTION = "Fit with a generic sigmoidal (logistic) function"
    DOI = ""
    PARAMETERS = {"EH [Pa]": "Higher modulus", "EL [Pa]": "Lower modulus", "T [nm]": "Thickness", "k [nm]": "Sharpness (width)"}

    def create(self):
        """Define the filter's parameters for the UI."""
        self.add_parameter("maxInd", "float", "Max indentation [nm]", 800)
        self.add_parameter("minInd", "float", "Min indentation [nm]", 0)

    def theory(self, x, *parameters):
        """
        Sigmoidal model: EL + (EH - EL) / (1 + exp(-4 * (x - T) / k))
        :param x: Indentation depth in METERS
        :param parameters: [EH, EL, T, k]
            EH: higher (surface) modulus [Pa]
            EL: lower (bulk) modulus [Pa]
            T:  transition depth [m]  -- stored/guessed in meters
            k:  sharpness / width [m] -- stored/guessed in meters
        :return: Theoretical E-spectrum values [Pa]
        """
        EH, EL, T, k = parameters
        A = EH - EL
        return EL + A / (1 + np.exp(-4.0 * (x - T) / k))

    def calculate(self, x, y):
        """
        Fit the sigmoidal model to the elasticity spectrum.

        Args:
            x: Indentation depth array in METERS  (from calc_elspectra Ze output)
            y: Elastic modulus array in PASCALS   (from calc_elspectra E  output)

        Returns:
            [x_fit, y_fit, [EH, EL, T_nm, k_nm]] where T and k are reported in nm,
            or None if fitting fails.
        """
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        if x.size < 4 or y.size < 4 or x.size != y.size:
            return None
        if not np.any(np.isfinite(x)) or not np.any(np.isfinite(y)):
            return None

        # Snapshot windowing parameters NOW (thread-safe: capture before any other
        # thread can mutate self.parameters)
        max_ind_nm = float(self.get_value("maxInd"))
        min_ind_nm = float(self.get_value("minInd"))
        min_ind_m  = min_ind_nm * 1e-9
        max_ind_m  = max_ind_nm * 1e-9

        # Window the data to the requested indentation range
        mask = (x >= min_ind_m) & (x <= max_ind_m)
        xw = x[mask]
        yw = y[mask]

        if xw.size < 4:
            return None

        # ----------------------------------------------------------------
        # Build data-driven initial guesses so curve_fit converges reliably
        # regardless of tip geometry / sample stiffness.
        #
        # The sigmoid transitions from EH (surface, high indentation end of
        # the spectrum for stiff surface) to EL (bulk, low indentation end).
        # Use percentiles rather than min/max to be robust to outliers.
        # ----------------------------------------------------------------
        EH_guess = float(np.percentile(yw, 90))   # near-surface (high-E) side
        EL_guess = float(np.percentile(yw, 10))   # bulk (low-E) side
        if EH_guess <= EL_guess:
            # Spectrum may be decreasing or flat; swap so A > 0
            EH_guess, EL_guess = EL_guess, EH_guess

        T_guess  = float(np.median(xw))           # transition at midpoint [m]
        # Sharpness: ~20 % of the windowed range is a reasonable starting width
        k_guess  = float((xw[-1] - xw[0]) * 0.20)
        if k_guess <= 0:
            k_guess = 50e-9  # 50 nm fallback

        p0 = [EH_guess, EL_guess, T_guess, k_guess]

        # theory_local is a pure closure — it never reads self.get_value(),
        # so it is fully thread-safe.
        def theory_local(x, EH, EL, T, k):
            A = EH - EL
            return EL + A / (1.0 + np.exp(-4.0 * (x - T) / k))

        try:
            popt, _ = curve_fit(
                theory_local, xw, yw,
                p0=p0,
                maxfev=20000,
                # Loose bounds: moduli > 0, T and k must be positive
                bounds=(
                    [0,    0,    0,      0],
                    [np.inf, np.inf, np.inf, np.inf]
                )
            )
        except (RuntimeError, ValueError) as e:
            # print(f"Sigmoid fitting failed: {e}")
            return None

        EH_fit, EL_fit, T_fit_m, k_fit_m = popt
        y_fit = theory_local(xw, *popt)

        # Report T and k in nm in the parameter vector so the UI shows
        # human-readable values (same convention as BilayerModel's d [nm])
        params = [float(EH_fit), float(EL_fit), float(T_fit_m * 1e9), float(k_fit_m * 1e9)]

        return [xw.tolist(), y_fit.tolist(), params]