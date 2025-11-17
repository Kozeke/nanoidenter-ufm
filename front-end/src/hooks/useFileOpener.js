// Manages file opening workflow, validation, and metadata entry for experiment files (JSON, HDF5, CSV, TXT).
import { useState, useEffect, useCallback } from 'react';

// Defines validation rules for metadata fields to ensure data integrity.
const metadataValidationRules = {
  file_id: { required: 'boolean', label: 'File ID', type: 'text' },
  date: {
    required: 'boolean',
    label: 'Date',
    type: 'text',
    regex: /^\d{4}-\d{2}-\d{2}$/,
    regexError: 'Date must be in YYYY-MM-DD format',
  },
  spring_constant: {
    required: 'number',
    label: 'Spring Constant (N/m)',
    type: 'number',
    min: 0,
  },
  tip_geometry: {
    required: 'boolean',
    label: 'Tip Geometry',
    type: 'select',
    options: ['cylinder', 'cone', 'sphere', 'pyramid'],
  },
  tip_radius: {
    required: 'boolean',
    label: 'Tip Radius (nm)',
    type: 'number',
    min: 0,
  },
};

// Active validation rules used during file processing workflow.
const activeValidationRules = {
  file_id: metadataValidationRules.file_id,
  date: metadataValidationRules.date,
  spring_constant: metadataValidationRules.spring_constant,
  tip_geometry: metadataValidationRules.tip_geometry,
  tip_radius: metadataValidationRules.tip_radius,
};

// --- helpers that don't depend on React state ---

// Converts flat file structure (CSV/TXT) into a normalized group structure for consistent processing.
const getFakeGroupForFlatFile = (struct) => {
  const headers = struct.headers || struct.sample_rows[0] || [];
  let datasetNames = headers.slice(1);
  if (datasetNames.includes('Z (m)') && datasetNames.includes('Force (N)')) {
    datasetNames = ['Z (m)', 'Force (N)'].concat(
      datasetNames.filter((col) => !['Z (m)', 'Force (N)'].includes(col))
    );
  }
  const fakeDatasets = datasetNames.map((name) => ({
    path: name,
    name,
    shape: [struct.sample_rows.length - 1],
    dtype: 'float64',
    attributes: {},
  }));
  // Normalizes metadata keys by converting to lowercase and replacing spaces with underscores.
  const normalizedMetadata = {};
  for (const [key, value] of Object.entries(struct.metadata || {})) {
    const normKey = key.toLowerCase().replace(/\s+/g, '_');
    normalizedMetadata[normKey] = value;
  }
  return { groups: { datasets: fakeDatasets }, datasets: [], attributes: normalizedMetadata };
};

// Navigates to the first curve/segment in hierarchical file structures for initial display.
const navigateToFirstSegment = (initialGroup, initialPath = []) => {
  if (!initialGroup.groups) {
    return { group: initialGroup, path: initialPath };
  }
  let group = initialGroup;
  let path = [...initialPath];

  const firstCurve = Object.keys(group.groups || {}).find(
    (key) => key !== 'datasets' && key !== 'attributes'
  );
  if (!firstCurve) {
    return { group, path };
  }
  group = group.groups[firstCurve];
  path = [...path, firstCurve];

  const firstSegment = Object.keys(group.groups || {}).find(
    (key) => key !== 'datasets' && key !== 'attributes'
  );
  if (firstSegment) {
    group = group.groups[firstSegment];
    path = [...path, firstSegment];
  }
  return { group, path };
};

