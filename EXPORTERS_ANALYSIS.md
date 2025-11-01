# SoftMech Export System Analysis

## Overview
The SoftMech export system is a plugin-based architecture that allows exporting processed nanoindentation data in various formats. This document explains how export functions work and how metadata and data are calculated.

## Architecture

### Plugin System
The export system uses a **plugin-based architecture** located in `softmech/protocols/exporters/`:

```
softmech/
├── protocols/
│   ├── exporters/
│   │   ├── __init__.py       # Plugin loader
│   │   ├── _skeleton.py      # Template for new exporters
│   │   ├── average.py        # Average curve exporter (analyzed example)
│   │   └── scatter.py        # Scatter data exporter
│   ├── panels.py             # Base panel class (boxPanel)
│   └── importer.py           # Generic plugin loader
└── nano.py                   # Main application
```

### How Plugins Are Loaded

1. **Plugin Discovery** (`protocols/importer.py`):
   - Scans directory for Python files (excluding those starting with `_`)
   - Each file must have a `NAME` attribute
   - Returns a dictionary mapping module IDs to display names

2. **Plugin Initialization** (`protocols/exporters/__init__.py`):
   ```python
   def list():
       return listModules(__path__[0], MODULE)
   
   def get(name):
       mod = getModule(name, MODULE)
       return mod.EXP()  # Returns instance of EXP class
   ```

3. **Integration** (`nano.py`):
   - Loaded plugins appear in UI dropdown (`self.ui.sel_exp`)
   - Selected plugin creates UI with `createUI()`
   - Export triggered by clicking "Export" button

## Export Plugin Structure

### Base Class: `boxPanel`
All exporters inherit from `boxPanel` (defined in `protocols/panels.py`):

**Key Methods:**
- `create()` - Define UI parameters
- `calculate()` - Perform calculations on data
- `preview()` - Display preview in matplotlib
- `export()` - Write data to file
- `getValue(name)` - Get parameter value

### Required Components

Each exporter must provide:

1. **Module-level metadata:**
   ```python
   NAME = 'Average curve'           # Display name
   DESCRIPTION = 'Plot (and save) average curve'
   DOI = ''                          # Publication reference
   ```

2. **EXP class** extending `boxPanel`:
   ```python
   class EXP(boxPanel):
       def create(self):       # Define UI parameters
       def calculate(self, exp): # Process data
       def preview(self, ax, exp): # Preview visualization
       def export(self, filename, exp): # Save to file
   ```

## Example: Average Curve Exporter

### File: `softmech/protocols/exporters/average.py`

#### 1. UI Creation (`create` method)

```python
def create(self):
    w1 = ComboBox(choices=['Force','Elasticity','El from F'], 
                  label='Dataset:', value='Force')        
    w2 = ComboBox(choices=['H','V'], label='Direction:', value='V')
    w3 = SpinBox(value=100, min=10, max=100, label="Looseness")
    self.addParameter('Dataset', w1)
    self.addParameter('Direction', w2)
    self.addParameter('Loose', w3)
```

**Parameters:**
- **Dataset**: Force, Elasticity, or El from F (elasticity from force)
- **Direction**: H (horizontal) or V (vertical) averaging
- **Loose**: Percentile cutoff (10-100)

#### 2. Data Calculation (`calculate` method)

**Data Collection:**
```python
data = exp.getData()  # Returns list of curve objects
wone = self.getValue('Dataset')

for c in data:
    if wone == 'Force':
        if c._Zi is not None:  # Indentation data exists
            xall.append(c._Zi)  # Indentation depths
            yall.append(c._Fi)  # Forces
```

**Curve Object Attributes:**
- `_Z` - Raw Z displacement (m)
- `_F` - Raw force (N)
- `_Zi` - Indentation depth (m) - calculated after contact point
- `_Fi` - Force vs indentation (N)
- `_Ze` - Elasticity indentation (m)
- `_E` - Elastic modulus (Pa)
- `tip` - Dictionary with tip geometry and parameters
- `spring_constant` - Cantilever spring constant (N/m)

**Averaging Algorithm** (`averageall` function):

1. **Select averaging direction:**
   - H: Average along horizontal axis (interpolate x values)
   - V: Average along vertical axis (interpolate y values)

2. **Determine interpolation range:**
   ```python
   inf = np.max([np.min(d) for d in dset])  # Maximum of minimums
   sup = np.min([np.max(d) for d in dset])  # Minimum of maximums
   ```

3. **Create common axis:**
   ```python
   newax = np.linspace(inf, sup, N)  # Common axis for all curves
   ```

4. **Interpolate each curve:**
   ```python
   neway.append(np.interp(newax, x, y))  # Interpolate to common axis
   ```

5. **Calculate statistics:**
   ```python
   newyavg = np.average(np.array(neway), axis=0)  # Mean
   newstd = np.std(np.array(neway), axis=0)       # Standard deviation
   ```

#### 3. Elasticity Calculation (`calc_elspectra` function)

For "El from F" dataset, converts force-indentation to elasticity spectrum:

