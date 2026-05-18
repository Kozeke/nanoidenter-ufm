# fmodel_registry.py
# Registers force-model UDFs and maps runtime metadata into model instances.
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
    Return zi, fi where zi is within [xmin, xmax], using value-based masking.

    zi = xf - yf/k is NOT monotonically sorted (noise in the force signal causes
    it to jump around). Index-based slicing (getJclose + zi[jmin:jmax]) returns an
    arbitrary unsorted chunk instead of the actual requested window, producing
    garbage fits. Value masking is the only correct approach.
    """
    zi = np.asarray(zi, dtype=float)
    fi = np.asarray(fi, dtype=float)
    if zi.size == 0 or fi.size == 0 or zi.size != fi.size:
        return np.array([]), np.array([])

    if xmax < xmin:
        xmin, xmax = xmax, xmin

    if not np.isfinite(xmin) or not np.isfinite(xmax):
        return np.array([]), np.array([])

    mask = (zi >= xmin) & (zi <= xmax)
    return zi[mask], fi[mask]

def create_fmodel_udf(fmodel_name: str, conn: duckdb.DuckDBPyConnection):
    """
    Register a DuckDB UDF for the force model.
    Signature:
      fn(
        zi: DOUBLE[],
        fi: DOUBLE[],
        params: DOUBLE[],
        tip_radius: DOUBLE,
        tip_geometry: VARCHAR
      ) -> DOUBLE[][]
    Expected params include minInd/maxInd (in nm) if the model defines them.
    """
    inst = FMODEL_REGISTRY[fmodel_name.lower()]["instance"]
    udf_name = FMODEL_REGISTRY[fmodel_name.lower()]["udf_function"]

    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # zi_values
        duckdb.list_type('DOUBLE'),  # fi_values
        duckdb.list_type('DOUBLE'),  # param_values
        'DOUBLE',                    # tip_radius (m)
        'VARCHAR',                   # tip_geometry
        'DOUBLE',                    # tip_angle (degrees; 0.0 = unknown → C=1)
    ]

    def udf_wrapper(zi_values, fi_values, param_values, tip_radius, tip_geometry, tip_angle):
        try:
            zi_values = np.asarray(zi_values, dtype=np.float64)
            fi_values = np.asarray(fi_values, dtype=np.float64)
            param_values = np.asarray(param_values, dtype=np.float64)

            # Map provided param_values by declared order
            expected = list(inst.parameters.keys())
            for i, pname in enumerate(expected):
                if i < param_values.size:
                    inst.parameters[pname]["default"] = float(param_values[i])

            # Stores per-call tip radius fetched from DB for geometry-aware models.
            inst.runtime_tip_radius = float(tip_radius) if tip_radius is not None else 1e-5
            # Stores per-call tip geometry fetched from DB for geometry-aware models.
            inst.runtime_tip_geometry = str(tip_geometry).lower() if tip_geometry else "sphere"
            # Stores per-call tip angle (degrees); 0.0 signals unknown → C=1 approximation.
            inst.runtime_tip_angle = float(tip_angle) if tip_angle is not None else 0.0

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
            if x.size > 2:
                result = inst.calculate(x, y)
                return result if result is not None else None
            return None

        except Exception as e:
            # print(f"Error in UDF for {fmodel_name}: {e}")
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
    except (duckdb.CatalogException, duckdb.NotImplementedException) as e:
        msg = str(e).lower()
        if "already exists" in msg or "already created" in msg:
            # print(f"Function '{udf_name}' already exists. Skipping creation.")
            pass
        else:
            raise

    # print(f"UDF {udf_name} registered.")
    
def save_fmodel_to_db(fmodel_class, conn: duckdb.DuckDBPyConnection):
    """Save fmodel metadata to the database."""
    inst = fmodel_class()
    inst.create()
    parameters_json = json.dumps(inst.parameters)
    conn.execute(
        "INSERT OR REPLACE INTO fmodels (name, description, doi, parameters) VALUES (?, ?, ?, ?)",
        (fmodel_class.NAME, fmodel_class.DESCRIPTION, fmodel_class.DOI, parameters_json)
    )