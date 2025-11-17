from ..cpoint_base import CpointBase
import numpy as np
from scipy.signal import savgol_filter


class AutothreshFilter(CpointBase):
    NAME = "Autothresh"
    DESCRIPTION = "Identify the CP by thresholding it over different degrees"
    DOI = ""

    def create(self):
        # Same semantics as original:
        # "Range to set the zero [nm]" with default 500
        self.add_parameter(
            "zeroRange",
            "float",
            "Range to set the zero [nm]",
            500.0,
        )

    def calculate(self, x, y, metadata=None):
        """
        Port of SoftMech AutoThreshold CP finder.

        x: Z (meters)
        y: Force (Newtons)
        Returns: [[z_cp, f_cp]] or None
        """
        if x is None or y is None:
            return None



        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)



        if x.size < 4 or y.size < 4 or x.size != y.size:
            return None



        # Ensure increasing X order (SoftMech assumes this)
        if x[0] > x[-1]:
            x = x[::-1]
            y = y[::-1]



        # ZeroRange in nm from *start* of curve
        zero_range_nm = float(self.get_value("zeroRange"))
        zero_range_m = zero_range_nm * 1e-9



        # Target x for baseline window
        xtarget = x[0] + zero_range_m
        jtarget = int(np.argmin(np.abs(x - xtarget)))



        if jtarget <= 1 or jtarget >= len(x) - 1:
            # Can't form a sensible baseline region
            return None



        # Baseline: linear fit on the pre-contact region [0 : jtarget]
        xlin = x[:jtarget]
        ylin = y[:jtarget]
        if xlin.size < 2:
            return None



        m, q = np.polyfit(xlin, ylin, 1)
        worky = y - (m * x + q)



        # Smooth to reduce noise (typical Savitzky–Golay settings)
        # Use an odd window length, limited by data length
        n = worky.size
        # choose a moderate window; soften near boundaries
        win = min(61, n - (1 - (n % 2)))  # nearest odd <= n
        if win < 5:  # fallback minimum
            win = min(5, n - (1 - (n % 2)))
        if win < 5:
            return None



        smoothed = savgol_filter(worky, win, 2, mode="interp")



        # Differences and midpoints (same structure as original)
        differences = (smoothed[1:] + smoothed[:-1]) / 2.0
        midpoints = np.array(list(set(differences)), dtype=np.float64)
        midpoints.sort()



        positive_midpoints = midpoints[midpoints > 0.0]
        if positive_midpoints.size == 0:
            return None



        # Now build a "crossings" logic similar to original:
        # for each candidate threshold, record how many transitions we get
        crossings = []
        for th in positive_midpoints:
            # 1 where (>th), 0 otherwise
            mask = (differences > th).astype(int)
            # transitions from 0 -> 1
            trans = (mask[1:] - mask[:-1]) == 1
            crossings.append(np.count_nonzero(trans))



        crossings = np.asarray(crossings, dtype=int)



        # candidates where we have exactly one crossing
        candidates = np.where(crossings == 1)
        if candidates[0].size == 0:
            return None



        # Pick first candidate threshold
        inflection = positive_midpoints[candidates[0][0]]



        # Contact-point index: closest midpoint to that inflection
        jcpguess = int(np.argmin(np.abs(differences - inflection)) + 1)
        if jcpguess < 0 or jcpguess >= x.size:
            return None



        # Return z_cp, f_cp from *original* signal
        xcp = float(x[jcpguess])
        ycp = float(y[jcpguess])



        return [[xcp, ycp]]
