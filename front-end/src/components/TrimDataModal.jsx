// Modal dialog that lets users trim curve data by removing points outside a force range.
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  Alert,
  Box,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Tooltip,
} from '@mui/material';
import { useAuthStore } from '../state/useAuthStore';

// Consistent button styling aligned with the application design system.
const actionBtnStyle = (variant = 'primary', disabled = false) => {
  const base = {
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 700,
    borderRadius: '10px',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform .04s ease, box-shadow .15s ease, background .15s ease',
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
  // secondary variant
  return {
    ...base,
    background: '#fff',
    color: '#2c2f3a',
    border: '1px solid #e6e9f7',
  };
};

// Decomposes a numeric value into { mantissa, exponent } where mantissa ∈ [0.1, 1) or (−1, −0.1].
// Example: −0.0056 → { mantissa: '−0.56', exponent: −2 }
const normalizeToMantissaExp = (value) => {
  if (value == null || value === 0) return { mantissa: '0', exponent: 0 };
  // Compute the power of ten that shifts |value| into [0.1, 1).
  const exp = Math.floor(Math.log10(Math.abs(value))) + 1;
  const mantissa = value / Math.pow(10, exp);
  // Round to 10 significant digits to avoid floating-point noise in the display.
  const roundedMantissa = parseFloat(mantissa.toPrecision(10));
  return { mantissa: String(roundedMantissa), exponent: exp };
};

// TrimDataModal renders a dialog to collect force bounds and trigger server-side trimming.
// forceDomain — { yMin, yMax } pulled from graphForcevsZ.domain WebSocket batches — is used
// to pre-populate the inputs with the actual data range when the modal first opens.
const TrimDataModal = ({ open, onClose, datasetId, onSuccess, forceDomain }) => {
  // Authentication token used to authorise the trim request.
  const token = useAuthStore((s) => s.token);

  // Mantissa part of the lower force bound (shown in the editable input field).
  const [forceMinMantissa, setForceMinMantissa] = useState('');
  // Power-of-ten exponent for the lower force bound — kept as string so the field can be
  // temporarily empty while the user edits (e.g. clearing "0" to type "-2").
  const [forceMinExponent, setForceMinExponent] = useState('0');

  // Mantissa part of the upper force bound (shown in the editable input field).
  const [forceMaxMantissa, setForceMaxMantissa] = useState('');
  // Power-of-ten exponent for the upper force bound — same string-first strategy as forceMinExponent.
  const [forceMaxExponent, setForceMaxExponent] = useState('0');

  // When enabled, each curve is truncated at its peak-force index so only the
  // approach (loading) phase is kept and the retract phase is discarded.
  const [trimRetract, setTrimRetract] = useState(false);
  // When enabled, the absolute value is applied to every force sample in all
  // curves of the dataset before any other trimming takes place.
  const [absoluteForce, setAbsoluteForce] = useState(false);
  // When enabled, shift each curve's z values so the first z becomes 0:
  // z[i] -= z[0]. Requires all curves to have positive first and last z values.
  const [normalizeZ, setNormalizeZ] = useState(false);

  // Persisted flags fetched from the backend on every modal open.
  // When true the corresponding operation has already been applied to this
  // dataset and must not be applied a second time — the checkbox is disabled.
  const [alreadyAbsolute, setAlreadyAbsolute] = useState(false);
  const [alreadyRetractTrimmed, setAlreadyRetractTrimmed] = useState(false);
  // True once z-normalization has been written to the DB for this dataset.
  const [alreadyNormalizedZ, setAlreadyNormalizedZ] = useState(false);

  // True when every force value in the current dataset is already ≥ 0, so
  // applying |F| would have no effect and the checkbox should be disabled.
  const forceAlreadyPositive =
    forceDomain?.yMin != null && forceDomain.yMin >= 0;

  // The absolute checkbox is useful only when:
  //   • the data is not already positive, AND
  //   • it has not been applied in a previous trim call.
  const absoluteDisabled = forceAlreadyPositive || alreadyAbsolute;

  // The retract checkbox is disabled once the retract phase has been removed.
  const retractDisabled = alreadyRetractTrimmed;

  // The normalize-z checkbox is disabled once it has already been applied.
  const normalizeZDisabled = alreadyNormalizedZ;

  // Clears the force-bound fields so stale original-domain values (which are
  // signed) don't act as unintended filters after abs() flips all forces to ≥ 0.
  const clearForceBounds = () => {
    setForceMinMantissa('');
    setForceMinExponent('0');
    setForceMaxMantissa('');
    setForceMaxExponent('0');
  };
  // Tracks whether the trim request is currently in flight.
  const [loading, setLoading] = useState(false);
  // Stores any error message returned from the server or validation logic.
  const [error, setError] = useState('');
  // Stores the success message returned after a successful trim operation.
  const [successMsg, setSuccessMsg] = useState('');

  // Pre-populate inputs with the live force domain every time the modal is opened,
  // and fetch the persisted trim-state flags so we can disable already-applied ops.
  useEffect(() => {
    if (!open) return;

    // Use the accumulated yMin/yMax from graphForcevsZ.domain WebSocket batches.
    const minVal = forceDomain?.yMin;
    const maxVal = forceDomain?.yMax;

    // Decompose each bound into mantissa + exponent for clean display.
    if (minVal != null) {
      const { mantissa, exponent } = normalizeToMantissaExp(minVal);
      setForceMinMantissa(mantissa);
      setForceMinExponent(String(exponent));
    } else {
      setForceMinMantissa('');
      setForceMinExponent('0');
    }

    if (maxVal != null) {
      const { mantissa, exponent } = normalizeToMantissaExp(maxVal);
      setForceMaxMantissa(mantissa);
      setForceMaxExponent(String(exponent));
    } else {
      setForceMaxMantissa('');
      setForceMaxExponent('0');
    }

    // Reset feedback state on every fresh open.
    setError('');
    setSuccessMsg('');
    // Reset local checkbox state — will be overridden by the server response below.
    setAbsoluteForce(false);
    setTrimRetract(false);
    setNormalizeZ(false);

    // Fetch the one-time operation flags so we can disable already-applied checkboxes.
    if (datasetId != null) {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      fetch(
        `${process.env.REACT_APP_BACKEND_URL}/dataset-trim-state/${datasetId}`,
        { headers },
      )
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((data) => {
          setAlreadyAbsolute(!!data.force_absolute);
          setAlreadyRetractTrimmed(!!data.retract_trimmed);
          // Whether z-normalization has been applied in a prior session.
          setAlreadyNormalizedZ(!!data.z_normalized);
        })
        .catch(() => {
          // Non-fatal: fall back to all flags false so the user can still operate.
          setAlreadyAbsolute(false);
          setAlreadyRetractTrimmed(false);
          setAlreadyNormalizedZ(false);
        });
    }
  }, [open, forceDomain, datasetId, token]);

  // Resets all local state so the dialog is clean on next open.
  const handleClose = () => {
    setForceMinMantissa('');
    setForceMinExponent('0');
    setForceMaxMantissa('');
    setForceMaxExponent('0');
    setTrimRetract(false);
    setAbsoluteForce(false);
    setNormalizeZ(false);
    setAlreadyAbsolute(false);
    setAlreadyRetractTrimmed(false);
    setAlreadyNormalizedZ(false);
    setError('');
    setSuccessMsg('');
    onClose();
  };

  // Validates inputs and sends the trim request to the backend.
  const handleCrop = async () => {
    setError('');
    setSuccessMsg('');

    // Parse the string exponents; fall back to 0 when the field is temporarily empty.
    const parsedMinExp = forceMinExponent.trim() !== '' ? parseInt(forceMinExponent, 10) : 0;
    const parsedMaxExp = forceMaxExponent.trim() !== '' ? parseInt(forceMaxExponent, 10) : 0;

    // Reconstruct full values from mantissa × 10^exponent; treat empty mantissa as absent (null).
    const parsedMin =
      forceMinMantissa.trim() !== ''
        ? parseFloat(forceMinMantissa) * Math.pow(10, parsedMinExp)
        : null;
    const parsedMax =
      forceMaxMantissa.trim() !== ''
        ? parseFloat(forceMaxMantissa) * Math.pow(10, parsedMaxExp)
        : null;

    // Ensure at least one bound, retract-trim, absolute-force, or normalize-z is requested.
    if (parsedMin === null && parsedMax === null && !trimRetract && !absoluteForce && !normalizeZ) {
      setError('Please enter at least one of Force Min or Force Max, or enable Trim retract phase, Apply absolute force values, or Normalize curves.');
      return;
    }

    // Validate numeric formats.
    if (forceMinMantissa.trim() !== '' && isNaN(parseFloat(forceMinMantissa))) {
      setError('Force Min must be a valid number.');
      return;
    }
    if (forceMaxMantissa.trim() !== '' && isNaN(parseFloat(forceMaxMantissa))) {
      setError('Force Max must be a valid number.');
      return;
    }

    // Ensure logical ordering when both bounds are given.
    if (parsedMin !== null && parsedMax !== null && parsedMin >= parsedMax) {
      setError('Force Min must be less than Force Max.');
      return;
    }

    // Bounds-vs-domain sanity check.
    // When absolute force is active (requested now or already applied), the
    // effective data range is [0, max(|yMin|, |yMax|)].  On raw signed data
    // use the original domain directly.
    const effectiveAbsolute = absoluteForce || alreadyAbsolute;
    const domainMin = forceDomain?.yMin ?? null;
    const domainMax = forceDomain?.yMax ?? null;
    const effectiveDomainMax =
      domainMin != null && domainMax != null && effectiveAbsolute
        ? Math.max(Math.abs(domainMin), Math.abs(domainMax))
        : domainMax;
    const effectiveDomainMin =
      domainMin != null && effectiveAbsolute ? 0 : domainMin;

    if (parsedMin !== null && effectiveDomainMax !== null && parsedMin > effectiveDomainMax) {
      setError(
        `Force Min (${parsedMin.toExponential(3)}) is above the data maximum ` +
        `(${effectiveDomainMax.toExponential(3)}). No data would remain after cropping.`,
      );
      return;
    }
    if (parsedMax !== null && effectiveDomainMin !== null && parsedMax < effectiveDomainMin) {
      setError(
        `Force Max (${parsedMax.toExponential(3)}) is below the data minimum ` +
        `(${effectiveDomainMin.toExponential(3)}). No data would remain after cropping.`,
      );
      return;
    }

    // Operation order enforced on the backend (and mirrored here for clarity):
    //   1. Apply |F| to all force samples (absolute_force)
    //   2. Remove points outside [force_min, force_max] range
    //   3. Truncate each curve at its peak-force index (trim_retract)
    // This order guarantees that retract detection always operates on the
    // already-filtered, correctly-signed (or abs'd) data.

    if (!datasetId && datasetId !== 0) {
      setError('No dataset is loaded. Please open a file first.');
      return;
    }

    setLoading(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/trim-data`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dataset_id: datasetId,
            force_min: parsedMin,
            force_max: parsedMax,
            trim_retract: trimRetract,
            absolute_force: absoluteForce,
            // Whether to shift each curve's z values so z[0] becomes 0.
            normalize_z: normalizeZ,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        // Surface the detail message coming from HTTPException
        const detail = result?.detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : detail?.message || `Server error (${response.status})`;
        setError(msg);
        return;
      }

      setSuccessMsg(result.message || 'Data trimmed successfully.');
      // Notify parent to reload charts with updated data.
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      // Prevent crash if network communication fails
      setError(`Request failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
        Trim Data
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Remove data points from <strong>all curves</strong> in the current
          dataset where the force value falls outside the specified range. Leave
          a field blank to skip that bound.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
          {/* Lower force bound: mantissa and exponent entered separately */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Force Min (N)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Mantissa part of Force Min (value in [0.1, 1) range) */}
              <TextField
                type="number"
                value={forceMinMantissa}
                onChange={(e) => {
                  setForceMinMantissa(e.target.value);
                  setError('');
                  setSuccessMsg('');
                }}
                placeholder="-0.5"
                size="small"
                inputProps={{ step: 'any' }}
                sx={{ flex: 1 }}
              />
              {/* Separator label between mantissa and exponent */}
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                × 10
              </Typography>
              {/* Exponent part of Force Min (integer power of ten) */}
              <TextField
                type="number"
                value={forceMinExponent}
                onChange={(e) => {
                  // Store as string so the field can be empty while the user edits.
                  setForceMinExponent(e.target.value);
                  setError('');
                  setSuccessMsg('');
                }}
                size="small"
                inputProps={{ step: 1 }}
                sx={{
                  width: 62,
                  '& input': { textAlign: 'center', fontSize: 12, padding: '4px 6px' },
                  // Visually lift the exponent box to suggest superscript position.
                  alignSelf: 'flex-start',
                  mt: '2px',
                }}
              />
            </Box>
          </Box>

          {/* Upper force bound: mantissa and exponent entered separately */}
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Force Max (N)
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {/* Mantissa part of Force Max (value in [0.1, 1) range) */}
              <TextField
                type="number"
                value={forceMaxMantissa}
                onChange={(e) => {
                  setForceMaxMantissa(e.target.value);
                  setError('');
                  setSuccessMsg('');
                }}
                placeholder="0.5"
                size="small"
                inputProps={{ step: 'any' }}
                sx={{ flex: 1 }}
              />
              {/* Separator label between mantissa and exponent */}
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                × 10
              </Typography>
              {/* Exponent part of Force Max (integer power of ten) */}
              <TextField
                type="number"
                value={forceMaxExponent}
                onChange={(e) => {
                  // Store as string so the field can be empty while the user edits.
                  setForceMaxExponent(e.target.value);
                  setError('');
                  setSuccessMsg('');
                }}
                size="small"
                inputProps={{ step: 1 }}
                sx={{
                  width: 62,
                  '& input': { textAlign: 'center', fontSize: 12, padding: '4px 6px' },
                  // Visually lift the exponent box to suggest superscript position.
                  alignSelf: 'flex-start',
                  mt: '2px',
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Retract-phase trimming option */}
        <Box sx={{ mt: 2 }}>
          <Tooltip
            title={
              retractDisabled
                ? "The retract phase has already been removed from this dataset. This operation cannot be applied again."
                : "For each curve, find the sample with the lowest (most-negative) force value — the deepest indentation point — and discard everything after it. This removes the retract phase, keeping only the approach."
            }
            placement="right"
            arrow
          >
            {/* Span wrapper required so Tooltip works on a disabled element */}
            <span>
              <FormControlLabel
                disabled={retractDisabled}
                control={
                  <Checkbox
                    checked={trimRetract}
                    onChange={(e) => {
                      setTrimRetract(e.target.checked);
                      setError('');
                      setSuccessMsg('');
                    }}
                    size="small"
                    disabled={retractDisabled}
                  />
                }
                label={
                  <Typography variant="body2" color={retractDisabled ? 'text.disabled' : 'text.primary'}>
                    Trim retract phase&nbsp;
                    <Typography component="span" variant="body2" color="text.secondary">
                      {retractDisabled ? '(already applied)' : '(keep only approach up to peak force)'}
                    </Typography>
                  </Typography>
                }
              />
            </span>
          </Tooltip>
        </Box>

        {/* Absolute-force option */}
        <Box sx={{ mt: 0.5 }}>
          <Tooltip
            title={
              alreadyAbsolute
                ? "Absolute value has already been applied to this dataset. This operation cannot be applied again."
                : forceAlreadyPositive
                ? "All force values in this dataset are already positive — applying |F| would have no effect."
                : "Replace every force sample in all curves with its absolute value |F|. Applied before any force-range trimming, so bounds you enter above operate on the absolute values."
            }
            placement="right"
            arrow
          >
            {/* Span wrapper required so Tooltip works on a disabled element */}
            <span>
              <FormControlLabel
                disabled={absoluteDisabled}
                control={
                  <Checkbox
                    checked={absoluteForce}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setAbsoluteForce(checked);
                      // Clear pre-populated signed bounds when enabling abs so
                      // they don't act as an unintended tight filter on |F| values.
                      if (checked) clearForceBounds();
                      setError('');
                      setSuccessMsg('');
                    }}
                    size="small"
                    disabled={absoluteDisabled}
                  />
                }
                label={
                  <Typography variant="body2" color={absoluteDisabled ? 'text.disabled' : 'text.primary'}>
                    Apply absolute force values&nbsp;
                    <Typography component="span" variant="body2" color="text.secondary">
                      {alreadyAbsolute
                        ? '(already applied)'
                        : forceAlreadyPositive
                        ? '(forces already positive)'
                        : '(replace every F with |F| across all curves)'}
                    </Typography>
                  </Typography>
                }
              />
            </span>
          </Tooltip>
          {/* Warn the user that enabling abs clears the pre-populated bounds,
              because those original signed bounds are meaningless after |F|. */}
          {absoluteForce && (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.5, ml: 4 }}>
              Force bounds were cleared — enter new bounds relative to |F| if needed.
            </Typography>
          )}
        </Box>

        {/* Normalize-z option: shift each curve so the first z value becomes 0 */}
        <Box sx={{ mt: 0.5 }}>
          <Tooltip
            title={
              normalizeZDisabled
                ? "Z-normalization has already been applied to this dataset. This operation cannot be applied again."
                : "For each curve, subtract the first z value from every z sample so the curve starts at z = 0. " +
                  "Only available when all curves have positive first and last z values."
            }
            placement="right"
            arrow
          >
            {/* Span wrapper required so Tooltip works on a disabled element */}
            <span>
              <FormControlLabel
                disabled={normalizeZDisabled}
                control={
                  <Checkbox
                    checked={normalizeZ}
                    onChange={(e) => {
                      setNormalizeZ(e.target.checked);
                      setError('');
                      setSuccessMsg('');
                    }}
                    size="small"
                    disabled={normalizeZDisabled}
                  />
                }
                label={
                  <Typography variant="body2" color={normalizeZDisabled ? 'text.disabled' : 'text.primary'}>
                    Normalize curves&nbsp;
                    <Typography component="span" variant="body2" color="text.secondary">
                      {normalizeZDisabled
                        ? '(already applied)'
                        : '(shift z so first point of each curve is at z = 0)'}
                    </Typography>
                  </Typography>
                }
              />
            </span>
          </Tooltip>
        </Box>

        {/* Validation / server error feedback */}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}

        {/* Success feedback shown inside the dialog before auto-close */}
        {successMsg && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {successMsg}
          </Alert>
        )}

        {/* Destructive-action warning */}
        <Alert severity="warning" sx={{ mt: 2 }}>
          This operation <strong>permanently modifies</strong> the stored
          dataset. The removed points cannot be recovered without reloading the
          original file.
        </Alert>
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        {/* Cancel button resets state and closes the dialog */}
        <button
          style={actionBtnStyle('secondary', loading)}
          onClick={handleClose}
          disabled={loading}
        >
          Cancel
        </button>

        {/* Submit button triggers the trim operation */}
        <button
          style={actionBtnStyle('primary', loading)}
          onClick={handleCrop}
          disabled={loading}
        >
          {loading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} sx={{ color: '#fff' }} />
              Trimming…
            </Box>
          ) : (
            'Crop data'
          )}
        </button>
      </DialogActions>
    </Dialog>
  );
};

export default TrimDataModal;