import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  TextField,
  FormControl,
  InputLabel,
  FormHelperText,
  Typography,
  Alert,
  Box,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@mui/material';
import { useFileOpener } from '../hooks/useFileOpener';

// same styles as before
// Applies consistent button styling matching the application's design system.
const actionBtnStyle = (variant = 'primary', disabled = false) => {
  const base = {
    padding: '8px 12px',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: '10px',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition:
      'transform .04s ease, box-shadow .15s ease, background .15s ease',
    whiteSpace: 'nowrap',
  };
  if (disabled) {
    return {
      ...base,
      background: '#f5f6fb',
      color: '#9aa0b5',
      border: '1px solid #eceef7',
    };
  }
  if (variant === 'primary') {
    return {
      ...base,
      background: 'linear-gradient(180deg,#6772ff 0%,#5468ff 100%)',
      color: '#fff',
      boxShadow: '0 8px 16px rgba(90,105,255,.25)',
    };
  }
  if (variant === 'secondary') {
    return {
      ...base,
      background: '#fff',
      color: '#2c2f3a',
      border: '1px solid #e6e9f7',
      boxShadow: '0 2px 8px rgba(30,41,59,.06)',
    };
  }
  return base;
};

// Provides pressable button interaction effects.
const pressable = {
  onMouseDown: (e) => (e.currentTarget.style.transform = 'translateY(1px)'),
  onMouseUp: (e) => (e.currentTarget.style.transform = 'translateY(0)'),
  onMouseLeave: (e) => (e.currentTarget.style.transform = 'translateY(0)'),
};

