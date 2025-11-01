# Elasticity Parameters Processing Flow

This document explains how the "view elasticity parameters" functionality works, including the complete function call sequence and data flow.

## Overview

The elasticity parameters feature calculates and displays statistical parameters from elasticity spectra data. It processes force-indentation curves to extract Young's modulus values and applies various mathematical models to fit the data.

## Complete Function Call Flow

### 1. Frontend Initiation
**File**: `front-end/src/components/graphs/ParametersGraph.jsx`

```javascript
// User clicks "View Elasticity Parameters" button
// Triggers API call to backend
const response = await fetch('/get-all-elasticity-params', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: currentFilters })
});
```

### 2. Backend API Endpoint
**File**: `back/main.py` - `get_all_elasticity_params()` function (lines 579-661)

```python
@app.post("/get-all-elasticity-params")
async def get_all_elasticity_params(data: Dict[str, Any]):
    # Extract filters from request
    filters = data.get("filters", {})
    
    # Ensure e_models exist (default to constant model)
    if not filters.get("e_models"):
        filters["e_models"] = {"constant_filter_array": {"model": "constant"}}
    
    # Connect to database
    conn = duckdb.connect(DB_PATH)
    
    # Register all filter functions
    register_filters(conn)
    
    # Get ALL curve IDs from database
    curve_ids_result = conn.execute("SELECT curve_id FROM force_vs_z").fetchall()
    curve_ids = [str(row[0]) for row in curve_ids_result]
    
    # Process curves in batches of 50
    batch_size = 50
    all_elasticity_params = []
    
    for i in range(0, len(curve_ids), batch_size):
        batch_curve_ids = curve_ids[i:i + batch_size]
        
        # Call main processing function
        graph_force_vs_z, graph_force_indentation, graph_elspectra = fetch_curves_batch(
            conn, batch_curve_ids, filters, single=True
        )
        
        # Extract elasticity parameters from this batch
        if graph_elspectra and graph_elspectra.get("curves_elasticity_param"):
            batch_elasticity_params = graph_elspectra["curves_elasticity_param"]
            all_elasticity_params.extend(batch_elasticity_params)
    
    return {
        "status": "success",
        "elasticity_params": all_elasticity_params,
        "message": f"Retrieved elasticity params for {len(all_elasticity_params)} curves"
    }
```

### 3. Main Processing Function
**File**: `back/db.py` - `fetch_curves_batch()` function (lines 75-350)

```python
def fetch_curves_batch(conn, curve_ids, filters, single=False, metadata=None):
    # Extract filter configurations
    cp_filters = filters.get("cp_filters", {})
    fmodels = filters.get("f_models", {})
    emodels = filters.get("e_models", {})
    
    # Build contact point filter query
    query_cp = apply_cp_filters("", cp_filters, curve_ids, metadata)
    
    # Build complex SQL query with CTEs
    batch_query = f"""
        WITH cp_data AS (
            {query_cp}
        ),
        indentation_data AS (
            SELECT 
                curve_id,
                calc_indentation(
                    z_values, 
                    force_values, 
                    cp_values,
                    spring_constant, 
                    {set_zero_force}
                ) AS indentation_result,
                spring_constant,
                tip_radius,
                tip_geometry
            FROM cp_data
            WHERE cp_values IS NOT NULL
        ),
        base_results AS (
            SELECT 
                curve_id,
                indentation_result AS indentation,
                calc_elspectra(
                    indentation_result[1],
                    indentation_result[2],
                    {win}, 
                    {order}, 
                    tip_geometry, 
                    tip_radius, 
                    {tip_angle}, 
                    {interp}
                ) AS elspectra_result
            FROM indentation_data
            WHERE indentation_result IS NOT NULL
        ),
        emodels_results AS (
            {emodels_cte}
        )
        SELECT 
            b.curve_id,
            b.indentation,
            b.elspectra_result,
            e.emodel_values AS elastic_result
        FROM base_results b
        LEFT JOIN emodels_results e ON b.curve_id = e.curve_id
    """
    
    # Execute query
    result_batch = conn.execute(batch_query).fetchall()
    
    # Process results and extract elasticity parameters
    curves_elasticity_param = []
    for i, row in enumerate(result_batch):
        curve_id, indentation_result, elspectra_result, elastic_result = row
        
        if elastic_result is not None and emodels and single:
            x, y, elasticity_param = elastic_result
            curves_elasticity_param.append({
                "curve_index": i,
                "elasticity_param": elasticity_param
            })
    
    return graph_force_vs_z, graph_force_indentation, graph_elspectra
```

### 4. Contact Point Filtering
**File**: `back/filters/cpoints/apply_contact_point_filters.py`

```python
def apply_cp_filters(query, filters, curve_ids, metadata=None):
    # Apply contact point detection filters (GofSphere, Threshold, etc.)
    # Returns SQL query for contact point detection
    pass
```

### 5. Indentation Calculation
**File**: `back/filters/calculate_indentation.py`

```python
def calc_indentation(z_values, force_values, cp_values, spring_constant, set_zero_force):
    # Calculate indentation depth from force and contact point data
    # Returns [indentation_depths, forces] arrays
    pass
```

### 6. Elasticity Spectrum Calculation
**File**: `back/filters/calculate_elasticity.py` - `calc_elspectra()` function

```python
def calc_elspectra(z_values, force_values, win, order, tip_geometry, tip_radius, tip_angle, interp):
    # Convert to numpy arrays
    x = np.array(z_values)
    y = np.array(force_values)
    
    # High-resolution interpolation (1nm steps)
    if interp:
        yi = interp1d(x, y)
        max_x = np.max(x)
        min_x = 1e-9
        xx = np.arange(min_x, max_x, 1.0e-9)  # 1nm resolution!
        yy = yi(xx)
        ddt = 1.0e-9
    
    # Calculate contact radius based on tip geometry
    if tip_geometry == 'sphere':
        aradius = np.sqrt(xx * tip_radius)
    elif tip_geometry == 'cylinder':
        aradius = tip_radius
    # ... other geometries
    
    # Apply Savitzky-Golay filter for derivative calculation
    deriv = savgol_filter(yy, win, order, delta=ddt, deriv=1)
    Ey = coeff * deriv  # Elastic modulus values
    
    return [Ex.tolist(), Ey.tolist()]  # [depths, moduli]
```

### 7. Elasticity Model Application
**File**: `back/filters/emodels/apply_emodels.py`

```python
def apply_emodels(query, emodels, curve_ids):
    # Build SQL query for elasticity model application
    z_col = "elspectra_result[1]"  # Depth values
    e_col = "elspectra_result[2]"  # Modulus values
    
    # Select appropriate model (sigmoid, bilayer, constant, etc.)
    for emodel_name, params in emodels.items():
        function_name = EMODEL_REGISTRY[emodel_name]["udf_function"]
        param_array = f"[{', '.join(param_values)}]"
        emodel_col = f"{function_name}({z_col}, {e_col}, {param_array})"
        break
    
    # Return SQL query
    return f"""
        SELECT 
            curve_id,
            {emodel_col} AS emodel_values
        FROM base_results
        WHERE curve_id IN ({','.join(numeric_curve_ids)})
        AND {emodel_col} IS NOT NULL
    """
```

### 8. Elasticity Model UDF Wrapper
**File**: `back/filters/emodels/emodel_registry.py` - `create_emodel_udf()`

```python
def udf_wrapper(ze_values, fe_values, param_values):
    # Convert inputs to numpy arrays
    ze_values = np.array(ze_values, dtype=np.float64)
    fe_values = np.array(fe_values, dtype=np.float64)
    param_values = np.array(param_values, dtype=np.float64)
    
    # Map parameters to model instance
    expected_params = list(emodel_instance.parameters.keys())
    param_dict = {}
    for i, param_name in enumerate(expected_params):
        if i < len(param_values):
            param_dict[param_name] = param_values[i]
    
    # Filter data to specified range
    ze_min = emodel_instance.get_value("minInd") * 1e-9
    ze_max = emodel_instance.get_value("maxInd") * 1e-9
    x, y = getEizi(ze_min, ze_max, ze_values, fe_values)
    
    # Call model's calculate method
    result = emodel_instance.calculate(x, y)
    return result  # [x, y_fit, parameters]
```

