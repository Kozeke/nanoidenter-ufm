import numpy as np

def calculate(self, x, y):
    # Create working copy of y and ensure x is numpy array
    worky = np.copy(y)
    x = np.asarray(x)
    
    # Find target index for zero range
    xtarget = np.min(x) + self.getValue('ZeroRange') * 1e-9
    jtarget = np.argmin(np.abs(x - xtarget))
    
    # Linear fit based on direction of x
    if x[0] < x[-1]:
        xlin, ylin = x[:jtarget], worky[:jtarget]
    else:
        xlin, ylin = x[jtarget:], worky[jtarget:]
    
    # Calculate linear fit and subtract from working data
    m, q = np.polyfit(xlin, ylin, 1)
    worky = worky - (m * x + q)
    
    # Calculate differences and midpoints efficiently
    differences = (worky[1:] + worky[:-1]) / 2
    midpoints = np.unique(differences)
    positive_midpoints = midpoints[midpoints > 0]
    
    # Early return if no positive midpoints
    if len(positive_midpoints) == 0:
        return False
        
    # Calculate crossings using vectorized operations
    crossings = np.sum(np.logical_and(worky[1:] > positive_midpoints[:, None],
                                    worky[:-1] < positive_midpoints[:, None]), axis=1)
    
    # Find candidate with exactly one crossing
    candidates = np.where(crossings == 1)[0]
    if len(candidates) == 0:
        return False
        
    # Get inflection point and corresponding index
    inflection = positive_midpoints[candidates[0]]
    jcpguess = np.argmin(np.abs(differences - inflection)) + 1
    
    return [x[jcpguess], y[jcpguess]]