export const useFileOpener = ({ onProcessSuccess, setIsLoading }) => {
  // Controls whether the file opener dialog is currently visible.
  const [open, setOpen] = useState(false);
  // Tracks the current step index in the file opening wizard.
  const [step, setStep] = useState(0);
  // Stores the file path of the currently selected file.
  const [filePath, setFilePath] = useState('');
  // Stores the detected file type (json, hdf5, csv, txt).
  const [fileType, setFileType] = useState('');
  // Stores the parsed file structure returned from the backend.
  const [structure, setStructure] = useState(null);
  // Stores the current group being displayed in the navigation UI.
  const [currentGroup, setCurrentGroup] = useState({
    groups: {},
    datasets: [],
    attributes: {},
  });
  // Stores the navigation path through the hierarchical file structure.
  const [navigationPath, setNavigationPath] = useState([]);
  // Stores the selected path to the Force dataset within the file.
  const [forcePath, setForcePath] = useState('');
  // Stores the selected path to the Z dataset within the file.
  const [zPath, setZPath] = useState('');
  // Stores the selected path to the metadata location within the file.
  const [metadataPath, setMetadataPath] = useState('');
  // Stores the metadata values entered or extracted from the file.
  const [metadata, setMetadata] = useState({});
  // Tracks validation errors to display in the UI.
  const [errors, setErrors] = useState([]);
  // Tracks warnings to display in the UI.
  const [warnings, setWarnings] = useState([]);
  // Indicates when a file operation is in progress.
  const [loading, setLoading] = useState(false);
  // Indicates when the dialog is ready to be displayed after file structure is loaded.
  const [isDialogReady, setIsDialogReady] = useState(false);

  // Defines the step labels for the file opening wizard.
  const steps = [
    'Select Force Dataset',
    'Select Z Dataset',
    'Select Metadata Location',
    'Enter Metadata',
  ];

  // Validates metadata fields against validation rules and returns true if all valid.
  const validateMetadata = useCallback(() => {
    const newErrors = [];
    Object.entries(metadata).forEach(([key, value]) => {
      const rule = activeValidationRules[key] || { required: false, label: key };
      if (rule.required && (!value || value.toString().trim() === '')) {
        newErrors.push(`${rule.label} is required`);
      }
      if (rule.type === 'number' && value) {
        const numValue = parseFloat(value);
        if (Number.isNaN(numValue)) {
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
  }, [metadata]);

  // Opens file picker dialog and processes the selected file through the backend.
  const handleOpenFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.hdf5,.csv,.txt';

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      setLoading(true);
      setIsLoading(true);
      setIsDialogReady(false);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const response = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/experiment/load-experiment`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const result = await response.json();

        if (result.status === 'error') {
          setErrors(result.errors || [result.message]);
          alert(`Failed to open file: ${result.message}`);
          return;
        }

        if (result.status === 'structure') {
          setFilePath(result.filename);
          setFileType(result.file_type);
          setStructure(result.structure);
          setErrors([]);
          setWarnings([]);
          setStep(0);
          setOpen(true);
          setIsDialogReady(true);

          let initialGroup;
          let initialPath = [];

          if (result.file_type === 'csv' || result.file_type === 'txt') {
            initialGroup = getFakeGroupForFlatFile(result.structure);
          } else {
            const { group, path } = navigateToFirstSegment(result.structure);
            initialGroup = { ...group };
            initialPath = path;
          }

          setCurrentGroup(initialGroup);
          setNavigationPath(initialPath);
        }
      } catch (err) {
        // Prevent crash if backend communication fails
        const errorMessage = err.message.includes('HTTP error')
          ? 'Failed to communicate with server'
          : err.message;
        setErrors([errorMessage]);
        alert(`Failed to open file: ${errorMessage}`);
      } finally {
        setLoading(false);
        setIsLoading(false);
      }
    };

    input.click();
  }, [setIsLoading]);

  // Navigates to a subgroup within the hierarchical file structure.
  const navigateToGroup = useCallback(
    (groupName) => {
      if (fileType === 'csv' || fileType === 'txt') return;
      let group = structure;
      const newPath = [...navigationPath, groupName];

      try {
        for (const part of newPath) {
          if (!group.groups || !group.groups[part]) {
            setErrors([`Group not found: ${part}`]);
            return;
          }
          group = group.groups[part];
        }
        setCurrentGroup(group);
        setNavigationPath(newPath);

        if (
          !group.datasets?.length &&
          !Object.keys(group.groups || {}).length &&
          !Object.keys(group.attributes || {}).length
        ) {
          setWarnings([`No datasets, subgroups, or attributes found in ${newPath.join('/')}`]);
        }
      } catch {
        // Prevent crash if navigation fails
        setErrors(['Error navigating group structure']);
      }
    },
    [fileType, structure, navigationPath]
  );

  // Navigates back one level in the hierarchical file structure.
  const goBack = useCallback(() => {
    if (fileType === 'csv' || fileType === 'txt') return;
    if (navigationPath.length === 0) return;

    const newPath = navigationPath.slice(0, -1);
    let group = structure;

    try {
      for (const part of newPath) {
        if (!group.groups || !group.groups[part]) {
          setErrors([`Group not found: ${part}`]);
          return;
        }
        group = group.groups[part];
      }
      setCurrentGroup(group);
      setNavigationPath(newPath);

      if (
        !group.datasets?.length &&
        !Object.keys(group.groups || {}).length &&
        !Object.keys(group.attributes || {}).length
      ) {
        setWarnings([
          `No datasets, subgroups, or attributes found in ${newPath.join('/') || 'Root'}`,
        ]);
      }
    } catch {
      // Prevent crash if back navigation fails
      setErrors(['Error navigating back']);
    }
  }, [fileType, navigationPath, structure]);

  // Handles selection of the Force dataset and advances to the next step.
  const handleSelectForce = useCallback(
    (path) => {
      setForcePath(path);

      let newGroup;
      let newPath;
      if (fileType === 'csv' || fileType === 'txt') {
        newGroup = getFakeGroupForFlatFile(structure);
        newPath = [];
      } else {
        const { group, path: np } = navigateToFirstSegment(structure);
        newGroup = { ...group };
        newPath = np;
      }

      setCurrentGroup(newGroup || structure);
      setNavigationPath(newPath || []);
      setStep(1);
    },
    [fileType, structure]
  );

  // Handles selection of the Z dataset and advances to the metadata selection step.
  const handleSelectZ = useCallback(
    (path) => {
      setZPath(path);

      let newGroup;
      let newPath = [];

      if (fileType === 'csv' || fileType === 'txt') {
        newGroup = getFakeGroupForFlatFile(structure);
        newPath = [];
        setCurrentGroup(newGroup);
        setNavigationPath(newPath);
        setStep(2);
        return;
      }

      let group = structure;
      try {
        if (group.groups?.curve0?.groups?.segment0) {
          newGroup = group.groups.curve0.groups.segment0;
          newPath = ['curve0', 'segment0'];
        } else {
          const { group: fallbackGroup, path: fallbackPath } = navigateToFirstSegment(structure);
          newGroup = fallbackGroup;
          newPath = fallbackPath;
        }
        setCurrentGroup(newGroup);
        setNavigationPath(newPath);
        setStep(2);
      } catch {
        // Prevent crash if navigation to segment0 fails
        setErrors(['Failed to navigate to segment0 for metadata selection']);
        setCurrentGroup(structure);
        setNavigationPath([]);
        setStep(2);
      }
    },
    [fileType, structure]
  );

  // Handles selection of metadata location and extracts metadata from that location.
  const handleSelectMetadata = useCallback(
    (path) => {
      if (fileType === 'csv' || fileType === 'txt') {
        let attributes = {};
        if (path === 'root') {
          attributes = currentGroup.attributes || {};
        } else {
          const possibleDatasets = currentGroup.groups?.datasets || [];
          const dataset = possibleDatasets.find(
            (ds) => ds.path === path || ds.name === path
          );
          if (!dataset) {
            setErrors(['Dataset not found for metadata: ' + path]);
            return;
          }
          attributes = dataset.attributes || {};
        }

        // Initializes metadata object with empty values for all required fields.
        const initializedMetadata = Object.keys(activeValidationRules).reduce((acc, key) => {
          acc[key] = '';
          return acc;
        }, {});
        const mergedMetadata = { ...initializedMetadata, ...attributes };

        if (Object.keys(attributes).length === 0) {
          setWarnings((prev) => [
            ...prev,
            `No attributes found at ${path}. Enter metadata manually.`,
          ]);
        }

        setMetadata(mergedMetadata);
        setMetadataPath(path);
        setStep(4);
        return;
      }

      let target = structure;
      const pathParts = path.split('/');

      try {
        if (path === 'root') {
          target = structure;
        } else {
          for (let i = 0; i < pathParts.length; i++) {
            const part = pathParts[i];
            if (target.groups && target.groups[part]) {
              target = target.groups[part];
            } else {
              const possibleDatasets = [
                ...(target.groups?.datasets || []),
              ];
              const dataset = possibleDatasets.find(
                (ds) =>
                  ds.name === part ||
                  ds.path === path ||
                  ds.path.endsWith(`/${part}`)
              );
              if (dataset) {
                target = dataset;
                break;
              }
              throw new Error(
                `Path part ${part} not found at ${pathParts.slice(0, i + 1).join('/')}`
              );
            }
          }
        }

        // Extracts attributes from the target location, checking multiple possible locations.
        let attributes = {};
        if (target.attributes && Object.keys(target.attributes).length > 0) {
          attributes = target.attributes;
        } else if (
          target.groups &&
          target.groups.attributes &&
          Object.keys(target.groups.attributes).length > 0
        ) {
          attributes = target.groups.attributes;
        } else if (target.datasets && target.datasets.length > 0) {
          for (const dataset of target.datasets) {
            if (dataset.attributes && Object.keys(dataset.attributes).length > 0) {
              attributes = dataset.attributes;
              break;
            }
          }
        }

        // Initializes metadata object with empty values for all required fields.
        const initializedMetadata = Object.keys(activeValidationRules).reduce(
          (acc, key) => {
            acc[key] = '';
            return acc;
          },
          {}
        );
        const mergedMetadata = { ...initializedMetadata, ...attributes };

        if (Object.keys(attributes).length === 0) {
          setWarnings((prev) => [
            ...prev,
            `No attributes found at ${path}. Enter metadata manually.`,
          ]);
        }

        setMetadata(mergedMetadata);
        setMetadataPath(path);
        setStep(4);
      } catch (error) {
        // Prevent crash if metadata path is invalid
        setErrors([`Invalid metadata location: ${path}. ${error.message}`]);
      }
    },
    [fileType, currentGroup, structure]
  );

  // Handles changes to metadata input fields and clears related validation errors.
  const handleMetadataChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setMetadata((prev) => ({ ...prev, [name]: value }));
      // Clears errors related to this field when user starts editing.
      setErrors((prev) =>
        prev.filter(
          (error) =>
            !error.includes(metadataValidationRules[name]?.label || name)
        )
      );
    },
    []
  );

  // Handles clicking on a previous step in the wizard to navigate backwards.
  const handleStepClick = useCallback(
    (stepIndex) => {
      if (stepIndex >= step) return;
      setStep(stepIndex);

      if (stepIndex === 0 || stepIndex === 1 || stepIndex === 2) {
        let newGroup;
        let newPath;
        if (fileType === 'csv' || fileType === 'txt') {
          newGroup = getFakeGroupForFlatFile(structure);
          newPath = [];
        } else {
          const { group, path } = navigateToFirstSegment(structure);
          newGroup = { ...group };
          newPath = path;
        }

        setCurrentGroup(newGroup);
        setNavigationPath(newPath);
      }
    },
    [step, fileType, structure]
  );

  // Submits the file processing request with all selected paths and metadata to the backend.
  const handleSubmit = useCallback(async () => {
    if (!validateMetadata()) {
      alert('Please fix the metadata errors before submitting.');
      return;
    }

    setLoading(true);
    setIsLoading(true);

    try {
      // Converts numeric metadata fields to proper number types before sending.
      const processedMetadata = { ...metadata };
      Object.keys(processedMetadata).forEach((key) => {
        if (metadataValidationRules[key]?.type === 'number') {
          processedMetadata[key] = parseFloat(processedMetadata[key]);
        }
      });

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/experiment/process-file`,
        {
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
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || `HTTP error! Status: ${response.status}`
        );
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
        onProcessSuccess(result);
      }

      // Resets all state after successful processing.
      setFilePath('');
      setFileType('');
      setStructure(null);
      setForcePath('');
      setZPath('');
      setMetadataPath('');
      setMetadata({});
      setErrors([]);
    } catch (err) {
      // Prevent crash if backend processing fails
      let errorMessage = err.message;
      try {
        const errorData = await err.response?.json();
        errorMessage =
          errorData?.message || errorData?.errors?.join(', ') || err.message;
      } catch {
        errorMessage = err.message.includes('HTTP error')
          ? 'Failed to communicate with server'
          : err.message;
      }
      setErrors([errorMessage]);
      alert(`Failed to process file: ${errorMessage}`);
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  }, [
    validateMetadata,
    metadata,
    filePath,
    fileType,
    forcePath,
    zPath,
    metadataPath,
    onProcessSuccess,
    setIsLoading,
  ]);

  useEffect(() => {
    if (open && step <= 3) {
      // debug logging if needed
    }
  }, [currentGroup, open, step, navigationPath]);

  return {
    // state
    open,
    step,
    steps,
    errors,
    warnings,
    loading,
    isDialogReady,
    navigationPath,
    currentGroup,
    metadata,
    metadataPath,
    forcePath,
    zPath,
    // actions
    setOpen,
    handleOpenFile,
    handleStepClick,
    handleSelectForce,
    handleSelectZ,
    handleSelectMetadata,
    handleMetadataChange,
    handleSubmit,
    goBack,
    navigateToGroup,
  };
};

