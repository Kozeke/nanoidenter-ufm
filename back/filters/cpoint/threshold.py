
import numpy as np

def threshold_filter(self, x, y):
    """Returns contact point based on threshold and offset conditions"""
    # Convert to numpy arrays once
    x = np.asarray(x)
    y = np.asarray(y)
    
    # Pre-calculate constants
    yth = self.getValue('startth') * 1e-9
    offset = self.getValue('offset') * 1e-12
    x_min, x_max = x.min(), x.max()
    x_range = x_max - x_min
    
    # Early validation
    y_min = y.min()
    if yth < y_min or y_min + offset >= yth:
        return False
    
    # Find threshold and range points
    jstart = np.argmin(np.abs(y - yth))
    imin = np.argmin(np.abs(x - (x_min + x_range * self.getValue('minx') / 100)))
    imax = np.argmin(np.abs(x - (x_min + x_range * self.getValue('maxx') / 100)))
    
    # Calculate baseline and find contact point
    baseline = np.mean(y[imin:imax])  # mean is slightly faster than average
    threshold = baseline + offset
    
    # Vectorized search for contact point
    y_slice = y[:jstart+1][::-1]  # Reverse slice from start to beginning
    mask = (y_slice > threshold) & (np.roll(y_slice, 1) <= threshold)
    jcp = jstart - np.argmax(mask) if mask.any() else 0
    
    return [x[jcp], y[jcp]]