# from scipy.optimize import curve_fit
# import numpy as np

# def getJclose(x0, x):
#     x = np.array(x)
#     return np.argmin((x - x0) ** 2)

# def getFizi(xmin, xmax, zi, fi):
#     jmin = getJclose(xmin, zi)
#     jmax = getJclose(xmax, zi)
#     return np.array(zi[jmin:jmax]), np.array(fi[jmin:jmax])

# def theoryHertz(z_values, force_values, elastic, zi_min, zi_max):
#     print("theory Hertz", z_values, force_values)
#     poisson = 10
#     tip_geometry = 'sphere'
#     radius = 0.5
#     angle = 1
#     zi_min = 0
#     zi_max = 800
#     elastic = 150
#     x, y_raw = getFizi(zi_min, zi_max, z_values, force_values)
#     print("got fizi", x, y_raw)
#     if tip_geometry == 'sphere':
#         R = radius
#         res = (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(R * x ** 3)
#         print(res)
#         return x, res
#     elif tip_geometry == 'pyramid':
#         ang = angle
#         return 0.7453 * ((elastic * np.tan(ang * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
#     elif tip_geometry == 'cylinder':
#         R = radius
#         return (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (R * x)
#     elif tip_geometry == 'cone':
#         ang = angle
#         return (2.0 / 1.0) * ((elastic * np.tan(ang * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
#     else:
#         raise Exception('No data for the tip defined')

# def calculate(self, x, y):
#     print("calchertz")
#     if len(x)>5:
#         poisson = self.getValue('poisson')
#         try:
#             popt, pcov = curve_fit(lambda x, elastic: self.theory(x, elastic), x, y, p0=[1000], maxfev=1000)
#         except RuntimeError:
#             return False
#         return popt


from scipy.optimize import curve_fit
import numpy as np
import duckdb

def getJclose(x0, x):
    print("getJclose", x0, x)
    x = np.array(x)
    return np.argmin((x - x0) ** 2)

def getFizi(xmin, xmax, zi, fi):
    print("getfizi")
    jmin = getJclose(xmin, zi)
    jmax = getJclose(xmax, zi)
    print(jmin, jmax)
    return np.array(zi[jmin:jmax]), np.array(fi[jmin:jmax])

def theoryHertz(x, elastic, tip_geometry='sphere', radius=0.5, poisson=0.5):
    """Standalone theory function for DuckDB"""
    print("theory hertz", elastic)
    x = np.array(x)
    if tip_geometry == 'sphere':
        return (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(radius * x ** 3)
    elif tip_geometry == 'pyramid':
        return 0.7453 * ((elastic * np.tan(radius * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
    elif tip_geometry == 'cylinder':
        return (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (radius * x)
    elif tip_geometry == 'cone':
        return (2.0 / 1.0) * ((elastic * np.tan(radius * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
    else:
        raise Exception('No data for the tip defined')



def calc_fmodels(zi_values, fi_values, zi_min, zi_max, model='hertz', poisson=0.5):
    """
    Calculate force models for DuckDB registration
    Args:
        zi_values: List of indentation values
        fi_values: List of force values
        zi_min: Minimum indentation (default 0)
        zi_max: Maximum indentation (default 800)
        model: Model type ('hertz', 'hertzEffective', or 'driftedHertz')
        poisson: Poisson's ratio (default 0.5)
    Returns:
        List[List[Double]]: [[x values], [fitted y values]]
    """
    print("calc_fmodels")
    tip_geometry = 'sphere'
    radius = 0.5
    
    try:
        # Convert input lists to numpy arrays
        zi_values = np.array(zi_values)
        fi_values = np.array(fi_values)
        
        # Get filtered data
        x, y = getFizi(zi_min * 1e-9, zi_max * 1e-9, zi_values, fi_values)
        print("res", len(x), len(y))
        
        if len(x) > 5:
            print("lenx>5", x)
            # Select fitting function based on model
            model_functions = {
                'hertz': theoryHertz,
                'hertzEffective': theoryHertzEffective,
                'driftedHertz': theoryHertzLine
            }
            
            theory_func = model_functions.get(model, theoryHertz)  # Default to hertz if invalid model
            
            # Define fitting function with fixed parameters
            def fit_func(x_local, elastic):
                return theory_func(x_local, elastic, tip_geometry, radius, poisson)
            
            # Perform curve fitting
            popt, _ = curve_fit(
                fit_func,
                x,
                y,
                p0=[1000],
                maxfev=1000
            )
            
            # Calculate fitted values
            y_fit = theory_func(x, popt[0], tip_geometry, radius, poisson)
            
            # Return as list of lists for DuckDB
            return [x.tolist(), y_fit.tolist()]
        else:
            return [x.tolist(), [0] * len(x)]  # Return zeros if not enough points
            
    except Exception:
        # Return null-like result on error
        return [x.tolist() if 'x' in locals() else [], []]
    
    
def theoryHertzEffective(x, elastic, tip_geometry='sphere', radius=0.5, poisson=0.5):
    """Standalone theory function for DuckDB with effective Hertz model"""
    x = np.array(x)
    if tip_geometry == 'sphere':
        return (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(radius * x ** 3)
    elif tip_geometry == 'pyramid':
        return 0.7453 * ((elastic * np.tan(radius * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
    elif tip_geometry == 'cylinder':
        return (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (radius * x)
    elif tip_geometry == 'cone':
        return (2.0 / 1.0) * ((elastic * np.tan(radius * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
    else:
        raise Exception('No data for the tip defined')

def theoryHertzLine(x, elastic, tip_geometry='sphere', radius=0.5, poisson=0.5):
    """Standalone theory function for DuckDB with drifted Hertz model"""
    x = np.array(x)
    # Note: For the drifted model, we'll need an additional parameter 'm' for the linear drift
    # Since it wasn't in the original signature, we'll set a default value
    m = 0.0  # Default drift slope, can be adjusted or made a parameter if needed
    
    if tip_geometry == 'sphere':
        return m * x + (4.0 / 3.0) * (elastic / (1 - poisson ** 2)) * np.sqrt(radius * x ** 3)
    elif tip_geometry == 'pyramid':
        return m * x + 0.7453 * ((elastic * np.tan(radius * np.pi / 180.0)) / (1 - poisson ** 2)) * x**2
    elif tip_geometry == 'cylinder':
        return m * x + (2.0 / 1.0) * (elastic / (1 - poisson ** 2)) * (radius * x)
    elif tip_geometry == 'cone':
        return m * x + (2.0 / 1.0) * ((elastic * np.tan(radius * np.pi / 180.0)) / (np.pi * (1 - poisson ** 2))) * x**2
    else:
        raise Exception('No data for the tip defined')