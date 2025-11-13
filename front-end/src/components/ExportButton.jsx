// Manages export dialog workflow and validation for data export operations.
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Menu,
  MenuItem,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Alert,
  Box,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
  Tooltip,
  Divider,
} from '@mui/material';
import { saveAs } from 'file-saver';
import { useMetadata } from './Dashboard'; // Adjust import path

// --- Unified action button styles (same as other toolbars) ---
const actionBtnStyle = (variant = "primary", disabled = false) => {
  const base = {
    padding: "8px 12px",
    fontSize: 14,
    fontWeight: 700,
    borderRadius: "10px",
    border: "1px solid transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform .04s ease, box-shadow .15s ease, background .15s ease",
    whiteSpace: "nowrap",
  };
  if (disabled) {
    return {
      ...base,
      background: "#f5f6fb",
      color: "#9aa0b5",
      border: "1px solid #eceef7",
    };
  }
  if (variant === "primary") {
    return {
      ...base,
      background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
      color: "#fff",
      boxShadow: "0 8px 16px rgba(90, 105, 255, 0.25)",
    };
  }
  if (variant === "secondary") {
    return {
      ...base,
      background: "#fff",
      color: "#2c2f3a",
      border: "1px solid #e6e9f7",
      boxShadow: "0 2px 8px rgba(30, 41, 59, 0.06)",
    };
  }
  return base;
};

const pressable = {
  onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
  onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
  onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
};