**Process:**
1. **Interpolate** force-indentation curve to uniform spacing
2. **Calculate contact radius** based on tip geometry:
   - Sphere: `a = sqrt(x × R)`
   - Cylinder: `a = R`
   - Cone: `a = 2x/(tan(angle) × π)`
   - Pyramid: `a = 0.709 × x × tan(angle)`
3. **Apply Savitzky-Golay filter** for derivative
4. **Calculate elastic modulus:**
   ```python
   E = (3/8/a) × dF/dx
   ```

#### 4. Metadata Generation (`export` method)

```python
# Header construction
header = '#SoftMech export data\n#Average F-d curve\n'
header += '#Direction:{}\n#Loose:{}\n'.format(
    self.getValue('Direction'), 
    self.getValue('Loose')
)

# Tip information
geometry = ds[0].tip['geometry']
header += '#Tip shape: {}\n'.format(geometry)
if geometry in ['sphere','cylinder']:
    header += '#Tip radius [nm]: {}\n'.format(
        ds[0].tip['radius']*1e9
    )
else:
    header += '#Tip angle [deg]: {}\n'.format(ds[0].tip['angle'])

# Instrument parameters
header += '#Elastic constant [N/m]: {}\n'.format(
    ds[0].spring_constant
)

# Derived parameters
try:
    header += '#Average Hertz modulus [Pa]: {}\n'.format(
        np.average(exp.fdata[0])
    )
    header += '#Hertz max indentation [nm]: {}\n'.format(
        exp.ui.zi_max.value()
    )
except:
    pass
```

**Metadata Sources:**
- **Experiment parameters**: Direction, Loose (from user UI)
- **Tip geometry**: From curve object `tip` attribute
- **Spring constant**: From curve object
- **Fit parameters**: From `exp.fdata` (force model fitting results)
- **Indentation range**: From UI controls (`zi_max`)

#### 5. Data Writing

```python
f.write(header)
for line in range(len(x)):
    if wone == 'Force':
        f.write('{}\t{}\t{}\n'.format(
            x[line],      # Indentation (m)
            y[line],      # Force (N) or Elasticity (Pa)
            std[line]     # Standard deviation
        ))
    else:
        f.write('{}\t{}\n'.format(x[line], y[line]))
```

## Data Flow in Export

```
┌─────────────────┐
│   User Action   │
│  Click "Export" │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  doExport() in nano.py      │
│  - Get filename from dialog │
│  - Call _export.export()    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│  EXP.export(filename, exp)  │
│  - Calculate data           │
│  - Build metadata           │
│  - Write file               │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│    Output File              │
│  - Metadata header          │
│  - Tab-separated data       │
└─────────────────────────────┘
```

## Understanding the Example Output

Based on the provided output:

```
#SoftMech export data
#Average F-d curve
#Direction:V
#Loose:100
#Tip shape: sphere
#Tip radius [nm]: 10000.0
#Elastic constant [N/m]: 0.07466326106970277
#Columns: Indentation <F> SigmaF
#
#DATA
0.0	0.0	0.0
4.6338015611224693e-10	4.695409162151222e-14	6.71268036378111e-13
...
```

**Interpretation:**
- **Direction:V** - Vertical averaging (interpolating along indentation axis)
- **Loose:100** - Using full overlap range (no cutoff)
- **Tip shape: sphere** - Spherical indenter
- **Tip radius: 10000.0 nm** - 10 μm radius sphere
- **Elastic constant: 0.075 N/m** - Very soft cantilever
- **Columns**: Indentation (m), Mean Force (N), Std Deviation (N)

## Creating a New Exporter

1. **Copy skeleton**: Use `_skeleton.py` as template
2. **Set metadata**: Define NAME, DESCRIPTION, DOI
3. **Implement methods**:
   - `create()`: Add UI parameters
   - `calculate()`: Process experimental data
   - `preview()`: Optional matplotlib visualization
   - `export()`: Write formatted output
4. **Access data**: Use `exp.getData()` for curve list
5. **Get parameters**: Use `self.getValue('param_name')`

## Key Classes and Data Structures

### `curve` class (engine.py)
Represents a single force-displacement measurement:

```python
curve.data = {'F': force_array, 'Z': displacement_array}
curve._Zi = indentation_depth
curve._Fi = force
curve._Ze = elasticity_indentation
curve._E = elastic_modulus
curve.tip = {'geometry': 'sphere', 'radius': 1e-5, ...}
curve.spring_constant = 0.07  # N/m
curve._Fparams = fitted_parameters
curve._Eparams = fitted_parameters
```

### Experiment object (`exp` parameter)
Passed to exporter methods, provides:
- `exp.getData()` - List of curve objects
- `exp.getEPars()` - Elasticity calculation parameters
- `exp.fdata` - Fitted force model parameters
- `exp.edata` - Fitted elasticity model parameters
- `exp.ui` - UI control values

This architecture makes the export system modular and extensible, allowing users to add custom export formats without modifying core application code.
