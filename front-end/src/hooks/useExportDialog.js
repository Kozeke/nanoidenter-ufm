// Manages export dialog workflow and validation for data export operations.
import { useState, useCallback, useEffect, useMemo } from 'react';
import { saveAs } from 'file-saver';
import { useMetadata } from '../components/Dashboard';
import { useDashboardStore } from '../state/useDashboardStore';

export const useExportDialog = () => {
  const { metadataObject } = useMetadata();
  const {
    filters,
    numCurves: storeNumCurves,
    selectedExportCurveIds,
    isLoadingExport,
    setIsLoadingExport,
    setLoadingMulti,
    // Stores force model parameters (maxInd, minInd, poisson) used for Hertz fit calculations.
    forceModelParams,
  } = useDashboardStore();

  // Indicates whether metadata is ready once we have at least one sample row.
  const isMetadataReady = !!metadataObject?.sample_row;

  // Stores initial metadata values derived from the database sample row.
  const initialMetadata = useMemo(
    () => ({
      file_id: String(metadataObject.sample_row?.file_id ?? ''),
      date: String(metadataObject.sample_row?.date ?? ''),
      spring_constant: String(metadataObject.sample_row?.spring_constant ?? ''),
      tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
      tip_radius: String(metadataObject.sample_row?.tip_radius ?? ''),
    }),
    [metadataObject.sample_row]
  );

  // --- Local state moved here ---
  // Controls whether the export dialog is currently visible.
  const [open, setOpen] = useState(false);
  // Tracks the current step index in the export wizard.
  const [step, setStep] = useState(0);
  // Stores the selected export format (hdf5, csv, json, etc.).
  const [selectedFormat, setSelectedFormat] = useState('');
  // Stores the file path where the export will be saved.
  const [exportPath, setExportPath] = useState('');
  // Stores the level names for HDF5 hierarchical structure.
  const [levelNames, setLevelNames] = useState(['curve0', 'segment0']);
  // Stores the metadata path location within HDF5 file.
  const [metadataPath, setMetadataPath] = useState('curve0/segment0/tip');
  // Stores the dataset path location within HDF5 file.
  const [datasetPath, setDatasetPath] = useState('curve0/segment0/dataset');
  // Stores the metadata fields for non-CSV exports.
  const [metadata, setMetadata] = useState(initialMetadata);
  // Tracks validation errors to display in the UI.
  const [errors, setErrors] = useState([]);
  // Indicates when an export operation is in progress.
  const [loading, setLoading] = useState(false);

  // SoftMech-style export options for CSV
  // Stores the CSV export type (raw, average, scatter).
  const [exportType, setExportType] = useState('raw');
  // Stores the dataset type for SoftMech exports.
  const [datasetType, setDatasetType] = useState('Force');
  // Stores the direction for SoftMech exports (V or H).
  const [direction, setDirection] = useState('V');
  // Stores the looseness parameter for averaging (10-100).
  const [loose, setLoose] = useState(100);
  // Stores calculated SoftMech metadata from backend.
  const [calculatedMetadata, setCalculatedMetadata] = useState(null);
  // Indicates when metadata calculation is in progress.
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  // Stores editable SoftMech metadata fields for CSV exports.
  const [editableSoftMechMetadata, setEditableSoftMechMetadata] = useState({
    file_id: String(metadataObject.sample_row?.file_id ?? ''),
    date: String(metadataObject.sample_row?.date ?? ''),
    spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
    tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
    tip_radius: parseFloat(metadataObject.sample_row?.tip_radius) || 0,
  });

  // Derived values
  // Extracts curve IDs from store or defaults to empty array.
  const curveIds =
    selectedExportCurveIds && selectedExportCurveIds.length > 0
      ? selectedExportCurveIds
      : [];
  // Uses store value if no specific curves selected, otherwise undefined.
  const numCurves =
    curveIds.length > 0 ? undefined : (storeNumCurves ?? 10);

  // Extracts filter configurations from store.
  const regularFilters = filters?.regular ?? {};
  const cpFilters = filters?.cp_filters ?? {};
  const forceModels = filters?.f_models ?? {};
  const elasticityModels = filters?.e_models ?? {};

  // Combines local and global loading flags for export workflows.
  const isExporting = loading || isLoadingExport;

  // Provides a reusable helper to clear any error messages containing a specific token.
  const clearErrorContains = useCallback((token) => {
    if (!token) return;
    setErrors((prev) =>
      prev.filter((error) =>
        typeof error === 'string'
          ? !error.toLowerCase().includes(token.toLowerCase())
          : true
      )
    );
  }, []);

  // Update editable metadata when database metadata changes
  useEffect(() => {
    if (metadataObject.sample_row) {
      setEditableSoftMechMetadata({
        file_id: String(metadataObject.sample_row?.file_id ?? ''),
        date: String(metadataObject.sample_row?.date ?? ''),
        spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
        tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
        tip_radius: parseFloat(metadataObject.sample_row?.tip_radius) || 0,
      });
    } else {
      setEditableSoftMechMetadata({
        file_id: String(initialMetadata.file_id ?? ''),
        date: String(initialMetadata.date ?? ''),
        spring_constant: parseFloat(initialMetadata.spring_constant) || 0,
        tip_geometry: String(initialMetadata.tip_geometry ?? 'sphere'),
        tip_radius: parseFloat(initialMetadata.tip_radius) || 0,
      });
    }
  }, [metadataObject.sample_row, initialMetadata]);

  // Revalidates current step inputs whenever dependencies change to keep the wizard responsive.
  useEffect(() => {
    if (!open) return;

    if (exportPath && selectedFormat) {
      clearErrorContains('export path');
    }

    // If user later adds CP filters, clear the "needs cp_filters" error
    if (cpFilters && Object.keys(cpFilters).length > 0) {
      clearErrorContains('contact-point filter');
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
    // if (d.file_id?.trim()) {
    //   clearErrorContains('file id');
    // }
    // if (d.date?.trim()) {
    //   clearErrorContains('date is required');
    // }
    // if (/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) {
    //   clearErrorContains('date must be');
    // }
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
    cpFilters,
    clearErrorContains,
  ]);

  // Returns the step labels array based on the selected export format.
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

  // Returns the description text for the current step.
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

  // Validates that the export path ends with the correct file extension.
  const validateExportPath = () => {
    if (!exportPath || !exportPath.endsWith(`.${selectedFormat}`)) {
      setErrors([`Export path must be a valid ${selectedFormat.toUpperCase()} file path (e.g., exports/processed_data.${selectedFormat})`]);
      return false;
    }
    setErrors([]);
    return true;
  };

  // Validates that all level names are non-empty.
  const validateLevelNames = () => {
    if (levelNames.some(name => !name.trim())) {
      setErrors(['All level names must be non-empty']);
      return false;
    }
    setErrors([]);
    return true;
  };

  // Validates that the dataset path is provided.
  const validateDatasetPath = () => {
    if (!datasetPath.trim()) {
      setErrors(['Dataset path is required']);
      return false;
    }
    setErrors([]);
    return true;
  };

  // Validates that the metadata path is provided.
  const validateMetadataPath = () => {
    if (!metadataPath.trim()) {
      setErrors(['Metadata path is required']);
      return false;
    }
    setErrors([]);
    return true;
  };

  // Validates metadata fields based on the selected format (CSV vs others).
  const validateMetadata = () => {
    const newErrors = [];
    
    // For CSV exports (both raw and non-raw), validate the editable metadata
    if (selectedFormat === 'csv') {
      const softmechData = editableSoftMechMetadata;
      
      // Validate file ID
      // if (!softmechData.file_id || softmechData.file_id.trim() === '') {
      //   newErrors.push('File ID is required');
      // }
      
      // Validate date
      // if (!softmechData.date || softmechData.date.trim() === '') {
      //   newErrors.push('Date is required');
      // } else {
      //   // Validate date format (YYYY-MM-DD)
      //   const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      //   if (!dateRegex.test(softmechData.date)) {
      //     newErrors.push('Date must be in YYYY-MM-DD format');
      //   }
      // }
      
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

  // Fetches calculated SoftMech metadata from the backend for non-raw CSV exports.
  const fetchCalculatedMetadata = useCallback(async () => {
    if (selectedFormat !== 'csv' || exportType === 'raw') {
      return;
    }

    setLoadingMetadata(true);
    // Prevent crash if SoftMech metadata calculation temporarily fails.
    try {
      // Derive force model params (same as WebSocket: { maxInd, minInd, poisson })
      // Falls back to hertzConfig from forceModels if forceModelParams is not available.
      const hertzConfig = (forceModels && forceModels.hertz) || {};
      const forceModelParamsPayload = {
        maxInd: forceModelParams?.maxInd ?? hertzConfig.maxInd ?? 800,
        minInd: forceModelParams?.minInd ?? hertzConfig.minInd ?? 0,
        poisson: forceModelParams?.poisson ?? hertzConfig.poisson ?? 0.5,
      };

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
          },
          // Pass Hertz fit window + poisson parameters for consistent force model calculations.
          force_model_params: forceModelParamsPayload,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.status === 'success') {
          const metadata = result.calculated_metadata;
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
          setEditableSoftMechMetadata(newEditableMetadata);
        }
      }
    } catch (error) {
      // Silently handle errors to prevent UI crashes
    } finally {
      setLoadingMetadata(false);
    }
  }, [selectedFormat, exportType, datasetType, direction, loose, curveIds, numCurves, regularFilters, cpFilters, forceModels, elasticityModels, forceModelParams]);

  // Handles navigation to the next step with validation.
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
        // Guard: average CSV export needs CP filters
        if (
          exportType === 'average' &&
          (!cpFilters || Object.keys(cpFilters).length === 0)
        ) {
          setErrors([
            'Average CSV export requires at least one contact-point filter (cp_filters). ' +
              'Please configure a contact point filter in the sidebar before exporting.',
          ]);
          return;
        }

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

  // Handles navigation to the previous step.
  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
      setErrors([]);
    }
  };

  // Handles clicking on a step in the stepper to navigate to it.
  const handleStepClick = (stepIndex) => {
    if (stepIndex >= step) return; // Prevent navigating to future steps
    setStep(stepIndex);
    setErrors([]);
  };

  // Submits the export request to the backend and handles the file download.
  const handleSubmit = async () => {
    setLoading(true);
    setIsLoadingExport(true);
    setLoadingMulti({ export: true });
    setErrors([]); // Clear any previous errors
    // Prevent crash if backend export fails or network issues occur.
    try {
      console.log("Export request - curveIds:", curveIds);
      console.log("Export request - numCurves:", numCurves);
      
      // Derive force model params (same as WebSocket: { maxInd, minInd, poisson })
      // Falls back to hertzConfig from forceModels if forceModelParams is not available.
      const hertzConfig = (forceModels && forceModels.hertz) || {};
      const forceModelParamsPayload = {
        maxInd: forceModelParams?.maxInd ?? hertzConfig.maxInd ?? 800,
        minInd: forceModelParams?.minInd ?? hertzConfig.minInd ?? 0,
        poisson: forceModelParams?.poisson ?? hertzConfig.poisson ?? 0.5,
      };
      
      // Prepare payload with level names and metadata
        const payload = {
          export_path: exportPath,
          curve_ids: curveIds && curveIds.length > 0 ? curveIds : undefined,
          num_curves: curveIds && curveIds.length > 0 ? undefined : numCurves,
          ...(selectedFormat === 'hdf5' && {
            level_names: levelNames,
            metadata_path: metadataPath,
            dataset_path: datasetPath,
          }),
          // Add SoftMech-style export parameters for CSV
          ...(selectedFormat === 'csv' && {
            export_type: exportType,
            dataset_type: datasetType,
            direction: direction,
            loose: loose,
            // Pass the actual filters from the frontend
            filters: {
              regular: regularFilters,
              cp_filters: cpFilters,
              f_models: forceModels,
              e_models: elasticityModels
            },
            // Pass editable metadata for all CSV exports (both raw and non-raw)
            softmech_metadata: editableSoftMechMetadata,
            // Pass Hertz fit window + poisson parameters for force model calculations.
            force_model_params: forceModelParamsPayload,
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
    } finally {
      setLoading(false);
      setIsLoadingExport(false);
      setLoadingMulti({ export: false });
    }
  };

  // Handles changes to metadata fields for non-CSV exports.
  const handleMetadataChange = (e) => {
    const { name, value } = e.target;
    setMetadata({ ...metadata, [name]: value });
    const token = metadataValidationRules[name]?.label || name;
    clearErrorContains(token);
  };

  // Generates a simple textual preview of HDF5 structure.
  const generateHdf5Preview = () => {
    const levels = levelNames.join(' / ');
    return `Root
  - Group: ${levelNames[0]} (and similar for other curves)
    ${levelNames.slice(1).map((name, index) => `    ${'  '.repeat(index + 1)}- Group: ${name}`).join('\n')}
    ${'  '.repeat(levelNames.length)}- Dataset: ${datasetPath.split('/').pop()} (at ${datasetPath})
    ${'  '.repeat(levelNames.length)}- Metadata at: ${metadataPath}`;
  };

  // Initializes the export dialog for a specific format.
  const handleExportStart = (format) => {
    setSelectedFormat(format);
    setExportPath(`exports/processed_data.${format}`);
    setOpen(true);
    setStep(0);
    setErrors([]);
    if (format === 'csv') {
      setExportType('raw');
      setDatasetType('Force');
      setDirection('V');
      setLoose(100);
      setCalculatedMetadata(null);
    }
  };

  return {
    // state / derived
    isMetadataReady,
    isExporting,
    open,
    step,
    selectedFormat,
    exportPath,
    levelNames,
    metadataPath,
    datasetPath,
    metadata,
    errors,
    loading,
    exportType,
    datasetType,
    direction,
    loose,
    calculatedMetadata,
    loadingMetadata,
    editableSoftMechMetadata,

    // shared data
    curveIds,
    numCurves,
    regularFilters,
    cpFilters,
    forceModels,
    elasticityModels,

    // setters / handlers
    setOpen,
    setStep,
    setSelectedFormat,
    setExportPath,
    setLevelNames,
    setMetadataPath,
    setDatasetPath,
    setMetadata,
    setErrors,
    setLoading,
    setExportType,
    setDatasetType,
    setDirection,
    setLoose,
    setCalculatedMetadata,
    setLoadingMetadata,
    setEditableSoftMechMetadata,
    clearErrorContains,

    // functions
    handleExportStart,
    handleNext,
    handleBack,
    handleSubmit,
    handleMetadataChange,
    handleStepClick,
    generateHdf5Preview,
    getSteps,
    getStepDescription,
    metadataValidationRules,
    validateExportPath,
    validateLevelNames,
    validateDatasetPath,
    validateMetadataPath,
    validateMetadata,
    fetchCalculatedMetadata,
  };
};

