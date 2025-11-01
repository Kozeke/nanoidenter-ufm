# Detailed Export Flow - Code-Level Analysis

## Files Involved in Export Process

### 1. Main Application (`softmech/nano.py`)

**Key Methods:**
- `loadPlugins()` - Lines 292-310: Loads all exporters into UI dropdown
- `exportSelected()` - Lines 671-676: Called when user selects an exporter
- `doExport()` - Lines 575-583: Triggered when user clicks "Export" button

**Export Trigger:**
```python
# Line 577: Connection in __init__
self.ui.exportButton.clicked.connect(self.doExport)

# Line 575-583: Export handler
def doExport(self):
    fname = QtWidgets.QFileDialog.getSaveFileName(
        self, 'Save the data to a CSV datafile', 
        self.workingpath, "CSV Files (*.csv)"
    )
    if fname == '' or fname is None or fname[0] == '':
        return
    filename = fname[0]
    QtWidgets.QApplication.setOverrideCursor(QtGui.QCursor(QtCore.Qt.WaitCursor))
    self._export.export(filename, self)  # Calls exporter's export method
    QtWidgets.QApplication.restoreOverrideCursor()
```

**Exporter Selection:**
```python
# Line 658-666: Called when user selects exporter from dropdown
def exportSelected(self, fid):
    layout = self.ui.box_exp.layout()
    if layout is None:
        layout = QtWidgets.QFormLayout()
    self._export = protocols.exporters.get(self._plugin_export[fid-1])
    self._export.createUI(layout)  # Creates UI parameters
    self.ui.box_exp.setLayout(layout)
```

### 2. Plugin Loader (`softmech/protocols/exporters/__init__.py`)

```python
def list():
    # Returns dictionary: {'average': 'Average curve', 'scatter': 'Scatter data'}
    return listModules(__path__[0], MODULE)

def get(name):
    # Returns an instance of the EXP class from the module
    mod = getModule(name, MODULE)
    return mod.EXP()
```

### 3. Generic Importer (`softmech/protocols/importer.py`)

**Module Discovery:**
```python
def listModules(mypath, mypackage):
    modules = {}
    for (dirpath, dirnames, filenames) in walk(mypath):
        for f in filenames:
            if (f[0]!='_') :  # Skip files starting with underscore
                myid = f[:-3]  # Remove .py extension
                try:
                    mod = import_module('.'+myid, mypackage)
                    myname = mod.NAME  # Get NAME attribute
                    modules[myid] = myname  # Store ID -> Name mapping
                except ModuleNotFoundError:
                    pass
    return modules
```

### 4. Base Panel (`softmech/protocols/panels.py`)

**Key Methods Used by Exporters:**

```python
class boxPanel:
    def __init__(self):
        self._parameters = {}
        self.create()  # Called immediately
    
    def getValue(self, name):
        # Get current value of a parameter widget
        return self._parameters[name].value
    
    def addParameter(self, name, widget):
        # Store widget in parameters dictionary
        self._parameters[name] = widget
    
    def createUI(self, layout):
        # Add all parameter widgets to a form layout
        for widget in self._parameters.values():
            layout.addRow(widget.label, widget.native)
```

### 5. Average Exporter (`softmech/protocols/exporters/average.py`)

**Export Method - Complete Flow:**

```python
def export(self, filename, exp):
    # Step 1: Calculate data (same as preview)
    xall, yall, x, y, std = self.calculate(exp)
    
    # Step 2: Get parameter values
    wone = self.getValue('Dataset')  # 'Force', 'Elasticity', or 'El from F'
    ds = exp.getData()  # List of curve objects
    
    # Step 3: Build header with metadata
    if wone == 'Force':
        header = '#SoftMech export data\n#Average F-d curve\n'
    else:
        header = '#SoftMech export data\n#Average E-d curve\n'
    
    # Step 4: Add processing parameters
    header += '#Direction:{}\n#Loose:{}\n'.format(
        self.getValue('Direction'), 
        self.getValue('Loose')
    )
    
    # Step 5: Add tip geometry information
    geometry = ds[0].tip['geometry']
    header += '#Tip shape: {}\n'.format(geometry)
    if geometry in ['sphere','cylinder']:
        header += '#Tip radius [nm]: {}\n'.format(
            ds[0].tip['radius']*1e9
        )
    else:
        header += '#Tip angle [deg]: {}\n'.format(
            ds[0].tip['angle']
        )
    
    # Step 6: Add instrument parameters
    header += '#Elastic constant [N/m]: {}\n'.format(
        ds[0].spring_constant
    )
    
    # Step 7: Add derived parameters (if available)
    if wone == 'Force':
        try:
            header += '#Average Hertz modulus [Pa]: {}\n'.format(
                np.average(exp.fdata[0])
            )
            header += '#Hertz max indentation [nm]: {}\n'.format(
                exp.ui.zi_max.value()
            )
        except:
            pass
        
        # Step 8: Define column headers
        if self.getValue('Direction') == 'V':
            header += '#Columns: Indentation <F> SigmaF\n'
        else:
            header += '#Columns: <Indentation> F SigmaZ\n'
    else:
        if self.getValue('Direction') == 'V':
            header += '#Columns: Indentation <E>\n'
        else:
            header += '#Columns: <Indentation> E\n'
    
    # Step 9: Write file
    f = open(filename, 'w')
    header += '#\n#DATA\n'
    f.write(header)
    
    # Step 10: Write data rows
    for line in range(len(x)):
        if wone == 'Force':
            f.write('{}\t{}\t{}\n'.format(
                x[line],    # Indentation (m)
                y[line],    # Force (N) or Elasticity (Pa)
                std[line]   # Standard deviation
            ))
        else:
            f.write('{}\t{}\n'.format(x[line], y[line]))
    f.close()
    return
```

**Calculate Method - Data Processing:**

```python
def calculate(self, exp):
    data = exp.getData()  # Get list of all curves
    wone = self.getValue('Dataset')
    
    # Collect data arrays from all curves
    xall, yall, x2all, y2all = [], [], [], []
    for c in data:
        if wone == 'Force':
            if c._Zi is not None:
                xall.append(c._Zi)  # Indentation
                yall.append(c._Fi)  # Force
        else:
            if c._Ze is not None:
                xall.append(c._Ze)  # Elasticity indentation
                yall.append(c._E)   # Elastic modulus
            if wone == 'El from F':
                if c._Zi is not None:
                    x2all.append(c._Zi)  # For elasticity calculation
                    y2all.append(c._Fi)
    
    if len(xall) == 0:
        return
    
    # Calculate statistics
    std = None
    if wone == 'El from F':
        # Average force curves, then calculate elasticity
        x2, y2, std = averageall(x2all, y2all, 
                                 self.getValue('Direction'),
                                 self.getValue('Loose'))
        # Convert to elasticity spectrum
        x, y = calc_elspectra(x2, y2, data[0], *exp.getEPars())
    else:
        # Average the selected dataset directly
        x, y, std = averageall(xall, yall, 
                              self.getValue('Direction'),
                              self.getValue('Loose'))
    
    return xall, yall, x, y, std
```

**Averaging Algorithm:**

```python
def averageall(xall, yall, direction, loose=100):
    N = np.max([len(x) for x in xall])  # Max points in any curve
    
    # Select dependent/independent based on direction
    if direction == 'H':
        dset = yall  # Dependent: forces/elasticities
        ddep = xall  # Independent: indentations
    else:
        dset = xall  # Dependent: indentations
        ddep = yall  # Independent: forces/elasticities
    
    # Find common range
    inf = np.max([np.min(d) for d in dset if d is not None])
    if loose >= 100:
        sup = np.min([np.max(d) for d in dset if d is not None])
    else:
        sups = [np.max(d) for d in dset if d is not None]
        sup = np.percentile(sups, 100 - loose)  # Loose = percentile cutoff
    
    # Create common axis
    newax = np.linspace(inf, sup, N)
    
    # Interpolate all curves to common axis
    neway = []
    for x, y in zip(dset, ddep):
        if np.max(x) >= sup:
            neway.append(np.interp(newax, x, y))
    
    # Calculate mean and std
    newyavg = np.average(np.array(neway), axis=0)
    newstd = np.std(np.array(neway), axis=0)
    
    # Return in correct order
    if direction == 'H':
        return newyavg, newax, newstd
    else:
        return newax, newyavg, newstd
```

## Data Sources for Metadata

### From User Interface (`exp.ui`)
- `exp.ui.zi_max.value()` - Maximum indentation range
- `exp.ui.zi_min.value()` - Minimum indentation range
- `exp.ui.es_win.value()` - Elasticity calculation window size
- `exp.ui.es_order.value()` - Savitzky-Golay order
- `exp.ui.es_interpolate` - Interpolation flag

### From Curve Objects (`ds[0]`)
```python
curve.tip = {
    'geometry': 'sphere',  # or 'cylinder', 'cone', 'pyramid'
    'radius': 1e-5,        # in meters
    'angle': 17.5,         # in degrees (for cone/pyramid)
}
curve.spring_constant = 0.07  # N/m
```

### From Experiment Data (`exp.fdata`, `exp.edata`)
- `exp.fdata` - Array of fitted force model parameters
  - `exp.fdata[0]` - First parameter (typically modulus) for all curves
  - Used to calculate average: `np.average(exp.fdata[0])`
- `exp.edata` - Array of fitted elasticity model parameters

### From Exporter Parameters
- `self.getValue('Dataset')` - Dataset type selection
- `self.getValue('Direction')` - Averaging direction
- `self.getValue('Loose')` - Overlap percentile

## Call Sequence

```
User clicks "Export" button
    │
    ├─► nano.py:doExport()
    │      │
    │      ├─► Get filename from file dialog
    │      │
    │      └─► self._export.export(filename, self)
    │             │
    │             ├─► average.py:export(filename, exp)
    │             │      │
    │             │      ├─► self.calculate(exp)
    │             │      │      │
    │             │      │      ├─► exp.getData() → [curve1, curve2, ...]
    │             │      │      │
    │             │      │      ├─► Collect xall, yall arrays
    │             │      │      │
    │             │      │      └─► averageall(xall, yall, ...)
    │             │      │             │
    │             │      │             ├─► Find common range
    │             │      │             ├─► Create common axis
    │             │      │             ├─► Interpolate each curve
    │             │      │             └─► Calculate mean and std
    │             │      │
    │             │      ├─► Build header with metadata
    │             │      │      │
    │             │      │      ├─► Get processing parameters
    │             │      │      ├─► Get tip geometry from ds[0]
    │             │      │      ├─► Get spring constant
    │             │      │      └─► Get fit results from exp.fdata
    │             │      │
    │             │      └─► Write header + data to file
    │             │
    │             └─► Return
    │
    └─► Done
```

This detailed flow shows exactly where each piece of metadata comes from and how it flows through the export process.
