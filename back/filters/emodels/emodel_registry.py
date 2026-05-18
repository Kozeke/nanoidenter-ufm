import duckdb
from typing import Dict
import json
from pathlib import Path
import numpy as np

EMODEL_REGISTRY: Dict[str, Dict] = {}

def register_emodel(emodel_class):
    """Register an emodel class in the global registry."""
    emodel_instance = emodel_class()  # Calls EmodelBase.__init__, sets self.parameters
    emodel_instance.create()          # Populates self.parameters
    udf_function_name = f"emodel_{emodel_class.NAME.lower()}"  # e.g., "emodel_sigmoid"
    EMODEL_REGISTRY[emodel_class.NAME.lower()] = {
        "instance": emodel_instance,
        "udf_function": udf_function_name
    }

def getJclose(x0, x):
    """Find the index of the closest value to x0 in array x."""
    x = np.asarray(x, dtype=float)
    if x.size == 0:
        return 0  # Return 0 if empty array
    return int(np.argmin((x - x0) ** 2))

def getEizi(xmin, xmax, zi, ei):
    """
    Return zi, ei where zi is within [xmin, xmax], using value-based masking.

    The elasticity spectrum Ze (output of calc_elspectra) is computed on an
    interpolated 1 nm grid, so it IS monotonic. However, using value masking
    is still correct and consistent with getFizi, and guards against any
    edge-case where the grid is non-monotonic near the boundaries.
    """
    zi = np.asarray(zi, dtype=float)
    ei = np.asarray(ei, dtype=float)
    if zi.size == 0 or ei.size == 0 or zi.size != ei.size:
        return np.array([]), np.array([])

    # Ensure ascending bounds
    if xmax < xmin:
        xmin, xmax = xmax, xmin

    if not np.isfinite(xmin) or not np.isfinite(xmax):
        return np.array([]), np.array([])

    # Value-based mask: select only points whose zi is inside [xmin, xmax]
    mask = (zi >= xmin) & (zi <= xmax)
    return zi[mask], ei[mask]


def create_emodel_udf(emodel_name: str, conn: duckdb.DuckDBPyConnection):
    emodel_info = EMODEL_REGISTRY[emodel_name.lower()]
    emodel_instance = emodel_info["instance"]
    udf_name = emodel_info["udf_function"]

    # Define parameter types: ze_values, fe_values, and a single DOUBLE[] for all parameters
    udf_param_types = [
        duckdb.list_type('DOUBLE'),  # ze_values
        duckdb.list_type('DOUBLE'),  # fe_values
        duckdb.list_type('DOUBLE')   # param_values (array of all parameters)
    ]

    def udf_wrapper(ze_values, fe_values, param_values):
        """
        DuckDB UDF wrapper for emodel fitting.

        THE SHARED-INSTANCE PROBLEM (root cause of the Linux sequential bug):
        -----------------------------------------------------------------------
        emodel_instance is a singleton created once at registration time.
        DuckDB calls this wrapper row-by-row in the same thread (sequential mode).
        The old code wrote `emodel_instance.parameters[k]["default"] = v` and
        then called `emodel_instance.calculate(x, y)` which internally called
        `self.get_value(...)` — but by the time curve_fit's internal iterations
        ran, another row's call could have already overwritten those defaults.

        THE FIX:
        --------
        1. We still read ze_min/ze_max from param_values directly (no mutation
           needed for windowing — we just compute the values locally).
        2. We pass `param_values` as an explicit argument to `calculate()` so
           that BilayerModel.calculate() (and any other model that opts in) can
           snapshot all parameters into local variables before calling curve_fit,
           without ever touching self.get_value() during the fit.
        3. We still mutate the instance for models that don't accept params= yet,
           but the critical models (Bilayer) are now params-aware.
        """
        try:
            ze_values   = np.array(ze_values,   dtype=np.float64)
            fe_values   = np.array(fe_values,   dtype=np.float64)
            param_values = np.array(param_values, dtype=np.float64)

            # --- Read window bounds directly from param_values ---
            # (avoids needing to mutate the instance just to get ze_min/ze_max)
            expected_params = list(emodel_instance.parameters.keys())
            param_dict = {}
            for i, param_name in enumerate(expected_params):
                if i < len(param_values):
                    param_dict[param_name] = float(param_values[i])

            ze_min = param_dict.get("minInd", emodel_instance.get_value("minInd") if "minInd" in emodel_instance.parameters else 0.0) * 1e-9
            ze_max = param_dict.get("maxInd", emodel_instance.get_value("maxInd") if "maxInd" in emodel_instance.parameters else 800.0) * 1e-9

            x, y = getEizi(ze_min, ze_max, ze_values, fe_values)

            # Guard: if filtering resulted in empty arrays, return None immediately
            if x.size == 0 or y.size == 0:
                return None

            # --- KEY FIX: pass param_values to calculate() ---
            # Models that implement `params=` (e.g. BilayerModel) will snapshot
            # all values into locals before calling curve_fit, making them immune
            # to concurrent/sequential instance mutation.
            # Models that don't accept params= yet fall back gracefully because
            # we still update the instance below as a safety net for legacy models.
            #
            # Update instance AFTER computing ze_min/ze_max, and only for legacy
            # models that still rely on self.get_value() inside calculate().
            for k, v in param_dict.items():
                emodel_instance.parameters[k]["default"] = v

            result = emodel_instance.calculate(x, y, params=param_values)
            return result if result is not None else None

        except Exception as e:
            print(f"Error in UDF for {emodel_name}: {e}")
            return None

    return_type = duckdb.list_type(duckdb.list_type('DOUBLE'))

    # Register the new function
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


def save_emodel_to_db(emodel_class, conn: duckdb.DuckDBPyConnection):
    """Save emodel metadata to the database."""
    emodel_instance = emodel_class()
    emodel_instance.create()
    parameters_json = json.dumps(emodel_instance.parameters)
    conn.execute("""
        INSERT OR REPLACE INTO emodels (name, description, doi, parameters)
        VALUES (?, ?, ?, ?)
    """, (emodel_class.NAME, emodel_class.DESCRIPTION, emodel_class.DOI, parameters_json))