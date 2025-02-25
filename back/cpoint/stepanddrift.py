
from scipy.signal import savgol_filter
import numpy as np

def calculate(self, x, y):
    """Returns contact point based on derivative thresholds"""
    # Convert to numpy arrays once
    x = np.asarray(x)
    y = np.asarray(y)
    
    # Pre-calculate constants
    window = self.getValue('window')
    threshold = self.getValue('threshold') / 1e12
    thr_ratio = self.getValue('thratio') * self.getValue('threshold') / 1e14
    
    # Calculate derivative with Savitzky-Golay filter
    dy = savgol_filter(y, window, 3, deriv=1)
    
    # Find first point exceeding threshold
    j = np.argmax(dy > threshold)
    if j == 0 and dy[0] <= threshold:  # No point found
        return [x[0], y[0]]  # Return first point as fallback
    
    # Find point dropping below ratio threshold
    # Use slice and argmax for reverse search
    dy_slice = dy[:j+1][::-1]  # Reverse slice up to j
    k_rel = np.argmax(dy_slice < thr_ratio)
    k = j - k_rel if k_rel > 0 or dy_slice[0] < thr_ratio else j
    
    return [x[k], y[k]]