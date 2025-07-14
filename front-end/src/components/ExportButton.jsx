import React, { useState, useCallback } from 'react';
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
} from '@mui/material';
import { saveAs } from 'file-saver';
import { useMetadata } from './Dashboard'; // Adjust import path

const ExportButton = ({ curveIds = [], numCurves = 10, isMetadataReady}) => {
  
  const { metadataObject } = useMetadata();
  const initialMetadata = {
    file_id: String(metadataObject.sample_row?.file_id ?? ''),
    date: String(metadataObject.sample_row?.date ?? ''),
    instrument: String(metadataObject.sample_row?.instrument ?? ''),
    sample: String(metadataObject.sample_row?.sample ?? ''),
    spring_constant: String(metadataObject.sample_row?.spring_constant ?? ''),
    inv_ols: String(metadataObject.sample_row?.inv_ols ?? ''),
    tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? ''),
    tip_radius: String(metadataObject.sample_row?.tip_radius ?? ''),
    sampling_rate: String(metadataObject.sample_row?.sampling_rate ?? ''),
    velocity: String(metadataObject.sample_row?.velocity ?? ''),
    geometry: String(metadataObject.sample_row?.segment_type ?? ''),
    parameter: metadataObject.sample_row?.force_values ? 'force' : '',
    unit: metadataObject.sample_row?.force_values ? 'N' : '',
    value: String(metadataObject.sample_row?.force_values?.[0] ?? ''),
  };
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [exportPath, setExportPath] = useState('');
  const [levelNames, setLevelNames] = useState(['curve0', 'segment0']); // Default level names
  const [metadataPath, setMetadataPath] = useState('curve0/segment0/tip');
  const [metadata, setMetadata] = useState(initialMetadata);
  console.log(metadata)
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [datasetPath, setDatasetPath] = useState('curve0/segment0/dataset'); // New field

  const getSteps = () => {
    if (selectedFormat === 'hdf5') {
      return [
        'Name Dataset Levels',
        'Select Dataset Save Location',
        'Select Metadata Save Location',
        'Enter Metadata',
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
    if (isHdf5) {
      return [
        'Define names for the dataset levels (e.g., groups like curve0, segment0).',
        'Enter the file path and dataset path where the HDF5 datasets will be saved.',
        'Specify the group or dataset path where metadata will be saved.',
        'Enter or verify the metadata fields for the exported file.',
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

  // Metadata validation rules (same as FileOpener)
  const metadataValidationRules = {
    file_id: { required: false, label: 'File ID', type: 'text' },
    date: { required: false, label: 'Date', type: 'text', regex: /^\d{4}-\d{2}-\d{2}$/, regexError: 'Date must be in YYYY-MM-DD format' },
    instrument: { required: false, label: 'Instrument', type: 'text' },
    sample: { required: false, label: 'Sample', type: 'text' },
    spring_constant: { required: false, label: 'Spring Constant (N/m)', type: 'number', min: 0 },
    inv_ols: { required: false, label: 'Inverse Optical Lever Sensitivity (m/V)', type: 'number', min: 0 },
    tip_geometry: { required: false, label: 'Tip Geometry', type: 'text' },
    tip_radius: { required: false, label: 'Tip Radius (m)', type: 'number', min: 0 },
    sampling_rate: { required: false, label: 'Sampling Rate (Hz)', type: 'number', min: 0 },
    velocity: { required: false, label: 'Velocity (m/s)', type: 'number', min: 0 },
    geometry: { required: true, label: 'Geometry', type: 'text' },
    parameter: { required: true, label: 'Parameter', type: 'text' },
    unit: { required: true, label: 'Unit', type: 'text' },
    value: { required: true, label: 'Value', type: 'number', min: 0 },
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
  };

  const handleNext = () => {
    const isHdf5 = selectedFormat === 'hdf5';
    if (isHdf5) {
      if (step === 0 && !validateLevelNames()) return;
      if (step === 1 && (!validateExportPath() || !validateDatasetPath())) return;
      if (step === 2 && !validateMetadataPath()) return;
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
    try {
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
        metadata: Object.fromEntries(
          Object.entries(metadata).map(([key, value]) => [
            key,
            metadataValidationRules[key]?.type === 'number' ? parseFloat(value) || 0 : value,
          ])
        ),
      };

      // Call backend export endpoint
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/export/${selectedFormat}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'error') {
        setErrors(result.errors || [result.message]);
        alert(`Failed to export: ${result.message}`);
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
      alert(`Failed to export: ${errorMessage}`);
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
    setMetadata({ ...metadata, [e.target.name]: e.target.value });
    setErrors(errors.filter((error) => !error.includes(metadataValidationRules[e.target.name]?.label || e.target.name)));
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
      <Button
        variant="contained"
        onClick={handleMenuOpen}
        sx={{
          bgcolor: '#007bff',
          color: 'white',
          borderRadius: '4px',
          px: 4,
          py: 1,
          ml: 'auto',
          mr: '150px',
          textTransform: 'none',
          '&:hover': { bgcolor: '#0056b3' },
          '&:active': { bgcolor: '#004085' },
        }}
      >
        Export
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => handleExportStart('hdf5')}>HDF5</MenuItem>
        <MenuItem onClick={() => handleExportStart('json')}>JSON</MenuItem>
        <MenuItem onClick={() => handleExportStart('csv')}>CSV</MenuItem>
        <MenuItem onClick={() => handleExportStart('txt')}>TXT</MenuItem>
        <MenuItem onClick={() => handleExportStart('jpk')}>JPK</MenuItem>
        <MenuItem onClick={() => handleExportStart('ibw')}>IBW</MenuItem>
        <MenuItem onClick={() => handleExportStart('gwy')}>GWY</MenuItem>
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
          {errors.length > 0 && (
            <Box mb={2}>
              <Alert severity="error">
                <Typography variant="body2">Please fix the following errors:</Typography>
                <ul>
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </Alert>
            </Box>
          )}
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
                        setErrors([]);
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
                      setErrors([]);
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
                      setErrors([]);
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
                    setErrors([]);
                  }}
                  fullWidth
                  margin="normal"
                  helperText="Enter the group or dataset path for metadata (e.g., curve0/segment0)"
                  error={errors.some((error) => error.includes('Metadata path'))}
                />
              )}
              {step === 3 && (
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
                    Additional Metadata
                  </Typography>
                  {Object.keys(metadataValidationRules)
                    .filter((key) => !['geometry', 'parameter', 'unit', 'value'].includes(key))
                    .map((key) => (
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
                </Box>
              )}
              {step === 4 && (
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
          ) : (
            <>
              {step === 0 && (
                <Box>
                  <TextField
                    label="Export File Path"
                    value={exportPath}
                    onChange={(e) => {
                      setExportPath(e.target.value);
                      setErrors([]);
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
                    Additional Metadata
                  </Typography>
                  {Object.keys(metadataValidationRules)
                    .filter((key) => !['geometry', 'parameter', 'unit', 'value'].includes(key))
                    .map((key) => (
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
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          {step > 0 && (
            <Button onClick={handleBack} disabled={loading}>
              Back
            </Button>
          )}
          <Button onClick={handleNext} disabled={loading || errors.length > 0}>
            {step === getSteps().length - 1 ? 'Export' : 'Next'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExportButton;