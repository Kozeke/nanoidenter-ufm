// Manages export dialog workflow and validation for data export operations.
import { useState, useCallback, useEffect, useMemo } from 'react';
import { saveAs } from 'file-saver';
import { useMetadata } from '../components/Dashboard';
import { useDashboardStore } from '../state/useDashboardStore';
import { useAuthStore } from '../state/useAuthStore';
// Tip radius and velocity are always stored in SI units (meters, meters/second) in the
// database; the export dialog displays/edits them in mm and µm/s to match the import
// and dataset-editing UIs.
import { METERS_TO_MILLIMETERS, METERS_TO_MICROMETERS } from '../config/datasetMetadataFields';
// tip_angle, velocity, sensor_type, force_scale_to_n and z_scale_to_m live on the `datasets`
// table, not on the per-curve `force_vs_z` table that backs `metadataObject.sample_row`, so
// they must be fetched separately via the dataset details endpoint to populate this dialog.
import { getDataset } from '../api/datasets';

// Returns today's date as YYYY-MM-DD, used to auto-fill the export "Date" field.
const todayIso = () => new Date().toISOString().slice(0, 10);

// Falls back to today's date whenever the source value (DB sample row, experiment
// metadata, etc.) is blank or not already in YYYY-MM-DD form (e.g. a raw ingest
// timestamp), so users on any environment never have to type a date in manually.
const normalizeDateOrToday = (value) => {
  const str = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : todayIso();
};

export const useExportDialog = (experimentDataOrFn = null) => {
  // Get authentication token
  const token = useAuthStore((s) => s.token);
  
  const { metadataObject } = useMetadata();
  const {
    filters: dashboardFilters,
    numCurves: storeNumCurves,
    selectedExportCurveIds,
    isLoadingExport,
    setIsLoadingExport,
    setLoadingMulti,
    // Stores force model parameters (maxInd, minInd, poisson) used for Hertz fit calculations.
    forceModelParams: dashboardForceModelParams,
    modelStats,
    // Identifies the currently loaded dataset so its full metadata can be fetched below.
    datasetId,
  } = useDashboardStore();

  // Stores tip_angle/velocity/sensor_type/force_scale_to_n/z_scale_to_m fetched from the
  // dataset details endpoint (these live on the `datasets` table only, never on `force_vs_z`,
  // so `metadataObject.sample_row` alone can never supply them).
  const [datasetLevelMetadata, setDatasetLevelMetadata] = useState({});

  useEffect(() => {
    // experimentDataOrFn exports (e.g. from the "My Experiments" list) are not guaranteed to
    // correspond to the store's currently loaded dataset, so this fetch is skipped there to
    // avoid attaching an unrelated dataset's metadata to the exported experiment.
    if (!token || !datasetId || experimentDataOrFn) {
      setDatasetLevelMetadata({});
      return;
    }
    // Tracks mount status to avoid setting state after this hook's consumer unmounts.
    let mounted = true;
    // Prevent crash if the dataset lookup fails (e.g. network issue or stale dataset id).
    getDataset(token, datasetId)
      .then((data) => {
        if (mounted) setDatasetLevelMetadata(data?.metadata || {});
      })
      .catch(() => {
        if (mounted) setDatasetLevelMetadata({});
      });
    return () => {
      mounted = false;
    };
  }, [token, datasetId, experimentDataOrFn]);
  
  // Get experiment data - can be a value or a function that returns it
  const getExperimentData = useCallback(() => {
    if (typeof experimentDataOrFn === 'function') {
      return experimentDataOrFn();
    }
    return experimentDataOrFn;
  }, [experimentDataOrFn]);
  
  // Get current experiment data
  const experimentData = getExperimentData();
  
  // Use experiment data if provided, otherwise use dashboard store
  const filters = experimentData?.filters ?? dashboardFilters;
  const forceModelParams = experimentData?.force_model_params ?? dashboardForceModelParams;

  // Indicates whether metadata is ready once we have at least one sample row.
  // For experiment exports, use experiment metadata if available
  const experimentMetadata = experimentData?.metadata;
  const isMetadataReady = experimentMetadata ? true : !!metadataObject?.sample_row;

  // Converts a stored SI (meters) tip radius to the mm string shown in the HDF5/JSON/TXT
  // "Enter Metadata" step. The HDF5 exporter always writes the tip group's "unit" attribute
  // as "mm", so the value it receives from this form must already be in millimeters.
  const tipRadiusMetersToDisplayMm = useCallback((storedMeters) => {
    if (storedMeters == null || storedMeters === '') return '';
    const numeric = parseFloat(storedMeters);
    return Number.isFinite(numeric) ? String(numeric * METERS_TO_MILLIMETERS) : '';
  }, []);

  // Converts a stored SI (m/s) velocity to the µm/s string shown in the "Enter Metadata" step,
  // matching the µm/s convention already used on import and in the dataset-editing modal.
  const velocityMetersPerSecondToDisplayUm = useCallback((storedMetersPerSecond) => {
    if (storedMetersPerSecond == null || storedMetersPerSecond === '') return '';
    const numeric = parseFloat(storedMetersPerSecond);
    return Number.isFinite(numeric) ? String(numeric * METERS_TO_MICROMETERS) : '';
  }, []);

  // Stores initial metadata values derived from the database sample row or experiment data.
  // tip_angle, sensor_type and force_scale_to_n only exist on the `datasets` table, so for the
  // Dashboard's own dataset they come from datasetLevelMetadata (fetched above). Experiment
  // exports (e.g. from the "My Experiments" list) don't carry these fields and are not fetched
  // above (see the guard in that effect), so they simply default to empty here.
  const initialMetadata = useMemo(
    () => {
      if (experimentMetadata) {
        return {
          file_id: String(experimentMetadata.file_id ?? ''),
          date: normalizeDateOrToday(experimentMetadata.date),
          spring_constant: String(experimentMetadata.spring_constant ?? ''),
          tip_geometry: String(experimentMetadata.tip_geometry ?? 'sphere'),
          tip_radius: tipRadiusMetersToDisplayMm(experimentMetadata.tip_radius),
          velocity: velocityMetersPerSecondToDisplayUm(experimentMetadata.velocity),
          tip_angle: String(experimentMetadata.tip_angle ?? ''),
          sensor_type: String(experimentMetadata.sensor_type ?? ''),
          force_scale_to_n: String(experimentMetadata.force_scale_to_n ?? ''),
        };
      }
      return {
        file_id: String(metadataObject.sample_row?.file_id ?? ''),
        date: normalizeDateOrToday(metadataObject.sample_row?.date),
        spring_constant: String(metadataObject.sample_row?.spring_constant ?? ''),
        tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
        tip_radius: tipRadiusMetersToDisplayMm(metadataObject.sample_row?.tip_radius),
        velocity: velocityMetersPerSecondToDisplayUm(
          metadataObject.sample_row?.velocity ?? datasetLevelMetadata.velocity
        ),
        tip_angle: String(metadataObject.sample_row?.tip_angle ?? datasetLevelMetadata.tip_angle ?? ''),
        sensor_type: String(metadataObject.sample_row?.sensor_type ?? datasetLevelMetadata.sensor_type ?? ''),
        force_scale_to_n: String(
          metadataObject.sample_row?.force_scale_to_n ?? datasetLevelMetadata.force_scale_to_n ?? ''
        ),
      };
    },
    [
      metadataObject.sample_row,
      experimentMetadata,
      datasetLevelMetadata,
      tipRadiusMetersToDisplayMm,
      velocityMetersPerSecondToDisplayUm,
    ]
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
  const [metadataPath, setMetadataPath] = useState('curve0/tip');
  // Stores the dataset path location within HDF5 file (the Force dataset; the backend
  // always writes a sibling "Z" dataset next to it under the same segment group).
  const [datasetPath, setDatasetPath] = useState('curve0/segment0/Force');
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
  // sample_row (from `force_vs_z`) never has a velocity column, so this falls back to
  // datasetLevelMetadata.velocity (fetched separately from the `datasets` table) before
  // defaulting to 1e-6 m/s.
  const [editableSoftMechMetadata, setEditableSoftMechMetadata] = useState({
    file_id: String(metadataObject.sample_row?.file_id ?? ''),
    date: normalizeDateOrToday(metadataObject.sample_row?.date),
    spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
    tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
    // sample_row.tip_radius is stored in meters (SI); convert to mm for display/editing.
    tip_radius: (parseFloat(metadataObject.sample_row?.tip_radius) || 0) * METERS_TO_MILLIMETERS,
    // Stored in meters/second (SI); convert to µm/s for display/editing.
    velocity: (parseFloat(metadataObject.sample_row?.velocity ?? datasetLevelMetadata.velocity) || 1e-6) * METERS_TO_MICROMETERS,
    // Stores tip angle in degrees so CSV and HDF5 exports can share the same literal metadata value.
    tip_angle: String(metadataObject.sample_row?.tip_angle ?? datasetLevelMetadata.tip_angle ?? ''),
    // Stores force conversion coefficient verbatim so both CSV and HDF5 receive the same field/value.
    force_scale_to_n: String(
      metadataObject.sample_row?.force_scale_to_n ?? datasetLevelMetadata.force_scale_to_n ?? ''
    ),
  });

  // Derived values
  // Extracts curve IDs from store or defaults to empty array. Filters out synthetic
  // diagnostic overlay ids (e.g. "0_linfit", "avg_linfit", "0_hertz") that filters like
  // LinearWindowFit/Hertz add to the on-screen curve list for display purposes only —
  // those aren't real curves in the database and the export endpoint rejects them with
  // "Invalid curve_id format". Only "curve{id}"-shaped ids are ever exportable.
  const curveIds =
    selectedExportCurveIds && selectedExportCurveIds.length > 0
      ? selectedExportCurveIds.filter((id) => /^curve\d+$/.test(String(id)))
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

  // Update editable metadata when database metadata changes.
  // sample_row never carries velocity (see note above), so datasetLevelMetadata.velocity is
  // used as the fallback source before defaulting to 1e-6 m/s.
  useEffect(() => {
    if (metadataObject.sample_row) {
      setEditableSoftMechMetadata({
        file_id: String(metadataObject.sample_row?.file_id ?? ''),
        date: normalizeDateOrToday(metadataObject.sample_row?.date),
        spring_constant: parseFloat(metadataObject.sample_row?.spring_constant) || 0,
        tip_geometry: String(metadataObject.sample_row?.tip_geometry ?? 'sphere'),
        // sample_row.tip_radius is stored in meters (SI); convert to mm for display/editing.
        tip_radius: (parseFloat(metadataObject.sample_row?.tip_radius) || 0) * METERS_TO_MILLIMETERS,
        // Stored in meters/second (SI); convert to µm/s for display/editing.
        velocity: (parseFloat(metadataObject.sample_row?.velocity ?? datasetLevelMetadata.velocity) || 1e-6) * METERS_TO_MICROMETERS,
        // Keeps the tip-angle field available in CSV metadata payloads.
        tip_angle: String(metadataObject.sample_row?.tip_angle ?? datasetLevelMetadata.tip_angle ?? ''),
        // Keeps force conversion coefficient aligned across CSV and HDF5 metadata payloads.
        force_scale_to_n: String(
          metadataObject.sample_row?.force_scale_to_n ?? datasetLevelMetadata.force_scale_to_n ?? ''
        ),
      });
    } else {
      setEditableSoftMechMetadata({
        file_id: String(initialMetadata.file_id ?? ''),
        date: String(initialMetadata.date ?? ''),
        spring_constant: parseFloat(initialMetadata.spring_constant) || 0,
        tip_geometry: String(initialMetadata.tip_geometry ?? 'sphere'),
        // initialMetadata.tip_radius is already converted to mm above; reuse it as-is.
        tip_radius: parseFloat(initialMetadata.tip_radius) || 0,
        // initialMetadata.velocity is already converted to µm/s above; reuse it as-is.
        velocity: parseFloat(initialMetadata.velocity) || 1,
        // initialMetadata.tip_angle is already normalized above; reuse it as-is.
        tip_angle: String(initialMetadata.tip_angle ?? ''),
        // initialMetadata.force_scale_to_n is already normalized above; reuse it as-is.
        force_scale_to_n: String(initialMetadata.force_scale_to_n ?? ''),
      });
    }
  }, [metadataObject.sample_row, initialMetadata, datasetLevelMetadata]);

  // Keeps the generic (HDF5/JSON/TXT) "Enter Metadata" form in sync with initialMetadata,
  // since useState(initialMetadata) above only applies its argument on first render and would
  // otherwise miss the sample_row/datasetLevelMetadata values that arrive slightly later.
  useEffect(() => {
    setMetadata(initialMetadata);
  }, [initialMetadata]);

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
    if (Number.isFinite(+d.velocity) && +d.velocity > 0) {
      clearErrorContains('velocity');
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
        'Choose the type of CSV export: Raw data, Average curves.', // or Scatter data.
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

  // Metadata validation rules - Essential fields only.
  // file_id is intentionally excluded: it is auto-populated from the dataset's own
  // file_id (see initialMetadata above) and every exporter (HDF5/JSON/TXT) already writes
  // each curve's authoritative file_id straight from the database, so exposing a manually
  // edited copy here was redundant and never actually overrode the exported value.
  // Rules may declare a `storageScale` (display value = stored SI value × storageScale),
  // matching the convention used in datasetMetadataFields.js/fileOpenerMetadata.js. The
  // payload-building code below divides by storageScale to convert back to SI before sending,
  // EXCEPT for tip_radius: the HDF5 exporter is hardcoded to treat that value as millimeters
  // directly (see hdf5.py), so it intentionally has no storageScale here.
  const metadataValidationRules = {
    date: { required: true, label: 'Date', type: 'text', regex: /^\d{4}-\d{2}-\d{2}$/, regexError: 'Date must be in YYYY-MM-DD format' },
    spring_constant: { required: true, label: 'Spring Constant (N/m)', type: 'number', min: 0 },
    tip_geometry: { required: true, label: 'Tip Geometry', type: 'select', options: ['sphere', 'cylinder', 'cone', 'pyramid'] },
    // HDF5/JSON/TXT exports store this value verbatim as the tip group's "value" attribute,
    // and the exporter always sets that attribute's "unit" to "mm", so this field must be mm.
    tip_radius: { required: true, label: 'Tip Radius (mm)', type: 'number', min: 0 },
    // Optional fields below only exist on the `datasets` table (see datasetLevelMetadata).
    // 0 is a valid sentinel (unknown tip angle); do not enforce min > 0.
    tip_angle: { required: false, label: 'Tip Angle (deg)', type: 'number' },
    sensor_type: { required: false, label: 'Sensor Type', type: 'text' },
    // Stored/exported as-is in mN/V, matching the dataset-editing modal (no SI conversion).
    force_scale_to_n: { required: false, label: 'Force conversion coefficient (mN/V)', type: 'number' },
    // Stored in m/s (SI); displayed/edited in µm/s, so this gets converted back on submit.
    velocity: { required: false, label: 'Velocity (µm/s)', type: 'number', min: 0, storageScale: METERS_TO_MICROMETERS },
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
      
      // Validate tip radius (entered in mm; equivalent to the previous 1,000,000 nm bound)
      if (softmechData.tip_radius <= 0 || softmechData.tip_radius > 1) {
        newErrors.push('Tip radius must be greater than 0 and less than 1 mm');
      }

      // Validate velocity (entered in µm/s; equivalent to the previous 1000 m/s bound)
      if (softmechData.velocity <= 0 || softmechData.velocity > 1e9) {
        newErrors.push('Velocity must be greater than 0 and less than 1,000,000,000 µm/s');
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

      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/calculate-softmech-metadata`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          // Scopes curve/tip lookups to this dataset (see handleSubmit for rationale).
          dataset_id: datasetId,
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
          // Backend reports tip radius in nanometers (tip_radius_nm); convert to mm for display
          // so this field stays consistent with the mm convention used across the export dialog.
          // 1 mm = 1e6 nm, so dividing by NM_PER_MM converts nanometers to millimeters.
          const NM_PER_MM = 1e6;
          const tipRadiusNm = parseFloat(metadata.tip_radius_nm) || 0;
          const tipRadiusMm = tipRadiusNm > NM_PER_MM ? 0.01 : tipRadiusNm / NM_PER_MM;
          const newEditableMetadata = {
            file_id: metadata.file_id || '',
            date: metadata.date || '',
            spring_constant: parseFloat(metadata.elastic_constant_nm) || 0,
            tip_geometry: metadata.tip_shape || 'sphere',
            tip_radius: tipRadiusMm,
            // Preserves loaded velocity (already in µm/s) when calculated metadata response has no velocity field.
            velocity: Number.isFinite(+editableSoftMechMetadata.velocity) && +editableSoftMechMetadata.velocity > 0
              ? +editableSoftMechMetadata.velocity
              : 1,
            // Preserves user-provided tip angle when calculated metadata response does not include it.
            tip_angle: String(editableSoftMechMetadata.tip_angle ?? ''),
            // Preserves user-provided force conversion coefficient for CSV parity with HDF5 metadata.
            force_scale_to_n: String(editableSoftMechMetadata.force_scale_to_n ?? ''),
          };
          setEditableSoftMechMetadata(newEditableMetadata);
        }
      }
    } catch (error) {
      // Silently handle errors to prevent UI crashes
    } finally {
      setLoadingMetadata(false);
    }
  }, [selectedFormat, exportType, datasetType, direction, loose, curveIds, numCurves, datasetId, regularFilters, cpFilters, forceModels, elasticityModels, forceModelParams, editableSoftMechMetadata.velocity]);

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
        // Check experiment data first, then dashboard store
        const currentExpData = getExperimentData();
        const filtersToCheck = currentExpData?.filters ?? filters;
        const currentCpFilters = filtersToCheck?.cp_filters ?? cpFilters ?? {};
        if (
          exportType === 'average' &&
          (!currentCpFilters || Object.keys(currentCpFilters).length === 0)
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
      
      // Get current experiment data at export time
      const currentExpData = getExperimentData();
      
      // Extract Young's modulus formatted value from websocket model stats or experiment data
      const youngsModulusFormatted = currentExpData?.youngs_modulus_mean 
        ? `${currentExpData.youngs_modulus_mean} ± ${currentExpData.youngs_modulus_std || 0}`
        : (modelStats?.force?.[0]?.mean || null);
      
      // Use experiment curve_id if available, otherwise use selected curve IDs
      const experimentCurveId = currentExpData?.curve_id;
      const finalCurveIds = experimentCurveId 
        ? [experimentCurveId] 
        : (curveIds && curveIds.length > 0 ? curveIds : undefined);
      
      // Prepare payload with level names and metadata
        const payload = {
          export_path: exportPath,
          // Scopes the backend query to this dataset only. curve_id is only unique
          // per dataset, so without this, exporting "curve0" could also pull in
          // "curve0" rows that belong to a different dataset in the same database.
          dataset_id: datasetId,
          curve_ids: finalCurveIds,
          num_curves: finalCurveIds ? undefined : numCurves,
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
            // Pass the actual filters from the frontend or experiment data
            filters: (() => {
              const currentExpData = getExperimentData();
              if (currentExpData?.filters) {
                return currentExpData.filters;
              }
              return {
                regular: regularFilters,
                cp_filters: cpFilters,
                f_models: forceModels,
                e_models: elasticityModels
              };
            })(),
            // Pass editable metadata for all CSV exports (both raw and non-raw)
            softmech_metadata: editableSoftMechMetadata,
            // Pass Hertz fit window + poisson parameters for force model calculations.
            force_model_params: forceModelParamsPayload,
            // Pass Young's modulus formatted value from websocket stats
            youngs_modulus_formatted: youngsModulusFormatted,
            // K_raw / K_contact / E computed by the LinearWindowFit regular filter (see
            // linear_window_fit_filter.py / compute_derived()); undefined when that
            // filter isn't active, so the backend simply omits the corresponding line.
            k_raw_formatted: stiffnessResults.kRaw?.value ?? null,
            k_contact_formatted: stiffnessResults.kContact?.value ?? null,
            stiffness_youngs_modulus_formatted: stiffnessResults.youngsModulus?.value ?? null,
            // Per-curve K_raw / K_contact / E rows (one entry per curve_id), written
            // by the CSV exporter on top of each curve's own data block in raw
            // exports — the top-of-file values above stay the mean ± std average.
            kfit_by_curve: stiffnessResults.byCurve,
          }),
          // Only include metadata for non-CSV exports (HDF5, JSON, TXT, etc.)
          ...(selectedFormat !== 'csv') && {
            metadata: {
              ...Object.fromEntries(
                // Keeps non-CSV metadata literal (no unit conversion) so HDF5 values match CSV exports.
                // Excludes force_scale_to_n from non-CSV exports per export requirements.
                Object.entries(metadata)
                  .filter(([key]) => key !== 'force_scale_to_n')
                  .map(([key, value]) => [key, value])
              ),
              // K_raw / K_contact / E from the LinearWindowFit regular filter, written as
              // attributes on every curve's "tip" group by the HDF5 exporter (same mechanism
              // as spring_constant/tip_radius above). Only included when actually computed;
              // std falls back to 0 since h5py attrs can't store null/undefined.
              ...(stiffnessResults.kRaw?.mean != null && {
                k_raw_mean_n_per_m: stiffnessResults.kRaw.mean,
                k_raw_std_n_per_m: stiffnessResults.kRaw.std ?? 0,
              }),
              ...(stiffnessResults.kContact?.mean != null && {
                k_contact_mean_n_per_m: stiffnessResults.kContact.mean,
                k_contact_std_n_per_m: stiffnessResults.kContact.std ?? 0,
              }),
              ...(stiffnessResults.youngsModulus?.mean != null && {
                youngs_modulus_linfit_mean_pa: stiffnessResults.youngsModulus.mean,
                youngs_modulus_linfit_std_pa: stiffnessResults.youngsModulus.std ?? 0,
              }),
            },
          },
        };

      // Call backend export endpoint
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/export/${selectedFormat}`, {
        method: 'POST',
        headers,
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
      const fileHeaders = {};
      if (token) {
        fileHeaders['Authorization'] = `Bearer ${token}`;
      }
      
      const fileResponse = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/exports/${encodeURIComponent(exportPath)}`,
        { headers: fileHeaders }
      );
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

  // Surfaces the K_raw / K_contact / Young's modulus values computed by the LinearWindowFit
  // regular filter (see linear_window_fit_filter.py) so the export dialog can display them
  // as read-only fields. modelStats.stiffness is populated while that filter is active and
  // at least one chosen curve produced a valid fit (mean±std over the selected curve ids).
  const stiffnessResults = useMemo(() => {
    const list = modelStats?.stiffness || [];
    const find = (key) => list.find((item) => item?.key === key);
    return {
      kRaw: find('k_raw'),
      kContact: find('k_contact'),
      youngsModulus: find('youngs_modulus'),
      byCurve: modelStats?.stiffnessByCurve || [],
    };
  }, [modelStats]);

  // Derives the sibling "Z" dataset path shown alongside the Force dataset path, since the
  // backend always writes both "Force" and "Z" datasets under the same segment group and
  // ignores the exact leaf name of datasetPath beyond validation.
  const zDatasetPath = useMemo(() => {
    const trimmed = (datasetPath || '').trim();
    if (!trimmed) return '';
    const segments = trimmed.split('/');
    segments[segments.length - 1] = 'Z';
    return segments.join('/');
  }, [datasetPath]);

  // Generates a simple textual preview of HDF5 structure.
  const generateHdf5Preview = () => {
    return `Root
  - Group: curve0 (and similar for other curves)
    - Group: segment0
      - Dataset: Force
      - Dataset: Z
    - Group: tip (attributes: geometry, parameter, unit, value, and metadata)`;
  };

  // Initializes the export dialog for a specific format.
  const handleExportStart = (format) => {
    setSelectedFormat(format);
    // Timestamped filename avoids "file already exists" errors on re-export.
    const uniqueSuffix = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    setExportPath(`exports/processed_data_${uniqueSuffix}.${format}`);
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
    zDatasetPath,
    stiffnessResults,
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