# SoftMech-Style CSV Export Functionality

This document describes the new SoftMech-style CSV export functionality that has been implemented in the nanoindenter-ufm project to replicate the advanced analysis features from the original SoftMech project.

## Overview

The new CSV export functionality provides three main export types that mirror the capabilities of the original SoftMech project:

1. **Raw Data Export** - Original functionality for exporting raw curve data
2. **Average Curve Export** - Advanced averaging with statistical analysis
3. **Scatter Data Export** - Model parameter distribution analysis

## Features

### 🔄 Advanced Data Processing
- **Contact Point Detection**: Automatic detection of contact points in force-displacement curves
- **Indentation Calculation**: Conversion from force-displacement to force-indentation data
- **Elasticity Spectra**: Calculation of local elasticity values using Savitzky-Golay differentiation
- **Model Fitting**: Automatic fitting of Hertz and constant elasticity models

### 📊 Statistical Analysis
- **Curve Averaging**: Interpolation-based averaging with configurable looseness
- **Standard Deviation**: Statistical analysis of averaged curves
- **Parameter Distribution**: Scatter analysis of fitted model parameters

### 🎯 Multiple Export Types
- **Force vs Indentation**: Averaged force-indentation curves
- **Elasticity Spectra**: Local elasticity vs indentation
- **Model Parameters**: Distribution of fitted model parameters

## Frontend Integration

### ExportButton Component
The frontend `ExportButton` component has been enhanced to support SoftMech-style CSV export:

```jsx
<ExportButton
  curveIds={selectedExportCurveIds}
  numCurves={numCurves}
  isMetadataReady={isMetadataReady}
  // Pass the actual filters from the frontend
  regularFilters={regularFilters}
  cpFilters={cpFilters}
  forceModels={forceModels}
  elasticityModels={elasticityModels}
/>
```

### SoftMech Export Options
When selecting CSV export, users can choose:

1. **Export Type**:
   - `raw`: Raw force-displacement data
   - `average`: Averaged curves with statistical analysis
   - `scatter`: Model parameter distribution

2. **Dataset Type** (for average/scatter):
   - `Force`: Force vs Indentation curves
   - `Elasticity`: Elasticity spectra
   - `El from F`: Elasticity calculated from force data
   - `Force Model`: Force model parameters
   - `Elasticity Model`: Elasticity model parameters

3. **Averaging Parameters**:
   - `direction`: "V" (vertical) or "H" (horizontal)
   - `loose`: Looseness parameter (10-100)

### Filter Integration
The export automatically uses the current filter settings configured in the frontend:
- **Contact Point Filters**: Applied for indentation calculation
- **Force Models**: Used for force model fitting
- **Elasticity Models**: Used for elasticity model fitting

## API Endpoints

### Export CSV with SoftMech Features
```
POST /export/csv
```

**Request Body:**
```json
{
    "export_path": "exports/analysis.csv",
    "export_type": "average",  // "raw", "average", "scatter"
    "dataset_type": "Force",   // "Force", "Elasticity", "El from F", "Force Model", "Elasticity Model"
    "direction": "V",          // "V", "H"
    "loose": 100,              // 10-100
    "curve_ids": ["curve0", "curve1"],
    "filters": {
        "regular": {},
        "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
        "f_models": {"hertz": {"model": "hertz"}},
        "e_models": {"constant": {"model": "constant"}}
    },
    "metadata": {
        "experiment": "Test Experiment",
        "analysis": "Force-Indentation Analysis"
    }
}
```

## Export Types

### 1. Raw Data Export (`export_type: "raw"`)
Exports raw force-displacement data with metadata.

**Output Format:**
```csv
curve_id,0
file_id,test_file
spring_constant,0.1
index,Z (m),Force (N)
0,0.0,0.0
1,1e-9,1e-9
...
```

### 2. Average Curve Export (`export_type: "average"`)

#### Force vs Indentation (`dataset_type: "Force"`)
Exports averaged force-indentation curves with statistical analysis.

**Output Format:**
```csv
#SoftMech export data
#Average F-d curve
#Direction:V
#Loose:100
#Tip shape: sphere
#Tip radius [nm]: 1000.0
#Elastic constant [N/m]: 0.1
#Columns: Indentation <F> SigmaF

#DATA
1e-9	1e-9	1e-10
2e-9	2e-9	2e-10
...
```

#### Elasticity Spectra (`dataset_type: "Elasticity"`)
Exports averaged elasticity spectra.

**Output Format:**
```csv
#SoftMech export data
#Average E-d curve
#Direction:V
#Loose:100
#Tip shape: sphere
#Tip radius [nm]: 1000.0
#Elastic constant [N/m]: 0.1
#Columns: Indentation <E>

#DATA
1e-9	1000000.0
2e-9	1100000.0
...
```

#### Elasticity from Force (`dataset_type: "El from F"`)
Calculates elasticity spectra from averaged force data.

### 3. Scatter Data Export (`export_type: "scatter"`)

#### Force Model Parameters (`dataset_type: "Force Model"`)
Exports fitted force model parameters for statistical analysis.

**Output Format:**
```csv
#SoftMech export data
#Force Indentation analysis
#
#FModel parameters
#param_0:hertz
#param_1:hertz
#
#param_0,param_1
1.5e-6,1.5
2.1e-6,1.4
...
```

#### Elasticity Model Parameters (`dataset_type: "Elasticity Model"`)
Exports fitted elasticity model parameters.

## Parameters

