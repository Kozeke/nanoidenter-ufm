import numpy as np

def rov_filter(self, x, y):
    """Returns contact point based on maximum variance ratio"""
    x = np.asarray(x)
    y = np.asarray(y)
    out = self.getWeight(x, y)
    if not out:
        return False
    zz_x, rov = out
    rov_best_ind = np.argmax(rov)
    j_rov = np.argmin(np.abs(x - zz_x[rov_best_ind]))  # Avoid squaring
    return [x[j_rov], y[j_rov]]

def getRange(self, x, y):
    """Returns min and max indices based on thresholds"""
    try:
        f_threshold = self.getValue('Fthreshold') * 1e-9
        x_range = self.getValue('Xrange') * 1e-9
        jmax = np.argmin(np.abs(y - f_threshold))
        jmin = np.argmin(np.abs(x - (x[jmax] - x_range)))
        return jmin, jmax
    except ValueError:
        return False

def getWeight(self, x, y):
    """Returns x values and variance ratios for contact point detection"""
    out = self.getRange(x, y)
    if not out:
        return False
    jmin, jmax = out
    
    # Calculate window size
    winr = self.getValue('windowr') * 1e-9
    xstep = (x.max() - x.min()) / (len(x) - 1)
    win = int(winr / xstep)
    
    # Adjust bounds
    if len(y) - jmax < win:
        jmax = len(y) - 1 - win
    if jmin < win:
        jmin = win
    if jmax <= jmin:
        return False
    
    # Pre-allocate array and use rolling window calculation
    n = jmax - jmin
    rov = np.zeros(n)
    
    # Vectorized variance calculation
    past_windows = np.lib.stride_tricks.sliding_window_view(y[jmin-win:jmax-1], win)
    future_windows = np.lib.stride_tricks.sliding_window_view(y[jmin+1:jmax+win], win)
    
    # Calculate variances and ratios
    past_vars = np.var(past_windows, axis=1)
    future_vars = np.var(future_windows, axis=1)
    np.divide(future_vars, past_vars, out=rov, where=past_vars != 0)
    
    return x[jmin:jmax], rov