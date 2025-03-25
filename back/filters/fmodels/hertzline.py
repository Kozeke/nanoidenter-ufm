from scipy.optimize import curve_fit
import numpy as np

def theoryHertzLine(x, poisson, E, m, tip_geometry, R=None, ang=None):
    if tip_geometry == 'sphere':
        return m * x + (4.0 / 3.0) * (E / (1 - poisson ** 2)) * np.sqrt(R * x ** 3)
    elif tip_geometry == 'pyramid':
        return m * x + 0.7453 * ((E * np.tan(ang * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
    elif tip_geometry == 'cylinder':
        return m * x + (2.0 / 1.0) * (E / (1 - poisson ** 2)) * (R * x)
    elif tip_geometry == 'cone':
        return m * x + (2.0 / 1.0) * ((E * np.tan(ang * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
    else:
        raise ValueError('No data for the tip defined')

def calculate(x, y, poisson, tip_geometry, R=None, ang=None):
    print("Calculating Drifted Hertz Model Fit")
    try:
        popt, pcov = curve_fit(
            lambda x, E, m: theoryHertzLine(x, poisson, E, m, tip_geometry, R, ang),
            x, y, p0=[1000, 1], maxfev=1000
        )
    except RuntimeError:
        return False
    return popt