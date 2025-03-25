from scipy.optimize import curve_fit
import numpy as np

def theoryHertzEffective(self, x, elastic):
    tip_geometry = self.curve.tip['geometry']
    
    if tip_geometry == 'sphere':
        R = self.curve.tip['radius']
        return (4.0 / 3.0) * (elastic) * np.sqrt(R * x ** 3)
    elif tip_geometry == 'pyramid':
        ang = self.curve.tip['angle']
        return 0.7453 * ((elastic * np.tan(ang * np.pi / 180.0))) * x**2
    elif tip_geometry == 'cylinder':
        R = self.curve.tip['radius']
        return (2.0 / 1.0) * (elastic) * (R * x)
    elif tip_geometry == 'cone':
        ang = self.curve.tip['angle']
        return (2.0 / 1.0) * ((elastic * np.tan(ang * np.pi / 180.0)) / (np.pi)) * x**2
    else:
        raise Exception('No data for the tip defined')

def calculate(self, x, y):
    print("calchertz effective")
    try:
        popt, pcov = curve_fit(lambda x, elastic: self.theory(x, elastic), x, y, p0=[1000], maxfev=1000)
    except RuntimeError:
        return False
    return popt