const FileOpener = ({ onProcessSuccess, setIsLoading, renderTrigger }) => {
  const {
    open,
    setOpen,
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
    handleOpenFile,
    handleStepClick,
    handleSelectForce,
    handleSelectZ,
    handleSelectMetadata,
    handleMetadataChange,
    handleSubmit,
    goBack,
  } = useFileOpener({ onProcessSuccess, setIsLoading });

  return (
    <div>
      {renderTrigger ? (
        renderTrigger(handleOpenFile)
      ) : (
        <button
          onClick={handleOpenFile}
          disabled={loading}
          style={actionBtnStyle('secondary', loading)}
          {...pressable}
        >
          Open file
        </button>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="sm"
        fullWidth
        disableEscapeKeyDown={loading}
        PaperProps={{
          sx: {
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 12px 28px rgba(20,20,43,0.12)',
            border: '1px solid #e9ecf5',
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 700,
            background: 'linear-gradient(180deg,#ffffff 0%,#fafbff 100%)',
            borderBottom: '1px solid #e9ecf5',
          }}
        >
          {steps[step]}
        </DialogTitle>
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
                background: '#f5f7ff',
                border: '1px solid #e9ecf5',
                padding: '10px',
                borderRadius: '10px',
                color: '#1d1e2c',
                fontWeight: 600,
              }}
            >
              {step === 0 && 'Please select the dataset containing Force data.'}
              {step === 1 &&
                'Please select the dataset containing Z (displacement) data.'}
              {step === 2 &&
                'Please select the group or dataset containing Metadata attributes.'}
              {step === 3 &&
                'Please enter or verify the Metadata fields below.'}
            </Typography>
          </Box>
          {errors.length > 0 && (
            <Box mb={2}>
              <Alert severity="error">
                <Typography variant="body2">Errors:</Typography>
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
          {loading && step <= 3 && (
            <Box display="flex" justifyContent="center" my={2}>
              <CircularProgress />
            </Box>
          )}
          {open && step <= 3 && !loading && isDialogReady && ( // Add isDialogReady to condition
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
                      if (value.includes('(Dataset')) {
                        const cleanPath = value.split(' (Dataset')[0];
                        if (step === 0) handleSelectForce(cleanPath);
                        else if (step === 1) handleSelectZ(cleanPath);
                        else if (step === 2) handleSelectMetadata(cleanPath);
                      } else if (value.includes('(Group')) {
                        const cleanPath = value.split(' (Group')[0];
                        if (step === 2) {
                          let fullPath;
                          if (cleanPath === 'current') {
                            fullPath = navigationPath.join('/') || 'root';
                          } else {
                            fullPath = [...navigationPath, cleanPath].join('/');
                          }
                          handleSelectMetadata(fullPath);
                        }
                      }
                    }}
                  >
                    {step === 2 &&
                      Object.keys(currentGroup.attributes || {}).length > 0 && (
                      <MenuItem 
                        value="current (Group)"
                          sx={{
                            fontSize: 14,
                            fontWeight: 600,
                            '&:hover': { background: '#f5f7ff' },
                          }}
                      >
                        Current Location (Group, Has Attributes)
                      </MenuItem>
                    )}

                    {Object.keys(currentGroup.groups || {})
                      .filter((key) => key !== 'datasets' && key !== 'attributes')
                      .map((name) => (
                        <MenuItem 
                          key={name} 
                          value={`${name} (Group)`}
                          sx={{
                            fontSize: 14,
                            fontWeight: 600,
                            '&:hover': { background: '#f5f7ff' },
                          }}
                        >
                          {name} (Group)
                          {Object.keys(currentGroup.groups[name].attributes || {})
                            .length > 0 && ' (Has Attributes)'}
                        </MenuItem>
                      ))}
                    {(currentGroup.groups?.datasets || []).map((ds) => (
                      <MenuItem
                        key={ds.path}
                        value={`${ds.path} (Dataset, Shape: ${ds.shape}, Dtype: ${ds.dtype})`}
                        disabled={
                          (step >= 1 && ds.path === forcePath) || // Disable forcePath in Steps 1, 2
                          (step >= 2 && ds.path === zPath)       // Disable zPath in Step 2
                        }
                        sx={{ fontSize: 14, fontWeight: 600, "&:hover": { background: "#f5f7ff" } }}
                      >
                        {ds.name} (Dataset, Shape: {ds.shape}, Dtype: {ds.dtype})
                        {Object.keys(ds.attributes || {}).length > 0 &&
                          ' (Has Attributes)'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {navigationPath.length > 0 && (
                  <button
                    onClick={goBack}
                    style={{ ...actionBtnStyle('secondary'), marginTop: 10 }}
                    {...pressable}
                  >
                    Up one level
                  </button>
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

              {Object.entries(metadata).map(([key, value]) => {
                // Special case: tip_geometry as dropdown
                if (key === 'tip_geometry') {
                  const options = ['sphere', 'cylinder', 'cone', 'pyramid'];

                  return (
                    <FormControl key={key} fullWidth margin="normal">
                      <InputLabel id="tip-geometry-label">Tip Geometry</InputLabel>
                      <Select
                        labelId="tip-geometry-label"
                        label="Tip Geometry"
                        value={value ?? ''}
                        // make sure we pass name + value in the same shape as TextField
                        onChange={(e) =>
                          handleMetadataChange({
                            target: { name: key, value: e.target.value },
                          })
                        }
                      >
                        {options.map((opt) => (
                          <MenuItem key={opt} value={opt}>
                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </MenuItem>
                        ))}
                      </Select>
                      <FormHelperText>Select the AFM tip geometry</FormHelperText>
                    </FormControl>
                  );
                }

                // Default: normal text field for all other metadata
                return (
                  <TextField
                    key={key}
                    name={key}
                    label={key.replace('_', ' ').toUpperCase()}
                    value={value ?? ''}
                    onChange={handleMetadataChange}
                    fullWidth
                    margin="normal"
                  />
                );
              })}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 8 }}>
          <button
            onClick={() => setOpen(false)}
            disabled={loading}
            style={actionBtnStyle('secondary', loading)}
            {...pressable}
          >
            Cancel
          </button>
          {step === 4 && (
            <button
              onClick={handleSubmit}
              disabled={errors.length > 0 || loading}
              style={actionBtnStyle('primary', errors.length > 0 || loading)}
              {...pressable}
            >
              Submit
            </button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FileOpener;