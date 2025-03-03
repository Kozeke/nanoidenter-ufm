import numpy as np

def threshold_filter(x, y, starting_threshold=2, min_x=1, max_x=60, force_offset=0):
    """
    Returns contact point based on threshold and offset conditions.

    Parameters:
    - x: Array of z-values
    - y: Array of force values
    - starting_threshold: Initial threshold in nanoNewtons (default: 2 nN)
    - min_x: Minimum x range percentage (default: 1%)
    - max_x: Maximum x range percentage (default: 60%)
    - force_offset: Force offset in picoNewtons (default: 0 pN)
    """
    # Convert to numpy arrays once
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    
    # Pre-calculate constants
    yth = starting_threshold * 1e-9  # Convert nN to N
    offset = force_offset * 1e-12    # Convert pN to N
    x_min, x_max = x.min(), x.max()
    x_range = x_max - x_min
    
    # Early validation
    y_min = y.min()
    if yth < y_min or y_min + offset >= yth:
        return False
    
    # Find threshold and range points
    jstart = np.argmin(np.abs(y - yth))
    imin = np.argmin(np.abs(x - (x_min + x_range * min_x / 100)))
    imax = np.argmin(np.abs(x - (x_min + x_range * max_x / 100)))
    
    # Calculate baseline and find contact point
    baseline = np.mean(y[imin:imax])  # mean is slightly faster than average
    threshold = baseline + offset
    
    # Vectorized search for contact point
    y_slice = y[:jstart+1][::-1]  # Reverse slice from start to beginning
    mask = (y_slice > threshold) & (np.roll(y_slice, 1) <= threshold)
    jcp = jstart - np.argmax(mask) if mask.any() else 0
    
    return [[float(x[jcp]), float(y[jcp])]]  # Ensure float output