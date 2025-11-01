# Export Data Values Analysis

## Overview
This document explains how the numerical data values in the export file are calculated, specifically the rows after `#DATA` in the export output.

## Example Export Data

```
#Columns: Indentation <F> SigmaF
#
#DATA
0.0                      0.0                       0.0
4.6338015611224693e-10   4.695409162151222e-14     6.71268036378111e-13
9.267603122244939e-10    3.684391929366073e-15     1.0255859641095016e-12
...
```

**Column 1**: Indentation (m) - `x[line]`  
**Column 2**: Force (N) - `<F>` mean - `y[line]`  
**Column 3**: Standard deviation (N) - `SigmaF` - `std[line]`

## Data Calculation Flow

### Step 1: Collect Raw Data (`calculate` method)

**File**: `softmech/protocols/exporters/average.py`  
**Lines**: 105-120

```python
def calculate(self,exp):
    data = exp.getData()  # Get all curve objects
    wone = self.getValue('Dataset')
    xall = []
    yall = []
    
    for c in data:
        if wone == 'Force':
            if c._Zi is not None:  # Check if indentation data exists
                xall.append(c._Zi)  # Collect indentation depths
                yall.append(c._Fi)  # Collect forces
```

**What happens here**:
- Loops through all curves in the experiment
- Collects indentation (`_Zi`) and force (`_Fi`) arrays for each curve
- Results in `xall` = list of indentation arrays
- Results in `yall` = list of force arrays

### Step 2: Average Curves (`averageall` function)

**File**: `softmech/protocols/exporters/average.py`  
**Lines**: 15-38

```python
def averageall(xall, yall, direction, loose=100):
    # Find maximum number of points
    N = np.max([len(x) for x in xall])
    
    # Select which axis to interpolate based on direction
    if direction == 'H':
        dset = yall  # Forces (dependent variable)
        ddep = xall  # Indentations (independent variable)
    else:  # direction == 'V'
        dset = xall  # Indentations (dependent variable)
        ddep = yall  # Forces (independent variable)
    
    # Find common range across all curves
    inf = np.max([np.min(d) for d in dset if d is not None])
    if loose >= 100:
        sup = np.min([np.max(d) for d in dset if d is not None])
    else:
        sups = [np.max(d) for d in dset if d is not None]
        sup = np.percentile(sups, 100 - loose)
    
    # Create common axis (N points from inf to sup)
    newax = np.linspace(inf, sup, N)
    
    # Interpolate each curve to common axis
    neway = []
    for x, y in zip(dset, ddep):
        if np.max(x) >= sup:
            neway.append(np.interp(newax, x, y))
    
    # Calculate statistics
    newyavg = np.average(np.array(neway), axis=0)  # Mean
    newstd = np.std(np.array(neway), axis=0)       # Standard deviation
    
    # Return in correct order based on direction
    if direction == 'H':
        return newyavg, newax, newstd
    else:  # direction == 'V'
        return newax, newyavg, newstd
```

**What happens here**:
1. **Find common range**: Determines the overlap region where all curves have data
2. **Create common axis**: Generates N evenly-spaced points from minimum to maximum
3. **Interpolate each curve**: Each individual curve is interpolated to the common axis using `np.interp()`
4. **Calculate mean**: Averages all interpolated curves at each point
5. **Calculate std**: Computes standard deviation across curves at each point

### Step 3: Write Data (`export` method)

**File**: `softmech/protocols/exporters/average.py`  
**Lines**: 189-202

```python
def export(self, filename, exp):
    # Calculate data (returns: xall, yall, x, y, std)
    xall, yall, x, y, std = self.calculate(exp)
    
    # ... write header ...
    
    # Write data rows
    for line in range(len(x)):
        if wone == 'Force':
            f.write('{}\t{}\t{}\n'.format(
                x[line],    # Indentation (m)
                y[line],    # Mean force (N)
                std[line]   # Standard deviation (N)
            ))
```

## Example Calculation

### Input: Two Force-Indentation Curves

**Curve 1**:
```
Indentation (m)    Force (N)
0.0                0.0
1e-9               1e-14
2e-9               2e-14
```

**Curve 2**:
```
Indentation (m)    Force (N)
0.0                0.0
1.2e-9             1.1e-14
2.1e-9             2.2e-14
```

### Step-by-Step Processing

1. **Common range**: min=0.0, max=2.0e-9 (overlap region)

2. **Common axis** (N=3 points):
   ```
   newax = [0.0, 1.0e-9, 2.0e-9]
   ```

3. **Interpolate Curve 1**:
   ```
   indentation: [0.0, 1e-9, 2e-9]
   force:       [0.0, 1e-14, 2e-14]  (already on common axis)
   ```

4. **Interpolate Curve 2**:
   ```
   original indentation: [0.0, 1.2e-9, 2.1e-9]
   original force:       [0.0, 1.1e-14, 2.2e-14]
   
   interpolated to common axis:
   indentation: [0.0, 1.0e-9, 2.0e-9]
   force:       [0.0, 0.917e-14, 1.905e-14]  (interpolated)
   ```

5. **Calculate statistics**:
   ```
   Point 0: mean=(0.0+0.0)/2=0.0, std=0.0
   Point 1: mean=(1e-14+0.917e-14)/2=0.9585e-14, std=...
   Point 2: mean=(2e-14+1.905e-14)/2=1.9525e-14, std=...
   ```

6. **Output**:
   ```
   0.0    0.0                   0.0
   1e-9   0.9585e-14            [std value]
   2e-9   1.9525e-14            [std value]
   ```

## Understanding the Values in Your Export

```
4.6338015611224693e-10   4.695409162151222e-14     6.71268036378111e-13
```

**Breaking down this line**:
- **First value** (`4.633e-10`): Indentation depth in meters = 0.463 nm
- **Second value** (`4.695e-14`): Mean force in Newtons = 0.047 pN (picoNewtons)
- **Third value** (`6.713e-13`): Standard deviation in Newtons = 0.67 pN

## Key Points

1. **Interpolation**: All curves are interpolated to a common axis before averaging
2. **Units**: 
   - Indentation in **meters** (m)
   - Force in **Newtons** (N)
   - Very small values (picoNewtons, nanometers)
3. **Statistics**:
   - Mean (`<F>`) represents the average force across all curves
   - Standard deviation (`SigmaF`) represents the spread/variability
4. **Direction Parameter**:
   - `V` (vertical): Interpolates along indentation axis
   - `H` (horizontal): Interpolates along force axis (less common)

## Data Sources

The raw data comes from processed curves:

| Attribute | Source | Description |
|-----------|--------|-------------|
| `_Zi` | `calc_indentation()` | Indentation depth after contact point correction |
| `_Fi` | `calc_indentation()` | Force after contact point correction |

These are calculated earlier in the processing pipeline from raw Z displacement and force data.
