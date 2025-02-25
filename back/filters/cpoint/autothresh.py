import numpy as np

def autothresh_filter(x, y):
    """
    Apply autotresh filter to find contact point.
    Returns [z_cp, f_cp] as a DOUBLE[][] or None if no valid point is found.
    """
    if len(x) < 2 or len(y) < 2:
        return None  # Return None instead of [[]]

    # Ensure inputs are numpy arrays
    x = np.asarray(x, dtype=np.float64)
    worky = np.copy(np.asarray(y, dtype=np.float64))

    # Find target index for zero range
    xtarget = np.min(x)
    jtarget = np.argmin(np.abs(x - xtarget))

    if jtarget == 0 or jtarget >= len(x):
        return None

    # Linear fit based on direction of x
    if x[0] < x[-1]:
        xlin, ylin = x[:jtarget], worky[:jtarget]
    else:
        xlin, ylin = x[jtarget:], worky[jtarget:]

    if len(xlin) < 2 or len(ylin) < 2:
        return None

    # Compute linear fit and subtract from y-values
    m, q = np.polyfit(xlin, ylin, 1)
    worky -= (m * x + q)

    # Compute midpoints efficiently
    differences = (worky[1:] + worky[:-1]) / 2
    midpoints = np.unique(differences)

    # Filter for positive midpoints
    positive_midpoints = midpoints[midpoints > 0]
    if len(positive_midpoints) == 0:
        return None

    # Identify crossings in y
    crossings = np.sum(
        np.logical_and(worky[1:] > positive_midpoints[:, None],
                       worky[:-1] < positive_midpoints[:, None]), axis=1)

    # Find candidates where exactly one crossing occurs
    candidates = np.where(crossings == 1)[0]
    if len(candidates) == 0:
        return None

    # Select first valid inflection point
    inflection = positive_midpoints[candidates[0]]
    jcpguess = np.argmin(np.abs(differences - inflection)) + 1

    if jcpguess >= len(x):
        return None

    # Return contact point as [z, f], ensuring non-empty
    return [[x[jcpguess], y[jcpguess]]]