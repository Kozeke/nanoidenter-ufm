// Renders the export button UI and dialog workflow using the useExportDialog hook.
import React from 'react';
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
import { useExportDialog } from '../hooks/useExportDialog';

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
  // Optional custom trigger renderer; defaults to a simple button.
  renderTrigger,
}) => {
  const {
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
    curveIds,
    numCurves,
    regularFilters,
    cpFilters,
    forceModels,
    elasticityModels,
    setOpen,
    setExportPath,
    setLevelNames,
    setMetadataPath,
    setDatasetPath,
    clearErrorContains,
    setExportType,
    setDatasetType,
    setDirection,
    setLoose,
    setEditableSoftMechMetadata,
    handleExportStart: hookHandleExportStart,
    handleNext,
    handleBack,
    handleSubmit,
    getSteps,
    getStepDescription,
    generateHdf5Preview,
    handleMetadataChange,
    handleStepClick,
    metadataValidationRules,
  } = useExportDialog();

  // Controls the menu anchor element for the format selection dropdown.
  const [anchorEl, setAnchorEl] = React.useState(null);

  // Opens the format selection menu.
  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);

  // Closes the format selection menu.
  const handleMenuClose = () => setAnchorEl(null);

  // Wraps the hook's handleExportStart to also close the menu.
  const handleExportStart = (format) => {
    handleMenuClose();
    hookHandleExportStart(format);
  };

  return (
    <Box display="inline-block">
      {renderTrigger ? (
        renderTrigger(handleMenuOpen, !isMetadataReady || isExporting)
      ) : (
        <button
          onClick={handleMenuOpen}
          disabled={!isMetadataReady || isExporting}
          style={actionBtnStyle("primary", !isMetadataReady || isExporting)}
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
          onClick={() => handleExportStart('csv')}
        >
          CSV (with SoftMech options)
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
                      <strong>Contact Point Filters:</strong>{' '}
                      {Object.keys(cpFilters).length > 0
                        ? Object.keys(cpFilters).join(', ')
                        : 'None'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Force Models:</strong>{' '}
                      {Object.keys(forceModels).length > 0
                        ? Object.keys(forceModels).join(', ')
                        : 'None'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Elasticity Models:</strong>{' '}
                      {Object.keys(elasticityModels).length > 0
                        ? Object.keys(elasticityModels).join(', ')
                        : 'None'}
                    </Typography>
                  </Box>

                  {/* Extra warning for average export without CP filters */}
                  {exportType === 'average' && Object.keys(cpFilters).length === 0 && (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      Average CSV export requires contact-point filters. Please go to the sidebar
                      and configure at least one CP filter before continuing.
                    </Alert>
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
                      
                      {/* <TextField
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
                      /> */}
                      
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
                  
                  {/* <TextField
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
                  /> */}
                  
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