### Export Type Parameters
- **`export_type`**: Type of export ("raw", "average", "scatter")
- **`dataset_type`**: Type of data to export
  - For average: "Force", "Elasticity", "El from F"
  - For scatter: "Force Model", "Elasticity Model"
- **`direction`**: Averaging direction ("V" for vertical, "H" for horizontal)
- **`loose`**: Looseness parameter for averaging (10-100, higher = more curves included)

### Processing Parameters
- **`win`**: Savitzky-Golay window size (default: 61)
- **`order`**: Savitzky-Golay polynomial order (default: 2)
- **`interp`**: Whether to interpolate data (default: true)

## Usage Examples

### Example 1: Export Average Force-Indentation Curves
```python
import requests

data = {
    "export_path": "exports/average_force.csv",
    "export_type": "average",
    "dataset_type": "Force",
    "direction": "V",
    "loose": 100,
    "curve_ids": ["curve0", "curve1", "curve2"],
    "filters": {
        "regular": {},
        "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
        "f_models": {"hertz": {"model": "hertz"}},
        "e_models": {}
    },
    "metadata": {
        "experiment": "Polymer Analysis",
        "sample": "PMMA"
    }
}

response = requests.post("http://localhost:8000/export/csv", json=data)
print(response.json())
```

### Example 2: Export Model Parameter Scatter Data
```python
data = {
    "export_path": "exports/model_params.csv",
    "export_type": "scatter",
    "dataset_type": "Force Model",
    "curve_ids": ["curve0", "curve1", "curve2"],
    "filters": {
        "regular": {},
        "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
        "f_models": {"hertz": {"model": "hertz"}},
        "e_models": {}
    },
    "metadata": {
        "experiment": "Hertz Model Analysis"
    }
}

response = requests.post("http://localhost:8000/export/csv", json=data)
print(response.json())
```

### Example 3: Export Elasticity Spectra
```python
data = {
    "export_path": "exports/elasticity.csv",
    "export_type": "average",
    "dataset_type": "Elasticity",
    "direction": "V",
    "loose": 100,
    "curve_ids": ["curve0", "curve1", "curve2"],
    "filters": {
        "regular": {},
        "cp_filters": {"autotresh": {"range_to_set_zero": 500}},
        "f_models": {},
        "e_models": {"constant": {"model": "constant"}}
    },
    "metadata": {
        "experiment": "Elasticity Analysis"
    }
}

response = requests.post("http://localhost:8000/export/csv", json=data)
print(response.json())
```

## Integration with Existing System

The SoftMech-style export functionality integrates seamlessly with the existing nanoindenter-ufm system:

### **Database Integration**
- Uses existing `fetch_curves_batch()` function from `db.py`
- Leverages existing contact point detection and model fitting filters
- No additional database schema changes required
- Maintains compatibility with existing data processing pipeline

### **Filter System Integration**
- **Contact Point Filters**: Automatically applied for indentation calculation
- **Force Models**: Hertz model fitting for force-indentation analysis
- **Elasticity Models**: Constant model fitting for elasticity spectra
- **Existing Parameters**: Uses tip geometry, spring constant, and other metadata

### **Data Flow**
1. **Raw Data**: Stored in existing `force_vs_z` table
2. **Processing**: Uses existing filter system for contact point detection and model fitting
3. **Export**: CSV exporter extracts processed data and applies SoftMech-style averaging
4. **Output**: Generates SoftMech-compatible CSV files

### **Frontend Integration**
- **Filter Props**: ExportButton receives current filter configuration from Dashboard
- **User Interface**: Enhanced export dialog with SoftMech-style options
- **Real-time Updates**: Uses current filter settings without additional processing

## Testing

Use the provided test script to verify the functionality:

```bash
cd nanoindenter-ufm/back
python test_softmech_export.py
```

This script will:
1. Test all export types with actual filter configurations
2. Verify exported files
3. Show sample output

## Comparison with Original SoftMech

| Feature | Original SoftMech | nanoindenter-ufm |
|---------|------------------|------------------|
| **Architecture** | Desktop GUI (PyQt5) | Web API (FastAPI) |
| **Data Storage** | In-memory objects | DuckDB database |
| **Export Types** | Plugin-based exporters | Unified CSV exporter |
| **Averaging** | ✅ Interpolation-based | ✅ Interpolation-based |
| **Elasticity** | ✅ Savitzky-Golay | ✅ Savitzky-Golay |
| **Model Fitting** | ✅ Hertz, Constant | ✅ Hertz, Constant |
| **File Format** | Tab-separated CSV | Tab-separated CSV |
| **Headers** | ✅ SoftMech-style | ✅ SoftMech-style |
| **Integration** | Standalone | Integrated with existing filters |
| **Frontend** | Desktop GUI | Web interface with filter integration |

## Dependencies

The new functionality requires these additional Python packages:
- `scipy` (for Savitzky-Golay filtering and interpolation)
- `numpy` (for numerical operations)

## Error Handling

The system includes comprehensive error handling:
- Validation of export parameters
- Graceful handling of missing data
- Detailed error messages
- Logging of processing steps

## Performance Considerations

- **Existing Infrastructure**: Leverages existing database and filter system
- **Efficient Processing**: Uses optimized database queries
- **Caching**: Processed data is reused from existing filter results
- **Batch Processing**: Handles multiple curves efficiently
- **No Duplication**: Reuses existing processing logic instead of reimplementing

## Future Enhancements

Potential improvements for future versions:
- Support for additional tip geometries
- More sophisticated contact point detection
- Additional model fitting algorithms
- Real-time processing feedback
- Export format customization
