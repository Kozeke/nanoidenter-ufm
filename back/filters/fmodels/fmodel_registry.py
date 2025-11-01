# fmodel_registry.py
import duckdb
from typing import Dict
import json
import numpy as np

FMODEL_REGISTRY: Dict[str, Dict] = {}

def register_fmodel(fmodel_class):
    """Register an fmodel class in the global registry."""
    inst = fmodel_class()
    inst.create()
    udf_function_name = f"fmodel_{fmodel_class.NAME.lower()}"
    FMODEL_REGISTRY[fmodel_class.NAME.lower()] = {
        "instance": inst,
        "udf_function": udf_function_name
    }

def getJclose(x0, x):
    """Index of closest value to x0 in array x."""
    x = np.asarray(x, dtype=float)
    return int(np.argmin((x - x0) ** 2))

def getFizi(xmin, xmax, zi, fi):
    """
    Return zi, fi windowed to [xmin, xmax] (inclusive start, exclusive end).
    Handles swapped bounds and clamps to available zi range.
    """
    zi = np.asarray(zi, dtype=float)
    fi = np.asarray(fi, dtype=float)
    if zi.size == 0 or fi.size == 0 or zi.size != fi.size:
        return np.array([]), np.array([])

    # Ensure ascending bounds
    if xmax < xmin:
        xmin, xmax = xmax, xmin

    # Clamp to data range
    zmin, zmax = float(zi.min()), float(zi.max())
    xmin = max(xmin, zmin)
    xmax = min(xmax, zmax)

    # Degenerate or empty window
    if not np.isfinite(xmin) or not np.isfinite(xmax) or xmax <= xmin:
        return np.array([]), np.array([])

    jmin = getJclose(xmin, zi)
    jmax = getJclose(xmax, zi)

    # Ensure proper slicing (exclusive end); expand by 1 if identical index
    if jmax <= jmin:
        jmax = min(jmin + 1, zi.size)

    return zi[jmin:jmax], fi[jmin:jmax]

def create_fmodel_udf(fmodel_name: str, conn: duckdb.DuckDBPyConnection):
    """
    Register a DuckDB UDF for the force model.
    Signature: fn(zi: DOUBLE[], fi: DOUBLE[], params: DOUBLE[]) -> DOUBLE[][]
    Expected params include minInd/maxInd (in nm) if the model defines them.
    """
    inst = FMODEL_REGISTRY[fmodel_name.lower()]["instance"]
    udf_name = FMODEL_REGISTRY[fmodel_name.lower()]["udf_function"]

    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # zi_values
        duckdb.list_type('DOUBLE'),  # fi_values
        duckdb.list_type('DOUBLE')   # param_values
    ]

    def udf_wrapper(zi_values, fi_values, param_values):
        try:
            zi_values = np.asarray(zi_values, dtype=np.float64)
            fi_values = np.asarray(fi_values, dtype=np.float64)
            param_values = np.asarray(param_values, dtype=np.float64)

            # Map provided param_values by declared order
            expected = list(inst.parameters.keys())
            for i, pname in enumerate(expected):
                if i < param_values.size:
                    inst.parameters[pname]["default"] = float(param_values[i])

            # Window in meters (UI is nm; convert here)
            if "minInd" in inst.parameters:
                zi_min = float(inst.get_value("minInd")) * 1e-9
            else:
                zi_min = 0.0
            if "maxInd" in inst.parameters:
                zi_max = float(inst.get_value("maxInd")) * 1e-9
            else:
                zi_max = 800e-9  # sane default

            x, y = getFizi(zi_min, zi_max, zi_values, fi_values)

            # Require a minimal window to avoid ill-conditioned fits
            if x.size > 5:
                result = inst.calculate(x, y)
                return result if result is not None else None
            return None

        except Exception as e:
            print(f"Error in UDF for {fmodel_name}: {e}")
            return None

    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))
    try:
        conn.create_function(
            udf_name,
            udf_wrapper,
            udf_param_types,
            return_type=return_type,
            null_handling='SPECIAL'
        )
    except duckdb.CatalogException as e:
        if "already exists" in str(e):
            print(f"Function '{udf_name}' already exists. Skipping creation.")
        else:
            raise

    print(f"UDF {udf_name} registered.")
    
def save_fmodel_to_db(fmodel_class, conn: duckdb.DuckDBPyConnection):
    """Save fmodel metadata to the database."""
    inst = fmodel_class()
    inst.create()
    parameters_json = json.dumps(inst.parameters)
    conn.execute(
        "INSERT OR REPLACE INTO fmodels (name, description, doi, parameters) VALUES (?, ?, ?, ?)",
        (fmodel_class.NAME, fmodel_class.DESCRIPTION, fmodel_class.DOI, parameters_json)
    )