### 9. Specific Model Calculations

#### Sigmoid Model
**File**: `back/filters/emodels/import_emodels/sigmoid.py`

```python
def calculate(self, x, y):
    # Non-linear curve fitting with up to 10,000 iterations
    p0 = [1000, 200000, 1e-6, 1e-6]  # Initial guesses: EH, EL, T, k
    popt, _ = curve_fit(self.theory, x, y, p0=p0, maxfev=10000)
    
    # Return fitted parameters
    params = list(map(float, popt))  # [EH, EL, T, k]
    y_fit = self.theory(x, *params)
    return [x.tolist(), y_fit.tolist(), params]
```

#### Bilayer Model
**File**: `back/filters/emodels/import_emodels/bilayer.py`

```python
def calculate(self, x, y):
    # Complex exponential fitting
    p0 = [100000, 1000, 1000]  # Initial guesses: E0, Eb, d
    popt, _ = curve_fit(self.theory, x, y, p0=p0, maxfev=10000)
    
    # Calculate fitted curve
    y_fit = self.theory(x, popt[0], popt[1], popt[2])
    return [x.tolist(), y_fit.tolist(), popt.tolist()]
```

#### Constant Model
**File**: `back/filters/emodels/import_emodels/constant.py`

```python
def calculate(self, x, y):
    # Simple averaging (fastest model)
    avg = float(np.average(y))
    y_fit = self.theory(x, avg)
    return [x.tolist(), y_fit.tolist(), [avg]]
```

### 10. Frontend Processing
**File**: `front-end/src/components/graphs/ParametersGraph.jsx`

```javascript
// Process elasticity parameters for display
const processFparamData = (data, parameters, forceModel) => {
    const isElasticityParams = parameters.some(param => 
        param.includes('E0') || param.includes('Eb') || param.includes('EH') || 
        param.includes('EL') || param.includes('Emax') || param.includes('M<E>')
    );
    
    return data.map(obj => {
        const result = { curve_index: obj.curve_index };
        
        if (isElasticityParams) {
            parameters.forEach(param => {
                if (obj.elasticity_param && Array.isArray(obj.elasticity_param)) {
                    if (param === "E[Pa]" && obj.elasticity_param.length > 0) {
                        result.E = obj.elasticity_param[0];
                    } else if (param === "E0[Pa]" && obj.elasticity_param.length > 0) {
                        result.E0 = obj.elasticity_param[0];
                    }
                    // ... map other parameters
                }
            });
        }
        
        return result;
    });
};
```

## Data Flow Summary

1. **Frontend** → API call to `/get-all-elasticity-params`
2. **main.py** → `get_all_elasticity_params()` → batch processing
3. **db.py** → `fetch_curves_batch()` → complex SQL query
4. **Contact Point Filters** → detect contact points
5. **calculate_indentation.py** → calculate indentation depths
6. **calculate_elasticity.py** → `calc_elspectra()` → high-res interpolation + Savitzky-Golay
7. **apply_emodels.py** → build elasticity model SQL query
8. **emodel_registry.py** → UDF wrapper calls model
9. **Specific Model** → `calculate()` → curve fitting (expensive!)
10. **Frontend** → `processFparamData()` → display parameters

## Performance Bottlenecks

1. **High-resolution interpolation** (1nm steps) in `calc_elspectra()`
2. **Expensive curve fitting** (up to 10,000 iterations) in model `calculate()` methods
3. **Batch processing** with repeated full pipeline execution
4. **Complex SQL queries** with nested UDF calls
5. **No caching** of intermediate results
6. **Sequential processing** instead of parallel optimization

## Key Files

- **Main API**: `back/main.py` (lines 579-661)
- **Core Processing**: `back/db.py` (lines 75-350)
- **Elasticity Calculation**: `back/filters/calculate_elasticity.py`
- **Model Registry**: `back/filters/emodels/emodel_registry.py`
- **Model Implementations**: `back/filters/emodels/import_emodels/`
- **Frontend**: `front-end/src/components/graphs/ParametersGraph.jsx`
