import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  TextField,
  FormControl,
  InputLabel,
  Typography,
  Alert,
  Box,
  Divider,
  Stepper,
  Step,
  StepLabel,
  CircularProgress
} from '@mui/material';

const FileOpener = ({ onProcessSuccess }) => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [filePath, setFilePath] = useState('');
  const [fileType, setFileType] = useState('');
  const [structure, setStructure] = useState(null);
  const [currentGroup, setCurrentGroup] = useState({ groups: {}, datasets: [], attributes: {} });
  const [navigationPath, setNavigationPath] = useState([]);
  const [forcePath, setForcePath] = useState('');
  const [zPath, setZPath] = useState('');
  const [metadataPath, setMetadataPath] = useState('');
  const [metadata, setMetadata] = useState({});
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(false); // Add loading state

  const metadataValidationRules = {
    file_id: { required: 'boolean', label: 'File ID', type: 'text' },
    date: { required: 'boolean', label: 'Date', type: 'text', regex: /^\d{4}-\d{2}-\d{2}$/, regexError: 'Date must be in YYYY-MM-DD format' },
    instrument: { required: 'boolean', label: 'Instrument', type: 'text' },
    sample: { required: false, label: 'Sample', type: 'text' },
    spring_constant: { required: 'number', label: 'Spring Constant (N/m)', type: 'number', min: 0 },
    inv_ols: { required: 'boolean', label: 'Inverse Optical Lever Sensitivity (m/V)', type: 'number', min: 0 },
    tip_geometry: { required: 'boolean', label: 'Tip Geometry', type: 'text' },
    tip_radius: { required: 'boolean', label: 'Tip Radius (m)', type: 'number', min: 0 },
    sampling_rate: { required: 'boolean', label: 'Sampling Rate (Hz)', type: 'number', min: 0 },
    velocity: { required: 'boolean', label: 'Velocity (m/s)', type: 'number', min: 0 },
    geometry: { required: 'true', label: 'Geometry', type: 'text' },
    parameter: { required: 'true', label: 'Parameter', type: 'text' },
    unit: { required: 'true', label: 'Unit', type: 'text' },
    value: { required: 'true', label: 'Value', type: 'number', min: 0 },
  };
  const steps = [
    'Select Force Dataset',
    'Select Z Dataset',
    'Select Metadata Location',
    'Enter Metadata',
  ];

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

  const findGroupWithDatasets = (group, path = []) => {
    if (group.datasets?.length > 0) {
      return { group, path };
    }
    for (const [name, subGroup] of Object.entries(group.groups || {})) {
      if (name === 'datasets' || name === 'attributes') continue;
      const result = findGroupWithDatasets(subGroup, [...path, name]);
      if (result.group) return result;
    }
    return { group: null, path: [] };
  };

  const navigateToFirstSegment = (initialGroup, initialPath = []) => {
    let group = initialGroup;
    let path = [...initialPath];

    console.log('Navigating to first segment, Initial group:', group);

    const firstCurve = Object.keys(group.groups || {}).find((key) => key !== 'datasets' && key !== 'attributes');
    if (!firstCurve) {
      console.warn('No top-level groups found');
      return { group, path };
    }
    group = group.groups[firstCurve];
    path = [...path, firstCurve];

    const firstSegment = Object.keys(group.groups || {}).find((key) => key !== 'datasets' && key !== 'attributes');
    if (firstSegment) {
      group = group.groups[firstSegment];
      path = [...path, firstSegment];
    } else {
      console.warn(`No segments found in ${path.join('/')}`);
    }

    console.log('Navigated to:', path, 'Group:', group);
    if (!group.datasets?.length && !Object.keys(group.groups || {}).length && !Object.keys(group.attributes || {}).length) {
      console.warn(`No datasets, subgroups, or attributes found in ${path.join('/')}`);
    }
    return { group, path };
  };

  const handleOpenFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.hdf5';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/load-experiment`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();

        if (result.status === 'error') {
          setErrors(result.errors || [result.message]);
          alert(`Failed to open file: ${result.message}`);
          return;
        } else if (result.status === 'structure') {
          setFilePath(result.filename);
          setFileType(result.file_type);
          setStructure(result.structure);

          const { group, path } = navigateToFirstSegment(result.structure);
          setCurrentGroup({ ...group });
          setNavigationPath(path);

          setErrors([]);
          setWarnings([]);
          setStep(0); // Changed from setStep(1) to start at Select Z Dataset
          setOpen(true);
          console.log('Initial Structure:', JSON.stringify(result.structure, null, 2));
          console.log('Starting Group:', group, 'Path:', path);
          console.log('Segment0 groups:', result.structure.groups?.curve0?.groups?.segment0?.groups);
        }
      } catch (err) {
        const errorMessage = err.message.includes('HTTP error') ? 'Failed to communicate with server' : err.message;
        setErrors([errorMessage]);
        alert(`Failed to open file: ${errorMessage}`);
      }
    };

    input.click();
  };

  const navigateToGroup = (groupName) => {
    let group = structure;
    const newPath = [...navigationPath, groupName];

    try {
      for (const part of newPath) {
        if (!group.groups || !group.groups[part]) {
          console.error(`Group not found: ${part} in path ${newPath.join('/')}`);
          setErrors([`Group not found: ${part}`]);
          return;
        }
        group = group.groups[part];
      }
      setCurrentGroup({ ...group });
      setNavigationPath(newPath);
      console.log(`Navigated to: ${newPath.join('/')}`, 'Current Group:', group);
      if (!group.datasets?.length && !Object.keys(group.groups || {}).length && !Object.keys(group.attributes || {}).length) {
        setWarnings([`No datasets, subgroups, or attributes found in ${newPath.join('/')}`]);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      setErrors(['Error navigating group structure']);
    }
  };

  const goBack = () => {
    if (navigationPath.length === 0) return;
    const newPath = navigationPath.slice(0, -1);
    let group = structure;

    try {
      for (const part of newPath) {
        if (!group.groups || !group.groups[part]) {
          console.error(`Group not found: ${part} in path ${newPath.join('/')}`);
          setErrors([`Group not found: ${part}`]);
          return;
        }
        group = group.groups[part];
      }
      setCurrentGroup({ ...group });
      setNavigationPath(newPath);
      console.log(`Went back to: ${newPath.join('/') || 'Root'}`, 'Current Group:', group);
      if (!group.datasets?.length && !Object.keys(group.groups || {}).length && !Object.keys(group.attributes || {}).length) {
        setWarnings([`No datasets, subgroups, or attributes found in ${newPath.join('/') || 'Root'}`]);
      }
    } catch (error) {
      console.error('Go back error:', error);
      setErrors(['Error navigating back']);
    }
  };

  const handleSelectForce = (path) => {
    setForcePath(path);
    const { group, path: newPath } = navigateToFirstSegment(structure);
    if (group) {
      setCurrentGroup({ ...group });
      setNavigationPath(newPath);
    } else {
      setCurrentGroup(structure);
      setNavigationPath([]);
    }
    setStep(1);
    console.log('Selected Force:', path, 'New Path:', newPath);
  };
  const handleStepClick = (stepIndex) => {
    if (stepIndex >= step) return; // Prevent navigating to future steps
    setStep(stepIndex);
    // Restore navigation path for the selected step
    if (stepIndex === 0 || stepIndex === 1 || stepIndex === 2) {
      const { group, path } = navigateToFirstSegment(structure);
      setCurrentGroup({ ...group });
      setNavigationPath(path);
    }
    console.log(`Navigated to step ${stepIndex}: ${steps[stepIndex]}`);
  };

  const handleSelectZ = (path) => {
    setZPath(path);
    let group = structure;
    let newPath = [];
    try {
      if (group.groups?.curve0?.groups?.segment0) {
        group = group.groups.curve0.groups.segment0;
        newPath = ['curve0', 'segment0'];
      } else {
        console.warn('curve0/segment0 not found, falling back to first segment');
        const { group: fallbackGroup, path: fallbackPath } = navigateToFirstSegment(structure);
        group = fallbackGroup;
        newPath = fallbackPath;
      }
      setCurrentGroup({ ...group });
      setNavigationPath(newPath);
      setStep(2);
      console.log('Selected Z:', path, 'New Path:', newPath, 'Current Group:', group);
    } catch (error) {
      console.error('Error navigating to segment0:', error);
      setErrors(['Failed to navigate to segment0 for metadata selection']);
      setCurrentGroup(structure);
      setNavigationPath([]);
      setStep(3);
    }
  };

  const handleSelectMetadata = (path) => {
    console.log('Attempting to select metadata at path:', path);
    let target = structure;
    const pathParts = path.split('/');

    try {
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        console.log(`Traversing part ${i}: ${part}, Current target keys:`, Object.keys(target));
        if (target.groups && target.groups[part]) {
          target = target.groups[part];
        } else {
          const dataset = (target.datasets || []).find(
            (ds) => ds.name === part || ds.path === path || ds.path.endsWith(`/${part}`)
          );
          if (dataset) {
            target = dataset;
            break;
          }
          throw new Error(`Path part ${part} not found at ${pathParts.slice(0, i + 1).join('/')}`);
        }
      }

      const attributes = target.groups.attributes || {};
      // Initialize metadata with all validation rule fields
      const initializedMetadata = Object.keys(metadataValidationRules).reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, {});
      // Merge curve0 attributes
      const mergedMetadata = { ...initializedMetadata, ...attributes };

      if (Object.keys(attributes).length === 0) {
        console.warn(`No attributes found at ${path}`);
        setWarnings((prev) => [...prev, `No attributes found at ${path}. Enter metadata manually.`]);
      } else {
        console.log('Found attributes:', attributes);
      }

      setMetadata(mergedMetadata);
      setMetadataPath(path);
      setStep(4);
      console.log('Selected Metadata Location:', path, 'Merged Metadata:', mergedMetadata, 'Target:', target);
    } catch (error) {
      console.error('Error selecting metadata location:', error.message);
      setErrors([`Invalid metadata location: ${path}. ${error.message}`]);
    }
  };

  const handleMetadataChange = (e) => {
    setMetadata({ ...metadata, [e.target.name]: e.target.value });
    setErrors(errors.filter((error) => !error.includes(metadataValidationRules[e.target.name]?.label || e.target.name)));
  };

  const handleSubmit = async () => {
    if (!validateMetadata()) {
      alert('Please fix the metadata errors before submitting.');
      return;
    }
    setLoading(true); // Start loading

    try {
      const processedMetadata = { ...metadata };
      Object.keys(processedMetadata).forEach((key) => {
        if (metadataValidationRules[key]?.type === 'number') {
          processedMetadata[key] = parseFloat(processedMetadata[key]);
        }
      });

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/process-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_path: filePath,
          file_type: fileType,
          force_path: forcePath,
          z_path: zPath,
          metadata_path: metadataPath,
          metadata: processedMetadata,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP error! Status: ${response.status}`);
      }

      const result = await response.json();
      if (result.status === 'error') {
        setErrors(result.errors || [result.message]);
        alert(`Failed to process file: ${result.message}`);
        return;
      }

      setWarnings(result.errors || []);
      alert(result.message);
      setOpen(false);
      setStep(0);
      if (onProcessSuccess) {
        onProcessSuccess(result); // Triggers initializeWebSocket in Dashboard
      }
      setFilePath('');
      setFileType('');
      setStructure(null);
      setForcePath('');
      setZPath('');
      setMetadataPath('');
      setMetadata({});
      setErrors([]);
      console.log('Processing result:', result);
    } catch (err) {
      let errorMessage = err.message;
      try {
        const errorData = await err.response?.json();
        errorMessage = errorData?.message || errorData?.errors?.join(', ') || err.message;
      } catch {
        errorMessage = err.message.includes('HTTP error') ? 'Failed to communicate with server' : err.message;
      }
      setErrors([errorMessage]);
      alert(`Failed to process file: ${errorMessage}`);
    } finally {
      setLoading(false); // Stop loading
    }
  };

  useEffect(() => {
    if (open && step <= 3) {
      console.log('Current Group State:', currentGroup, 'Navigation Path:', navigationPath, 'Step:', step);
    }
  }, [currentGroup, open, step, navigationPath]);

  return (
    <div>
      <Button variant="contained" onClick={handleOpenFile}>
        Open File
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{steps[step]}</DialogTitle>
        <DialogContent>
          <Box mb={2}>
            <Stepper activeStep={step} alternativeLabel>
              {steps.map((label, index) => (
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
              {step === 0 && 'Please select the dataset containing Force data.'}
              {step === 1 && 'Please select the dataset containing Z (displacement) data.'}
              {step === 2 && 'Please select the group or dataset containing Metadata attributes.'}
              {step === 3 && 'Please enter or verify the Metadata fields below.'}
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
          {warnings.length > 0 && (
            <Box mb={2}>
              <Alert severity="warning">
                <Typography variant="body2">Warnings from processing:</Typography>
                <ul>
                  {warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            </Box>
          )}
          {step <= 3 && (
            <div>
              <Typography variant="body1" gutterBottom>
                Current Path: {navigationPath.length ? navigationPath.join('/') : 'Root'}
              </Typography>
              <FormControl fullWidth>
                <InputLabel>Select Item</InputLabel>
                <Select
                  value=""
                  onChange={(e) => {
                    const value = e.target.value;
                    console.log('Selected value:', value, 'Current Path:', navigationPath, 'Step:', step);
                    if (value.includes('(Dataset')) {
                      const cleanPath = value.split(' (Dataset')[0];
                      if (step === 0) handleSelectForce(cleanPath);
                      else if (step === 1) handleSelectZ(cleanPath);
                      else if (step === 2) handleSelectMetadata(cleanPath);
                    } else if (value.includes('(Group')) {
                      const cleanPath = value.split(' (Group')[0];
                      if (step === 2) {
                        const fullPath = [...navigationPath, cleanPath].join('/');
                        console.log('Constructed metadata path:', fullPath);
                        handleSelectMetadata(fullPath);
                      } else {
                        navigateToGroup(cleanPath);
                      }
                    }
                  }}
                >
                  {Object.keys(currentGroup.groups || {})
                    .filter((key) => key !== 'datasets' && key !== 'attributes')
                    .map((name) => (
                      <MenuItem key={name} value={`${name} (Group)`}>
                        {name} (Group)
                        {Object.keys(currentGroup.groups[name].attributes || {}).length > 0 && ' (Has Attributes)'}
                      </MenuItem>
                    ))}
                  {(currentGroup.groups.datasets || []).map((ds) => (
                    <MenuItem
                      key={ds.path}
                      value={`${ds.path} (Dataset, Shape: ${ds.shape}, Dtype: ${ds.dtype})`}
                      disabled={
                        (step >= 1 && ds.path === forcePath) || // Disable forcePath in Steps 1, 2
                        (step >= 2 && ds.path === zPath)       // Disable zPath in Step 2
                      }
                    >
                      {ds.name} (Dataset, Shape: {ds.shape}, Dtype: {ds.dtype})
                      {Object.keys(ds.attributes || {}).length > 0 && ' (Has Attributes)'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {navigationPath.length > 0 && (
                <Button onClick={goBack} variant="outlined" style={{ marginTop: '10px' }}>
                  Go Back
                </Button>
              )}
            </div>
          )}
          {step === 4 && (
            <div>
              {loading && (
                <Box display="flex" justifyContent="center" my={2}>
                  <CircularProgress />
                </Box>
              )}
              {Object.entries(metadata).length === 0 && (
                <Typography variant="body2" color="textSecondary">
                  No attributes found at {metadataPath}. Enter metadata manually.
                </Typography>
              )}
              <Typography variant="h6" gutterBottom>
                Tip Properties
              </Typography>
              {['geometry', 'parameter', 'unit', 'value'].map((key) => (
                <TextField
                  key={key}
                  name={key}
                  label={metadataValidationRules[key]?.label || key.replace('_', ' ').toUpperCase()}
                  value={metadata[key] ?? ''}
                  onChange={handleMetadataChange}
                  fullWidth
                  margin="normal"
                  type={metadataValidationRules[key]?.type === 'number' ? 'number' : 'text'}
                  error={errors.some((error) => error.includes(metadataValidationRules[key]?.label || key))}
                  helperText={errors.find((error) => error.includes(metadataValidationRules[key]?.label || key))}
                />
              ))}
              <Divider style={{ margin: '20px 0' }} />
              <Typography variant="h6" gutterBottom>
                Additional Metadata
              </Typography>
              {Object.keys(metadataValidationRules)
                .filter((key) => !['geometry', 'parameter', 'unit', 'value'].includes(key))
                .map((key) => (
                  <TextField
                    key={key}
                    name={key}
                    label={metadataValidationRules[key]?.label || key.replace('_', ' ').toUpperCase()}
                    value={metadata[key] ?? ''}
                    onChange={handleMetadataChange}
                    fullWidth
                    margin="normal"
                    type={metadataValidationRules[key]?.type === 'number' ? 'number' : 'text'}
                    error={errors.some((error) => error.includes(metadataValidationRules[key]?.label || key))}
                    helperText={errors.find((error) => error.includes(metadataValidationRules[key]?.label || key))}
                    disabled={loading} // Disable inputs during loading

                  />
                ))}
            </div>
          )}
        </DialogContent>
       <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          {step === 4 && (
            <Button onClick={handleSubmit} disabled={errors.length > 0 || loading}>
              Submit
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FileOpener;