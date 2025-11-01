# Spring Constant Analysis

## Overview
The `spring_constant` (cantilever spring constant in N/m) is a fundamental parameter in nanoindentation data processing. This document shows where it is defined, calculated, and loaded in the SoftMech system.

## Location: `softmech/nanoindentation/engine.py`

### Initialization
The spring constant is initialized in the `curve` class constructor:

```python
class curve(object):
    def __init__(self,structure=None,index=None,h5=False):
        self.data = {'F': None,'Z':None}
        self.index = index
        self.spring_constant = 1.0  # Default value: 1.0 N/m
        self.tip = {'geometry':None}
        self.position=None
        self.reset()
        if structure is not None:
            if h5 is True:
                self.load5(structure)
            else:
                self.load(structure)
```

**Line 54**: Default value set to `1.0` N/m if not provided

### Loading from HDF5 Files (`load5` method)

```python
def load5(self,structure):
    print("loading data")
    for name in structure.attrs:  # Line 64-66
        value = structure.attrs[name]
        setattr(self,name,value)  # This sets spring_constant if present in attrs
```

**Lines 64-66**: When loading from HDF5 files, all attributes are copied to the curve object using `setattr()`. If the HDF5 file has a `spring_constant` attribute, it will be assigned to `self.spring_constant`.

### Loading from JSON Files (`load` method)

```python
def load(self,structure):
    for k,v in structure.items():  # Line 79-80
        setattr(self,k,v)
    self.setZF('auto')        
```

**Lines 79-80**: When loading from JSON files, all key-value pairs are copied to the curve object. If the JSON structure contains a `spring_constant` field, it will be assigned.

### Usage in Calculations

The spring constant is used in indentation calculations:

```python
def calc_indentation(self, setzeroforce = True):
    iContact = np.argmin( (self._Z - self._cp[0] )** 2)
    if setzeroforce is True:
        Yf = self._F[iContact:]-self._cp[1]
    else:
        Yf = self._F[iContact:]
    Xf = self._Z[iContact:]-self._cp[0]
    self._Zi = Xf - Yf / self.spring_constant  # Line 138: Used here
    self._Fi = Yf
```

**Line 138**: `self.spring_constant` is used to calculate indentation depth (`_Zi`) by correcting for cantilever deflection.

## Loading Process in Main Application (`softmech/nano.py`)

### Loading Experiments

```python
def loadExperiment(self,reload=False):
    # ...
    if '.json' in filename:
        structure = json.load(open(filename))
        for cv in structure['curves']:
            engine.dataset.append(engine.curve(cv,len(engine.dataset)))  # Line 312
    elif '.hdf5' in filename:
        self.ui.updateexperiment.setEnabled(True)
        structure = h5py.File(filename,'r') 
        for cv in list(structure.keys()):
            engine.dataset.append(engine.curve(structure[cv],len(engine.dataset),True))  # Line 317
        structure.close()
    # ...
    cv0 = engine.dataset[0]
    self.statusBar().showMessage('#Curves: {} - k: {} N/m - R: {} µm - File: {}'.format(
        len(engine.dataset),cv0.spring_constant,cv0.tip['radius']*1e6,self.filename))
```

**Lines 312 & 317**: The spring constant is loaded from the file structure (JSON dictionary or HDF5 attributes)

**Line 325**: The spring constant is displayed in the status bar

## Data Sources

### From HDF5 Files
The spring constant is stored as an attribute in the HDF5 file structure:

```python
# In load5 method:
for name in structure.attrs:  # HDF5 attributes
    setattr(self, name, structure.attrs[name])
```

### From JSON Files
The spring constant is stored as a field in the JSON structure:

```json
{
  "curves": [
    {
      "spring_constant": 0.075,
      "tip": {...},
      "data": {...}
    }
  ]
}
```

## Summary

| Location | File | Line | Description |
|----------|------|------|-------------|
| **Default initialization** | `engine.py` | 54 | Set to 1.0 N/m if not provided |
| **HDF5 loading** | `engine.py` | 64-66 | Loaded from HDF5 attributes via `setattr()` |
| **JSON loading** | `engine.py` | 79-80 | Loaded from JSON dictionary |
| **Used in calculation** | `engine.py` | 138 | Used to calculate indentation: `_Zi = Xf - Yf / self.spring_constant` |
| **Exported in metadata** | `average.py` | 177 | Written to export file header |
| **Displayed in UI** | `nano.py` | 325 | Shown in status bar |

## File Format Example

For a JSON file structure:
```json
{
  "curves": [
    {
      "spring_constant": 0.07466326106970277,
      "tip": {
        "geometry": "sphere",
        "radius": 1e-8
      },
      "data": {
        "F": [...],
        "Z": [...]
      }
    }
  ]
}
```

For an HDF5 file structure:
```python
# Group: /curve0
attrs = {
    'spring_constant': 0.07466326106970277,
    'index': 0
}
# Subgroup: /curve0/tip
tip_attrs = {
    'geometry': 'sphere',
    'radius': 1e-8
}
```

The spring constant is **not calculated** by the software - it must be provided in the input file as experimental metadata.
