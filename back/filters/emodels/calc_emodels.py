from scipy.optimize import curve_fit
import numpy as np

def getJclose(x0, x):
    # print("getJclose", x0, x)
    x = np.array(x)
    return np.argmin((x - x0) ** 2)

def getEze(xmin, xmax, zi, fi):
    # print("getEze")
    jmin = getJclose(xmin, zi)
    jmax = getJclose(xmax, zi)
    # print(jmin, jmax)
    return np.array(zi[jmin:jmax]), np.array(fi[jmin:jmax])

# Bilayer Model
def theory_bilayer(x, elastic_high, elastic_low, thickness, lambda_coefficient=1.74, radius=0.5, poisson=0.5):
    """Bilayer model theory"""
    x = np.array(x)
    d = thickness * 1e-9  # Convert thickness to meters (assuming input in nm)
    phi = np.exp(-lambda_coefficient * np.sqrt(radius * x) / d)
    return elastic_low + (elastic_high - elastic_low) * phi

def calculate_bilayer(x, y):
    """Calculate parameters for bilayer model"""
    try:
        popt, _ = curve_fit(
            lambda x_local, elastic_high, elastic_low, thickness: theory_bilayer(
                x_local, elastic_high, elastic_low, thickness, 
                lambda_coefficient=1.74, radius=0.5, poisson=0.5
            ),
            x, y,
            p0=[100000, 1000, 1000],  # elastic_high, elastic_low, thickness
            maxfev=10000
        )
        return popt  # [elastic_high, elastic_low, thickness]
    except RuntimeError:
        return False

# Linemax Model
def theory_linemax(x, elastic, poisson=0.5):
    """Linemax model theory - constant value"""
    x = np.array(x)
    return elastic * np.ones(len(x)) / (1 - poisson ** 2)

def calculate_linemax(x, y, upper_percentile=100, lower_percentile=10):
    """Calculate parameters for linemax model"""
    full = y  # Assuming full curve data is y; adjust if you have access to broader data
    if upper_percentile < 100:
        threshold = np.percentile(full, upper_percentile)
        maxi = np.average(full[full > threshold])
    else:
        maxi = np.max(full)
    min_th = np.percentile(full, lower_percentile)
    mini = np.average(full[full < min_th])
    # Return average of y as elastic, plus statistical measures (though only elastic is used in theory)
    return [np.average(y)]  # Only elastic is used in theory_linemax; others for reference

# Constant Model (Updated)
def theory_constant(x, elastic, poisson=0.5):
    """Constant model theory"""
    x = np.array(x)
    return elastic * np.ones(len(x)) / (1 - poisson ** 2)

def calculate_constant(x, y):
    """Calculate parameters for constant model"""
    return [np.average(y)]  # Matches your updated version

# Sigmoid Model (Updated)
def theory_sigmoid(x, elastic_high, elastic_low, transition_point, transition_width, poisson=0.5):
    """Sigmoid model theory"""
    x = np.array(x)
    A = elastic_high - elastic_low
    return elastic_low + A / (1 + np.exp(-4 * (x - transition_point) / transition_width)) / (1 - poisson ** 2)

def calculate_sigmoid(x, y, upper_percentile=100, lower_percentile=10):
    """Calculate parameters for sigmoid model"""
    try:
        popt, _ = curve_fit(
            lambda x_local, elastic_high, elastic_low, transition_point, transition_width: theory_sigmoid(
                x_local, elastic_high, elastic_low, transition_point, transition_width, poisson=0.5
            ),
            x, y,
            p0=[1000, 200000, 1e-6, 1e-6],  # EH, EL, T, k
            maxfev=10000
        )
        for p in popt:
            if p < 0:  # Check for negative parameters
                return False
        return popt  # [elastic_high, elastic_low, transition_point, transition_width]
    except RuntimeError:
        return False

def calc_emodels(ze_values, fe_values, ze_min, ze_max, model='bilayer', poisson=0.5):
    """
    Calculate elastic models for DuckDB registration
    Args:
        ze_values: List of indentation values
        fe_values: List of force values
        ze_min: Minimum indentation (default 0)
        ze_max: Maximum indentation (default 800)
        model: Model type ('bilayer', 'linemax', 'constant', or 'sigmoid')
        poisson: Poisson's ratio (default 0.5)
    Returns:
        List[List[Double]]: [[x values], [fitted y values]]
    """
    print("calc_emodels")
    
    try:
        ze_values = np.array(ze_values)
        fe_values = np.array(fe_values)
        
        x, y = getEze(ze_min * 1e-9, ze_max * 1e-9, ze_values, fe_values)
        # print("res", len(x), len(y))
        
        if len(x) > 5:
            # print("lenx>5", x)
            model_calculators = {
                'bilayer': (theory_bilayer, calculate_bilayer),
                'linemax': (theory_linemax, calculate_linemax),
                'constant': (theory_constant, calculate_constant),
                'sigmoid': (theory_sigmoid, calculate_sigmoid)
            }
            
            theory_func, calc_func = model_calculators.get(model, (theory_bilayer, calculate_bilayer))
            
            if model == 'bilayer':
                popt = calc_func(x, y)
                if popt is False:
                    return [x.tolist(), [0] * len(x)]
                y_fit = theory_func(x, popt[0], popt[1], popt[2], 
                                  lambda_coefficient=1.74, radius=0.5, poisson=poisson)
            
            elif model == 'linemax':
                popt = calc_func(x, y, upper_percentile=100, lower_percentile=10)
                y_fit = theory_func(x, popt[0], poisson=poisson)
            
            elif model == 'constant':
                popt = calc_func(x, y)
                y_fit = theory_func(x, popt[0], poisson=poisson)
            
            elif model == 'sigmoid':
                popt = calc_func(x, y, upper_percentile=100, lower_percentile=10)
                if popt is False:
                    return [x.tolist(), [0] * len(x)]
                y_fit = theory_func(x, popt[0], popt[1], popt[2], popt[3], poisson=poisson)
            
            else:
                popt = calc_func(x, y)  # Default to bilayer
                if popt is False:
                    return [x.tolist(), [0] * len(x)]
                y_fit = theory_func(x, popt[0], popt[1], popt[2], 
                                  lambda_coefficient=1.74, radius=0.5, poisson=poisson)
            
            return [x.tolist(), y_fit.tolist()]
        else:
            return [x.tolist(), [0] * len(x)]
            
    except Exception as e:
        print(f"Error in calc_emodels: {e}")
        return [x.tolist() if 'x' in locals() else [], []]