const ExportButton = ({ 
  curveIds = [], 
  numCurves = 10, 
  isMetadataReady,
  // Add filter props from Dashboard
  regularFilters = {},
  cpFilters = {},
  forceModels = {},
  elasticityModels = {},
  renderTrigger
}) => {
  
  const { metadataObject } = useMetadata();
  const initialMetadata = useMemo(() => ({
    file_id: String(metadataObject.sample_row?.file_id ?? ''),
    date: String(metadataObject.sample_row?.date ?? ''),
    spring_constant: String(metadataObject.sample_row?.spring_constant ?? ''),
    tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
    tip_radius: String(metadataObject.sample_row?.tip_radius ?? ''),
  }), [metadataObject.sample_row]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [levelNames, setLevelNames] = useState(['curve0', 'segment0']); // Default level names
  const [metadataPath, setMetadataPath] = useState('curve0/segment0/tip');
  const [metadata, setMetadata] = useState(initialMetadata);
  // console.log(metadata)
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [datasetPath, setDatasetPath] = useState('curve0/segment0/dataset'); // New field

  // SoftMech-style export options
  const [exportType, setExportType] = useState('raw');
  const [datasetType, setDatasetType] = useState('Force');
  const [direction, setDirection] = useState('V');
  const [loose, setLoose] = useState(100);

  // Calculated SoftMech metadata
  const [calculatedMetadata, setCalculatedMetadata] = useState(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  
  // Editable SoftMech metadata (for step 3) - Essential fields only
  // Initialize with existing database values
  const [editableSoftMechMetadata, setEditableSoftMechMetadata] = useState({
    file_id: String(metadataObject.sample_row?.file_id ?? ''),
    date: String(metadataObject.sample_row?.date ?? ''),
    spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
    tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
    tip_radius: parseFloat(metadataObject.sample_row?.tip_radius) || 0
  });

  // Provides a reusable helper to clear any error messages containing a specific token.
  const clearErrorContains = useCallback((token) => {
    if (!token) return;
    setErrors((prev) =>
      prev.filter((error) =>
        typeof error === 'string' ? !error.toLowerCase().includes(token.toLowerCase()) : true
      )
    );
  }, []);

  // Update editable metadata when database metadata changes
  useEffect(() => {
    // console.log('Metadata object:', metadataObject);
    // console.log('Sample row:', metadataObject.sample_row);
    if (metadataObject.sample_row) {
      const newMetadata = {
        file_id: String(metadataObject.sample_row?.file_id ?? ''),
        date: String(metadataObject.sample_row?.date ?? ''),
        spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
        tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
        tip_radius: parseFloat(metadataObject.sample_row?.tip_radius) || 0
      };
      // console.log('Setting editable metadata from database:', newMetadata);
      setEditableSoftMechMetadata(newMetadata);
    } else {
      // Fallback to initial metadata if no database values
      // console.log('No database metadata, using initial metadata:', initialMetadata);
      setEditableSoftMechMetadata({
        file_id: String(initialMetadata.file_id ?? ''),
        date: String(initialMetadata.date ?? ''),
        spring_constant: parseFloat(initialMetadata.spring_constant) || 0,
        tip_geometry: String(initialMetadata.tip_geometry ?? 'sphere'),
        tip_radius: parseFloat(initialMetadata.tip_radius) || 0
      });
    }
  }, [metadataObject.sample_row, initialMetadata]);

  // Revalidates current step inputs whenever dependencies change to keep the wizard responsive.
  useEffect(() => {
    if (!open) return;

    if (exportPath && selectedFormat) {
      clearErrorContains('export path');
    }

    if (Array.isArray(levelNames) && levelNames.every((name) => name?.trim())) {
      clearErrorContains('level names');
    }

    if (datasetPath?.trim()) {
      clearErrorContains('dataset path');
    }

    if (metadataPath?.trim()) {
      clearErrorContains('metadata path');
    }

    const d = editableSoftMechMetadata || {};
    if (d.file_id?.trim()) {
      clearErrorContains('file id');
    }
    if (d.date?.trim()) {
      clearErrorContains('date is required');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) {
      clearErrorContains('date must be');
    }
    if (Number.isFinite(+d.spring_constant) && +d.spring_constant > 0) {
      clearErrorContains('spring constant');
    }
    if ((d.tip_geometry || '').trim()) {
      clearErrorContains('tip geometry');
    }
    if (Number.isFinite(+d.tip_radius) && +d.tip_radius >= 0) {
      clearErrorContains('tip radius');
    }
  }, [
    open,
    exportPath,
    selectedFormat,
    levelNames,
    datasetPath,
    metadataPath,
    editableSoftMechMetadata,
    clearErrorContains,
  ]);

  const getSteps = () => {
    if (selectedFormat === 'hdf5') {
      return [
        'Name Dataset Levels',
        'Select Dataset Save Location',
        'Select Metadata Save Location',
        'Enter Metadata',
        'Confirm Export',
      ];
    } else if (selectedFormat === 'csv') {
      return [
        'Select Export Type',
        'Select Save Location',
        'Edit SoftMech Metadata',
        'Confirm Export',
      ];
    } else {
      return [
        'Select Save Location',
        'Enter Metadata',
        'Confirm Export',
      ];
    }
  };

  const getStepDescription = () => {
    const isHdf5 = selectedFormat === 'hdf5';
    const isCsv = selectedFormat === 'csv';
    if (isHdf5) {
      return [
        'Define names for the dataset levels (e.g., groups like curve0, segment0).',
        'Enter the file path and dataset path where the HDF5 datasets will be saved.',
        'Specify the group or dataset path where metadata will be saved.',
        'Enter or verify the metadata fields for the exported file.',
        'Review the export details before saving the file.',
      ][step];
    } else if (isCsv) {
      return [
        'Choose the type of CSV export: Raw data, Average curves, or Scatter data.',
        `Enter the file path where the ${selectedFormat.toUpperCase()} file will be saved.`,
        'Edit the calculated SoftMech metadata fields before export.',
        'Review the export details before saving the file.',
      ][step];
    } else {
      return [
        `Enter the file path where the ${selectedFormat.toUpperCase()} file will be saved.`,
        'Enter or verify the metadata fields for the exported file.',
        'Review the export details before saving the file.',
      ][step];
    }
  };

  // Metadata validation rules - Essential fields only
  const metadataValidationRules = {
    file_id: { required: true, label: 'File ID', type: 'text' },
    date: { required: true, label: 'Date', type: 'text', regex: /^\d{4}-\d{2}-\d{2}$/, regexError: 'Date must be in YYYY-MM-DD format' },
    spring_constant: { required: true, label: 'Spring Constant (N/m)', type: 'number', min: 0 },
    tip_geometry: { required: true, label: 'Tip Geometry', type: 'select', options: ['sphere', 'cylinder', 'cone', 'pyramid'] },
    tip_radius: { required: true, label: 'Tip Radius (nm)', type: 'number', min: 0 },
  };

  const validateExportPath = () => {
    if (!exportPath || !exportPath.endsWith(`.${selectedFormat}`)) {
      setErrors([`Export path must be a valid ${selectedFormat.toUpperCase()} file path (e.g., exports/processed_data.${selectedFormat})`]);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateLevelNames = () => {
    if (levelNames.some(name => !name.trim())) {
      setErrors(['All level names must be non-empty']);
      return false;
    }
    setErrors([]);
    return true;
  };
  const validateDatasetPath = () => {
    if (!datasetPath.trim()) {
      setErrors(['Dataset path is required']);
      return false;
    }
    setErrors([]);
    return true;
  };
  const validateMetadataPath = () => {
    if (!metadataPath.trim()) {
      setErrors(['Metadata path is required']);
      return false;
    }
    setErrors([]);
    return true;
  };

  const validateMetadata = () => {
    const newErrors = [];
    
    // For CSV exports (both raw and non-raw), validate the editable metadata
    if (selectedFormat === 'csv') {
      const softmechData = editableSoftMechMetadata;
      
      // Validate file ID
      if (!softmechData.file_id || softmechData.file_id.trim() === '') {
        newErrors.push('File ID is required');
      }
      
      // Validate date
      if (!softmechData.date || softmechData.date.trim() === '') {
        newErrors.push('Date is required');
      } else {
        // Validate date format (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(softmechData.date)) {
          newErrors.push('Date must be in YYYY-MM-DD format');
        }
      }
      
      // Validate spring constant
      if (softmechData.spring_constant <= 0 || softmechData.spring_constant > 1000) {
        newErrors.push('Spring constant must be greater than 0 and less than 1000 N/m');
      }
      
      // Validate tip geometry
      if (!softmechData.tip_geometry || !['sphere', 'cylinder', 'cone', 'pyramid'].includes(softmechData.tip_geometry)) {
        newErrors.push('Tip geometry must be sphere, cylinder, cone, or pyramid');
      }
      
      // Validate tip radius
      if (softmechData.tip_radius <= 0 || softmechData.tip_radius > 1e6) {
        newErrors.push('Tip radius must be greater than 0 and less than 1,000,000 nm');
      }
    } else {
      // Original validation for other formats (HDF5, JSON, TXT, etc.)
      Object.entries(metadata).forEach(([key, value]) => {
        const rule = metadataValidationRules[key] || { required: false, label: key };
        if (rule.required && (!value || value.toString().trim() === '')) {
          newErrors.push(`${rule.label} is required`);
        }
        if (rule.type === 'number' && value) {
          const numValue = parseFloat(value);
          if (isNaN(numValue)) {
            newErrors.push(`${rule.label} must be a valid number`);
          } else if (rule.min !== undefined && numValue <= rule.min) {
            newErrors.push(`${rule.label} must be greater than ${rule.min}`);
          }
        }
        if (rule.regex && value && !rule.regex.test(value)) {
          newErrors.push(rule.regexError || `${rule.label} is invalid`);
        }
      });
    }
    
    setErrors(newErrors);
    return newErrors.length === 0;
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleExportStart = (format) => {
    handleMenuClose();
    setSelectedFormat(format);
    setExportPath(`exports/processed_data.${format}`);
    setOpen(true);
    setStep(0);
    setErrors([]);
    // Reset SoftMech options for CSV
    if (format === 'csv') {
      setExportType('raw');
      setDatasetType('Force');
      setDirection('V');
      setLoose(100);
      setCalculatedMetadata(null);
    }
  };

  const fetchCalculatedMetadata = useCallback(async () => {
    if (selectedFormat !== 'csv' || exportType === 'raw') {
      return;
    }

    setLoadingMetadata(true);
    // Prevent crash if SoftMech metadata calculation temporarily fails.
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/calculate-softmech-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curve_ids: curveIds.length > 0 ? curveIds : undefined,
          num_curves: curveIds.length > 0 ? undefined : numCurves,
          export_type: exportType,
          dataset_type: datasetType,
          direction: direction,
          loose: loose,
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: forceModels,
            e_models: elasticityModels
          }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          const metadata = result.calculated_metadata;
          // console.log('Calculated metadata received:', metadata);
          setCalculatedMetadata(metadata);
          // Also set the editable metadata for step 3 with proper type conversion
          // Use calculated metadata as fallback if database values are not available
          const newEditableMetadata = {
            file_id: metadata.file_id || '',
            date: metadata.date || '',
            spring_constant: parseFloat(metadata.elastic_constant_nm) || 0,
            tip_geometry: metadata.tip_shape || 'sphere',
            tip_radius: parseFloat(metadata.tip_radius_nm) > 1e6 ? 10000 : parseFloat(metadata.tip_radius_nm) || 0
          };
          // console.log('Setting editable metadata from calculated:', newEditableMetadata);
          setEditableSoftMechMetadata(newEditableMetadata);
        }
      }
    } catch (error) {
      // console.error('Failed to fetch calculated metadata:', error);
    } finally {
      setLoadingMetadata(false);
    }
  }, [selectedFormat, exportType, datasetType, direction, loose, curveIds, numCurves, regularFilters, cpFilters, forceModels, elasticityModels]);

  const handleNext = () => {
    const isHdf5 = selectedFormat === 'hdf5';
    const isCsv = selectedFormat === 'csv';
    if (isHdf5) {
      if (step === 0 && !validateLevelNames()) return;
      if (step === 1 && (!validateExportPath() || !validateDatasetPath())) return;
      if (step === 2 && !validateMetadataPath()) return;
      if (step === 3 && !validateMetadata()) {
        alert('Please fix the metadata errors before submitting.');
        return;
      }
    } else if (isCsv) {
      if (step === 0) {
        // For CSV, after step 0 (export type selection), fetch metadata immediately
        setStep(step + 1);
        if (exportType !== 'raw') {
          fetchCalculatedMetadata();
        }
        return;
      }
      if (step === 1 && !validateExportPath()) return;
      if (step === 2) {
        // Step 2: SoftMech metadata editing - no validation needed, user can edit
        setStep(step + 1);
        return;
      }
      if (step === 3 && !validateMetadata()) {
        alert('Please fix the metadata errors before submitting.');
        return;
      }
    } else {
      if (step === 0 && !validateExportPath()) return;
      if (step === 1 && !validateMetadata()) {
        alert('Please fix the metadata errors before submitting.');
        return;
      }
    }
    const currentSteps = getSteps();
    if (step < currentSteps.length - 1) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setErrors([]);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrors([]); // Clear any previous errors
    // Prevent crash if backend export fails or network issues occur.
    try {
      console.log("Export request - curveIds:", curveIds);
      console.log("Export request - numCurves:", numCurves);
      
      // Prepare payload with level names and metadata
        const payload = {
          [`export_path`]: exportPath,
          curve_ids: curveIds.length > 0 ? curveIds : undefined,
          num_curves: curveIds.length > 0 ? undefined : numCurves,
          ...(selectedFormat === 'hdf5' && {
            level_names: levelNames,
            metadata_path: metadataPath,
            dataset_path: datasetPath,
          }),
          // Add SoftMech-style export parameters for CSV
          ...(selectedFormat === 'csv' && {
            export_type: exportType,
            dataset_type: datasetType,
            direction: exportType !== 'raw' ? editableSoftMechMetadata.direction : direction,
            loose: exportType !== 'raw' ? editableSoftMechMetadata.loose : loose,
            // Pass the actual filters from the frontend
            filters: {
              regular: regularFilters,
              cp_filters: cpFilters,
              f_models: forceModels,
              e_models: elasticityModels
            },
            // Pass editable metadata for all CSV exports (both raw and non-raw)
              softmech_metadata: editableSoftMechMetadata
          }),
          // Only include metadata for non-CSV exports (HDF5, JSON, TXT, etc.)
          ...(selectedFormat !== 'csv') && {
            metadata: Object.fromEntries(
              Object.entries(metadata).map(([key, value]) => [
                key,
                metadataValidationRules[key]?.type === 'number' ? parseFloat(value) || 0 : value,
              ])
            ),
          },
        };

      // Call backend export endpoint
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/export/${selectedFormat}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          console.error('Backend export error:', errorData);
          
          // Handle different error response formats
          let errorMessages = [];
          
          if (errorData.detail) {
            if (typeof errorData.detail === 'object') {
              // Backend returns error details in the 'detail' field
              errorMessages = errorData.detail.errors || [errorData.detail.message];
            } else if (typeof errorData.detail === 'string') {
              // Direct error message in detail field
              errorMessages = [errorData.detail];
            }
          } else if (errorData.message) {
            // Direct error message
            errorMessages = [errorData.message];
          } else if (errorData.error) {
            // Error in 'error' field
            errorMessages = [errorData.error];
          } else {
            // Generic error based on status code
            errorMessages = [`Export failed with status ${response.status}`];
          }
          
          // Add user-friendly explanations for common errors
          errorMessages = errorMessages.map(error => {
            if (error.includes('No valid Force data found')) {
              return 'No valid force data found. Please check that your data contains valid force curves and try applying different filters.';
            } else if (error.includes('No valid data found')) {
              return 'No valid data found for export. Please check your data and filter settings.';
            } else if (error.includes('Internal Server Error')) {
              return 'An internal server error occurred. Please check the console for details and try again.';
            }
            return error;
          });
          
          // Ensure we have at least one error message
          if (errorMessages.length === 0) {
            errorMessages = [`Export failed with status ${response.status}`];
          }
          
          setErrors(errorMessages);
          return;
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          // If we can't parse the error response, show a generic error
          setErrors([`Export failed with status ${response.status}. Please check the console for details.`]);
          return;
        }
      }

      const result = await response.json();
      if (result.status === 'error') {
        const errorMessages = result.errors || [result.message];
        setErrors(errorMessages);
        // console.error('Export error:', errorMessages);
        // Don't show alert here, let the error display in the UI
        return;
      }

      // Fetch the exported file as a blob
      const fileResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/exports/${encodeURIComponent(exportPath)}`);
      if (!fileResponse.ok) {
        throw new Error('Failed to download exported file');
      }

      const blob = await fileResponse.blob();
      saveAs(blob, exportPath.split('/').pop()); // Use file name from path
      setErrors([]);
      alert(`Successfully exported ${result.exported_curves} curves to ${selectedFormat.toUpperCase()}`);
      setOpen(false);
      setStep(0);
    } catch (err) {
      const errorMessage = err.message.includes('HTTP error')
        ? 'Failed to communicate with server'
        : err.message;
      setErrors([errorMessage]);
              // console.error('Export error:', errorMessage);
      // Don't show alert here, let the error display in the UI
    } finally {
      setLoading(false);
    }
  };

  const handleStepClick = (stepIndex) => {
    if (stepIndex >= step) return; // Prevent navigating to future steps
    setStep(stepIndex);
    setErrors([]);
  };

  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata({ ...metadata, [name]: value });
    const token = metadataValidationRules[name]?.label || name;
    clearErrorContains(token);
  };

  // Function to generate a simple textual preview of HDF5 structure
  const generateHdf5Preview = () => {
    const levels = levelNames.join(' / ');
    return `Root
  - Group: ${levelNames[0]} (and similar for other curves)
    ${levelNames.slice(1).map((name, index) => `    ${'  '.repeat(index + 1)}- Group: ${name}`).join('\n')}
    ${'  '.repeat(levelNames.length)}- Dataset: ${datasetPath.split('/').pop()} (at ${datasetPath})
    ${'  '.repeat(levelNames.length)}- Metadata at: ${metadataPath}`;
  };

  return (
    <Box display="inline-block">
      {renderTrigger ? (
        renderTrigger(handleMenuOpen, !isMetadataReady)
      ) : (
        <button
        onClick={handleMenuOpen}
          disabled={!isMetadataReady}
          style={actionBtnStyle("primary", !isMetadataReady)}
          {...pressable}
      >
        Export
        </button>
      )}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        PaperProps={{
          sx: {
            borderRadius: "12px",
            mt: 1,
            boxShadow: "0 8px 18px rgba(20,20,43,0.06)",
            border: "1px solid #e9ecf5",
          },
        }}
      >
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('hdf5')}
        >
          HDF5
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('json')}
        >
          JSON
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('csv')}
        >
          CSV (with SoftMech options)
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('txt')}
        >
          TXT
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('jpk')}
        >
          JPK
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('ibw')}
        >
          IBW
        </MenuItem>
        <MenuItem
          sx={{
            fontSize: 14,
            fontWeight: 600,
            "&:hover": {
              background: "#f5f7ff",
            },
          }}
          onClick={() => handleExportStart('gwy')}
        >
          GWY
        </MenuItem>
      </Menu>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {getSteps()[step]}
          {selectedFormat === 'hdf5' && (
            <Tooltip title="HDF5 supports hierarchical data, so extra setup is needed for levels, paths, and structure.">
              <Typography component="span" variant="body2" sx={{ ml: 1, color: 'info.main' }}>
                (Why more steps?)
              </Typography>
            </Tooltip>
          )}
          {selectedFormat === 'csv' && (
            <Tooltip title="CSV export supports SoftMech-style analysis with averaging and model fitting.">
              <Typography component="span" variant="body2" sx={{ ml: 1, color: 'info.main' }}>
                (SoftMech features available)
              </Typography>
            </Tooltip>
          )}
        </DialogTitle>
        <DialogContent>
          <Box mb={2}>
            <Stepper activeStep={step} alternativeLabel>
              {getSteps().map((label, index) => (
                <Step
                  key={label}
                  onClick={() => handleStepClick(index)}
                  sx={{ cursor: index < step ? 'pointer' : 'default' }}
                >
                  <StepLabel>
                    <Typography variant="caption">{label}</Typography>
                  </StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
          
          {/* Prominent error display */}
          {errors.length > 0 && (
            <Box mb={2}>
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Export Failed
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  The following errors occurred during export:
                </Typography>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {errors.map((error, index) => (
                    <li key={index} style={{ marginBottom: '4px' }}>
                      <Typography variant="body2">{error}</Typography>
                    </li>
                  ))}
                </ul>
                <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                  Please fix these issues and try again.
                </Typography>
              </Alert>
            </Box>
          )}
          
          <Box mb={2}>
            <Typography
              variant="body1"
              sx={{
                backgroundColor: '#e3f2fd',
                padding: '8px',
                borderRadius: '4px',
                color: '#1565c0',
                fontWeight: 'bold',
              }}
            >
              {getStepDescription()}
            </Typography>
          </Box>
          {selectedFormat === 'hdf5' ? (
            <>
              {step === 0 && (
                <Box>
                  {levelNames.map((name, index) => (
                    <TextField
                      key={index}
                      label={`Level ${index + 1} Name`}
                      value={name}
                      onChange={(e) => {
                        const newLevelNames = [...levelNames];
                        newLevelNames[index] = e.target.value;
                        setLevelNames(newLevelNames);
                      if (e.target.value.trim()) {
                        clearErrorContains('level names');
                      }
                      }}
                      fullWidth
                      margin="normal"
                      helperText={`Enter a name for level ${index + 1} (e.g., curve${index})`}
                      error={errors.some((error) => error.includes('level names'))}
                    />
                  ))}
                  <Button onClick={() => setLevelNames([...levelNames, `level${levelNames.length}`])} variant="outlined" sx={{ mt: 1 }}>
                    Add Level
                  </Button>
                  {levelNames.length > 1 && (
                    <Button onClick={() => setLevelNames(levelNames.slice(0, -1))} variant="outlined" sx={{ mt: 1, ml: 1 }}>
                      Remove Level
                    </Button>
                  )}
                </Box>
              )}
              {step === 1 && (
                <Box>
                  <TextField
                    label="Export File Path"
                    value={exportPath}
                    onChange={(e) => {
                      setExportPath(e.target.value);
                      if (e.target.value) {
                        clearErrorContains('export path');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    helperText="Enter a valid HDF5 file path (e.g., exports/processed_data.hdf5)"
                    error={errors.some((error) => error.includes('Export path'))}
                  />
                  <TextField
                    label="Dataset Path"
                    value={datasetPath}
                    onChange={(e) => {
                      setDatasetPath(e.target.value);
                      if (e.target.value.trim()) {
                        clearErrorContains('dataset path');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    helperText="Enter the dataset path (e.g., curve0/segment0/dataset)"
                    error={errors.some((error) => error.includes('Dataset path'))}
                  />
                </Box>
              )}
              {step === 2 && (
                <TextField
                  label="Metadata Path"
                  value={metadataPath}
                  onChange={(e) => {
                    setMetadataPath(e.target.value);
                    if (e.target.value.trim()) {
                      clearErrorContains('metadata path');
                    }
                  }}
                  fullWidth
                  margin="normal"
                  helperText="Enter the group or dataset path for metadata (e.g., curve0/segment0)"
                  error={errors.some((error) => error.includes('Metadata path'))}
                />
              )}
              {step === 3 && (
                <Box>
                  <Typography variant="h6" gutterBottom>Review Export Details</Typography>
                  <Typography><strong>File Path:</strong> {exportPath}</Typography>
                  <Typography><strong>Level Names:</strong> {levelNames.join(', ')}</Typography>
                  <Typography><strong>Dataset Path:</strong> {datasetPath || 'Not specified'}</Typography>
                  <Typography><strong>Metadata Path:</strong> {metadataPath}</Typography>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Preview of HDF5 Structure</Typography>
                  <Box sx={{ backgroundColor: '#f5f5f5', p: 2, borderRadius: 1, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {generateHdf5Preview()}
                  </Box>
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}><strong>Metadata:</strong></Typography>
                  <ul>
                    {Object.entries(metadata).map(([key, value]) => (
                      <li key={key}>{metadataValidationRules[key]?.label || key}: {value || 'Not provided'}</li>
                    ))}
                  </ul>
                </Box>
              )}
            </>
          ) : selectedFormat === 'csv' ? (
            <>
              {step === 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom>Select Export Type</Typography>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Export Type</InputLabel>
                    <Select
                      value={exportType}
                      onChange={(e) => setExportType(e.target.value)}
                      label="Export Type"
                    >
                      <MenuItem value="raw">Raw Data</MenuItem>
                      <MenuItem value="average">Average Curves</MenuItem>
                      <MenuItem value="scatter">Scatter Data</MenuItem>
                    </Select>
                  </FormControl>
                  
                  {exportType === 'average' && (
                    <>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Dataset Type</InputLabel>
                        <Select
                          value={datasetType}
                          onChange={(e) => setDatasetType(e.target.value)}
                          label="Dataset Type"
                        >
                          <MenuItem value="Force">Force vs Indentation</MenuItem>
                          <MenuItem value="Elasticity">Elasticity Spectra</MenuItem>
                          <MenuItem value="El from F">Elasticity from Force</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Direction</InputLabel>
                        <Select
                          value={direction}
                          onChange={(e) => setDirection(e.target.value)}
                          label="Direction"
                        >
                          <MenuItem value="V">Vertical (V)</MenuItem>
                          <MenuItem value="H">Horizontal (H)</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        label="Looseness (10-100)"
                        type="number"
                        value={loose}
                        onChange={(e) => setLoose(parseInt(e.target.value) || 100)}
                        fullWidth
                        margin="normal"
                        inputProps={{ min: 10, max: 100 }}
                        helperText="Higher values include more curves in averaging"
                      />
                    </>
                  )}
                  
                  {exportType === 'scatter' && (
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Dataset Type</InputLabel>
                      <Select
                        value={datasetType}
                        onChange={(e) => setDatasetType(e.target.value)}
                        label="Dataset Type"
                      >
                        <MenuItem value="Force Model">Force Model Parameters</MenuItem>
                        <MenuItem value="Elasticity Model">Elasticity Model Parameters</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary">
                    <strong>Note:</strong> This export will use your current filter settings:
                  </Typography>
                  <Box sx={{ backgroundColor: '#f5f5f5', p: 2, borderRadius: 1, mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Contact Point Filters:</strong> {Object.keys(cpFilters).length > 0 ? Object.keys(cpFilters).join(', ') : 'None'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Force Models:</strong> {Object.keys(forceModels).length > 0 ? Object.keys(forceModels).join(', ') : 'None'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Elasticity Models:</strong> {Object.keys(elasticityModels).length > 0 ? Object.keys(elasticityModels).join(', ') : 'None'}
                    </Typography>
                  </Box>
                </Box>
              )}
              {step === 1 && (
                <Box>
                  <TextField
                    label="Export File Path"
                    value={exportPath}
                    onChange={(e) => {
                      setExportPath(e.target.value);
                      if (e.target.value) {
                        clearErrorContains('export path');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    helperText={`Enter a valid CSV file path (e.g., exports/processed_data.csv)`}
                    error={errors.some((error) => error.includes('Export path'))}
                  />
                </Box>
              )}
              {step === 2 && (
                <Box>
                  {loading && (
                    <Box display="flex" justifyContent="center" my={2}>
                      <CircularProgress />
                    </Box>
                  )}
                  
                  {/* Display calculated SoftMech metadata */}
                  {exportType !== 'raw' && (
                    <>
                      <Typography variant="h6" gutterBottom>
                        Calculated SoftMech Metadata
                      </Typography>
                      {loadingMetadata ? (
                        <Box display="flex" justifyContent="center" my={2}>
                          <CircularProgress size={20} />
                          <Typography variant="body2" sx={{ ml: 1 }}>
                            Calculating metadata...
                          </Typography>
                        </Box>
                      ) : calculatedMetadata ? (
                        <Box sx={{ backgroundColor: '#f0f8ff', p: 2, borderRadius: 1, mb: 2 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            <strong>Direction:</strong> {calculatedMetadata.direction}<br/>
                            <strong>Loose:</strong> {calculatedMetadata.loose}<br/>
                            <strong>Tip shape:</strong> {calculatedMetadata.tip_shape}<br/>
                            {calculatedMetadata.tip_radius_nm && (
                              <><strong>Tip radius [nm]:</strong> {calculatedMetadata.tip_radius_nm.toFixed(1)}<br/></>
                            )}
                            {calculatedMetadata.tip_angle_deg && (
                              <><strong>Tip angle [deg]:</strong> {calculatedMetadata.tip_angle_deg}<br/></>
                            )}
                            <strong>Elastic constant [N/m]:</strong> {calculatedMetadata.elastic_constant_nm}<br/>
                            {calculatedMetadata.average_hertz_modulus_pa > 0 && (
                              <><strong>Average Hertz modulus [Pa]:</strong> {calculatedMetadata.average_hertz_modulus_pa.toFixed(1)}<br/></>
                            )}
                            {calculatedMetadata.hertz_max_indentation_nm > 0 && (
                              <><strong>Hertz max indentation [nm]:</strong> {calculatedMetadata.hertz_max_indentation_nm.toFixed(1)}<br/></>
                            )}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No metadata available. Please check your export settings.
                        </Typography>
                      )}
                    </>
                  )}
                  
                  {/* For raw CSV export, show the same metadata fields as average export */}
                  {exportType === 'raw' && (
                    <>
                      <Typography variant="h6" gutterBottom>
                        Essential Metadata
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Review and edit the metadata fields retrieved from your imported file. These values will be included in your exported CSV file.
                      </Typography>
                      
                      <Alert severity="info" sx={{ mb: 2 }}>
                        These values are pre-filled from your imported file metadata. You can modify them as needed for this export.
                      </Alert>
                      
                      <TextField
                        label="File ID"
                        value={editableSoftMechMetadata.file_id}
                        onChange={(e) => {
                          setEditableSoftMechMetadata((prev) => ({
                            ...prev,
                            file_id: e.target.value,
                          }));
                          if (e.target.value.trim()) {
                            clearErrorContains('file id');
                          }
                        }}
                        fullWidth
                        margin="normal"
                        required
                        helperText="Unique identifier for this measurement file"
                        disabled={loading}
                      />
                      
                      <TextField
                        label="Date"
                        type="date"
                        value={editableSoftMechMetadata.date}
                        onChange={(e) => {
                          // Captures the updated date string for metadata validation.
                          const value = e.target.value;
                          setEditableSoftMechMetadata((prev) => ({
                            ...prev,
                            date: value,
                          }));
                          if (value.trim()) {
                            clearErrorContains('date is required');
                          }
                          if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                            clearErrorContains('date must be');
                          }
                        }}
                        fullWidth
                        margin="normal"
                        required
                        InputLabelProps={{ shrink: true }}
                        helperText="Date of the measurement (YYYY-MM-DD)"
                        disabled={loading}
                      />
                      
                      <TextField
                        label="Spring Constant [N/m]"
                        type="number"
                        value={editableSoftMechMetadata.spring_constant}
                        onChange={(e) => {
                          // Normalizes the spring constant input for validation feedback.
                          const value = parseFloat(e.target.value) || 0;
                          setEditableSoftMechMetadata((prev) => ({
                            ...prev,
                            spring_constant: value,
                          }));
                          if (value > 0) {
                            clearErrorContains('spring constant');
                          }
                        }}
                        fullWidth
                        margin="normal"
                        required
                        inputProps={{ min: 0, step: 0.000001 }}
                        helperText="Cantilever spring constant"
                        disabled={loading}
                      />
                      
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Tip Geometry</InputLabel>
                              <Select
                          value={editableSoftMechMetadata.tip_geometry}
                          onChange={(e) => {
                            setEditableSoftMechMetadata((prev) => ({
                              ...prev,
                              tip_geometry: e.target.value,
                            }));
                            if (e.target.value) {
                              clearErrorContains('tip geometry');
                            }
                          }}
                          label="Tip Geometry"
                                disabled={loading}
                              >
                          <MenuItem value="sphere">Sphere</MenuItem>
                          <MenuItem value="cylinder">Cylinder</MenuItem>
                          <MenuItem value="cone">Cone</MenuItem>
                          <MenuItem value="pyramid">Pyramid</MenuItem>
                              </Select>
                            </FormControl>
                      
                            <TextField
                        label="Tip Radius [nm]"
                        type="number"
                        value={editableSoftMechMetadata.tip_radius}
                        onChange={(e) => {
                          // Captures the numeric tip radius so validation errors can clear reactively.
                          const parsed = parseFloat(e.target.value);
                          const normalized = Number.isFinite(parsed) ? parsed : 0;
                          setEditableSoftMechMetadata((prev) => ({
                            ...prev,
                            tip_radius: normalized,
                          }));
                          if (normalized >= 0) {
                            clearErrorContains('tip radius');
                          }
                        }}
                              fullWidth
                              margin="normal"
                        required
                        inputProps={{ min: 0, step: 0.1 }}
                        helperText="Tip radius in nanometers"
                              disabled={loading}
                            />
                    </>
                  )}
                </Box>
              )}
              {step === 3 && selectedFormat === 'csv' && exportType !== 'raw' && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Edit SoftMech Metadata
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Review and edit the metadata fields retrieved from your imported file. These values will be included in your exported CSV file.
                  </Typography>
                  
                  <Alert severity="info" sx={{ mb: 2 }}>
                    These values are pre-filled from your imported file metadata. You can modify them as needed for this export.
                  </Alert>
                  
                  <TextField
                    label="File ID"
                    value={editableSoftMechMetadata.file_id}
                    onChange={(e) => {
                      setEditableSoftMechMetadata((prev) => ({
                        ...prev,
                        file_id: e.target.value,
                      }));
                      if (e.target.value.trim()) {
                        clearErrorContains('file id');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    required
                    helperText="Unique identifier for this measurement file"
                  />
                  
                  <TextField
                    label="Date"
                    type="date"
                    value={editableSoftMechMetadata.date}
                    onChange={(e) => {
                      // Stores the current date entry so validator errors clear in sync.
                      const value = e.target.value;
                      setEditableSoftMechMetadata((prev) => ({
                        ...prev,
                        date: value,
                      }));
                      if (value.trim()) {
                        clearErrorContains('date is required');
                      }
                      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                        clearErrorContains('date must be');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    required
                    InputLabelProps={{ shrink: true }}
                    helperText="Date of the measurement (YYYY-MM-DD)"
                  />
                  
                  <TextField
                    label="Spring Constant [N/m]"
                    type="number"
                    value={editableSoftMechMetadata.spring_constant}
                    onChange={(e) => {
                      // Converts the spring constant to a number for clearing related errors.
                      const value = parseFloat(e.target.value) || 0;
                      setEditableSoftMechMetadata((prev) => ({
                        ...prev,
                        spring_constant: value,
                      }));
                      if (value > 0) {
                        clearErrorContains('spring constant');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    required
                    inputProps={{ min: 0, step: 0.000001 }}
                    helperText="Cantilever spring constant"
                  />
                  
                  <FormControl fullWidth margin="normal">
                    <InputLabel>Tip Geometry</InputLabel>
                    <Select
                      value={editableSoftMechMetadata.tip_geometry}
                      onChange={(e) => {
                        setEditableSoftMechMetadata((prev) => ({
                          ...prev,
                          tip_geometry: e.target.value,
                        }));
                        if (e.target.value) {
                          clearErrorContains('tip geometry');
                        }
                      }}
                      label="Tip Geometry"
                    >
                      <MenuItem value="sphere">Sphere</MenuItem>
                      <MenuItem value="cylinder">Cylinder</MenuItem>
                      <MenuItem value="cone">Cone</MenuItem>
                      <MenuItem value="pyramid">Pyramid</MenuItem>
                    </Select>
                  </FormControl>
                  
                  <TextField
                    label="Tip Radius [nm]"
                    type="number"
                    value={editableSoftMechMetadata.tip_radius}
                    onChange={(e) => {
                      // Maintains numeric tip radius to remove lingering validation errors promptly.
                      const parsed = parseFloat(e.target.value);
                      const normalized = Number.isFinite(parsed) ? parsed : 0;
                      setEditableSoftMechMetadata((prev) => ({
                        ...prev,
                        tip_radius: normalized,
                      }));
                      if (normalized >= 0) {
                        clearErrorContains('tip radius');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    required
                    inputProps={{ min: 0, step: 0.1 }}
                    helperText="Tip radius in nanometers"
                  />
                </Box>
              )}
              {step === 3 && (
                <Box>
                  <Typography variant="h6" gutterBottom>Review Export Details</Typography>
                  <Typography><strong>File Path:</strong> {exportPath}</Typography>
                  <Typography><strong>Export Type:</strong> {exportType}</Typography>
                  {exportType !== 'raw' && (
                    <>
                      <Typography><strong>Dataset Type:</strong> {datasetType}</Typography>
                      {exportType === 'average' && (
                        <>
                          <Typography><strong>Direction:</strong> {direction}</Typography>
                          <Typography><strong>Looseness:</strong> {loose}</Typography>
                        </>
                      )}
                    </>
                  )}
                  
                  {/* Display editable metadata in review for all CSV exports */}
                  {selectedFormat === 'csv' && (
                    <>
                      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                        {exportType === 'raw' ? 'Essential Metadata' : 'SoftMech Metadata'}
                      </Typography>
                      <Box sx={{ backgroundColor: '#f0f8ff', p: 2, borderRadius: 1, mb: 2 }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          <strong>File ID:</strong> {editableSoftMechMetadata.file_id || 'Not provided'}<br/>
                          <strong>Date:</strong> {editableSoftMechMetadata.date || 'Not provided'}<br/>
                          <strong>Spring Constant [N/m]:</strong> {editableSoftMechMetadata.spring_constant}<br/>
                          <strong>Tip Geometry:</strong> {editableSoftMechMetadata.tip_geometry}<br/>
                          <strong>Tip Radius [nm]:</strong> {editableSoftMechMetadata.tip_radius}<br/>
                        </Typography>
                      </Box>
                    </>
                  )}
                  
                  {/* Show basic metadata only for non-CSV exports */}
                  {selectedFormat !== 'csv' && (
                    <>
                      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}><strong>Metadata:</strong></Typography>
                      <ul>
                        {Object.entries(metadata).map(([key, value]) => (
                          <li key={key}>{metadataValidationRules[key]?.label || key}: {value || 'Not provided'}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Box>
              )}
            </>
          ) : (
            <>
              {step === 0 && (
                <Box>
                  <TextField
                    label="Export File Path"
                    value={exportPath}
                    onChange={(e) => {
                      setExportPath(e.target.value);
                      if (e.target.value) {
                        clearErrorContains('export path');
                      }
                    }}
                    fullWidth
                    margin="normal"
                    helperText={`Enter a valid ${selectedFormat.toUpperCase()} file path (e.g., exports/processed_data.${selectedFormat})`}
                    error={errors.some((error) => error.includes('Export path'))}
                  />
                </Box>
              )}
              {step === 1 && (
                <Box>
                  {loading && (
                    <Box display="flex" justifyContent="center" my={2}>
                      <CircularProgress />
                    </Box>
                  )}
                  <Typography variant="h6" gutterBottom>
                    Tip Properties
                  </Typography>
                  {['geometry', 'parameter', 'unit', 'value'].map((key) => (
                    <TextField
                      key={key}
                      name={key}
                      label={metadataValidationRules[key].label}
                      value={metadata[key] || ''}
                      onChange={handleMetadataChange}
                      fullWidth
                      margin="normal"
                      type={metadataValidationRules[key].type === 'number' ? 'number' : 'text'}
                      error={errors.some((error) => error.includes(metadataValidationRules[key].label))}
                      helperText={errors.find((error) => error.includes(metadataValidationRules[key].label))}
                      disabled={loading}
                    />
                  ))}
                  <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                    Essential Metadata
                  </Typography>
                  {Object.keys(metadataValidationRules).map((key) => {
                    const rule = metadataValidationRules[key];
                    if (rule.type === 'select') {
                      return (
                        <FormControl key={key} fullWidth margin="normal">
                          <InputLabel>{rule.label}</InputLabel>
                          <Select
                            name={key}
                            value={metadata[key] || ''}
                            onChange={handleMetadataChange}
                            label={rule.label}
                            error={errors.some((error) => error.includes(rule.label))}
                            disabled={loading}
                          >
                            {rule.options.map((option) => (
                              <MenuItem key={option} value={option}>
                                {option}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      );
                    } else {
                      return (
                        <TextField
                          key={key}
                          name={key}
                          label={rule.label}
                          value={metadata[key] || ''}
                          onChange={handleMetadataChange}
                          fullWidth
                          margin="normal"
                          type={rule.type === 'number' ? 'number' : 'text'}
                          error={errors.some((error) => error.includes(rule.label))}
                          helperText={errors.find((error) => error.includes(rule.label))}
                          disabled={loading}
                        />
                      );
                    }
                  })}
                </Box>
              )}
              {step === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>Review Export Details</Typography>
                  <Typography><strong>File Path:</strong> {exportPath}</Typography>
                  <Typography><strong>Metadata:</strong></Typography>
                  <ul>
                    {Object.entries(metadata).map(([key, value]) => (
                      <li key={key}>{metadataValidationRules[key]?.label || key}: {value || 'Not provided'}</li>
                    ))}
                  </ul>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <button
            onClick={() => setOpen(false)}
            disabled={loading}
            style={actionBtnStyle("secondary", loading)}
            {...pressable}
          >
            Cancel
          </button>
          {step > 0 && (
            <button
              onClick={handleBack}
              disabled={loading}
              style={actionBtnStyle("secondary", loading)}
              {...pressable}
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            disabled={loading || errors.length > 0}
            style={actionBtnStyle("primary", loading || errors.length > 0)}
            {...pressable}
          >
            {step === getSteps().length - 1 ? 'Export' : 'Next'}
          </button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExportButton;