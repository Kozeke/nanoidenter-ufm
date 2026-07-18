import React, { useState, useEffect, useCallback } from "react";
import {
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  FormControl,
  InputLabel,
  Box,
} from "@mui/material";
// Regular curves are always named "curve{id}" (e.g. "curve0"); filters like
// LinearWindowFit/Hertz add synthetic diagnostic overlay entries to the same curve
// list for on-screen display (e.g. "0_linfit", "avg_linfit", "0_hertz"). Those aren't
// real curves in the database, so the backend export endpoint rejects them — this
// guard keeps them selectable for Display (visualization) but not for Export.
const isExportableCurveId = (id) => /^curve\d+$/.test(String(id));

const CurveControlsComponent = ({
  curveFrom,
  curveTo,
  handleCurveFromChange,
  handleCurveToChange,
  maxNumCurves,
  forceData,
  selectedCurveIds,
  setSelectedCurveIds,
  graphType,
  setGraphType,
  filename,
  onExportCurveIdsChange,
  selectedExportCurveIds,
  curveId,
  setCurveId,
  activeTab,
  selectedForceModel,
  selectedParameters,
  onParameterChange,
  showParameters,
  setShowParameters,
  // Handles Enter shortcut behavior to apply updated curves from curve controls.
  onApplyChangesShortcut,
  // Disable curve controls when socket is down
  isSocketConnected,
  // Active HDF5 segment filter (segment0=indent, segment1=retract).
  selectedSegmentType,
  // Updates the segment filter and triggers a curve reload.
  onSegmentTypeChange,
  // Segment types present in the imported dataset metadata.
  availableSegmentTypes,
}) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Ensure we never store `null` in local state – always use a string.
  const [curveIdInput, setCurveIdInput] = useState(curveId ?? "");

  // Local display state for range inputs so the user can clear/retype freely.
  const [curveFromInput, setCurveFromInput] = useState(String(curveFrom ?? 0));
  const [curveToInput, setCurveToInput] = useState(String(curveTo ?? 10));

  // Derives a flag indicating whether controls should be disabled.
  const isDisabled = !isSocketConnected;

  // Subset of forceData that are real, exportable curves (excludes synthetic
  // diagnostic overlay entries like "0_linfit"/"avg_linfit") — used to drive the
  // "Export All" checkbox so it never selects an id the backend will reject.
  const exportableForceData = forceData.filter((c) => isExportableCurveId(c.curve_id));

  useEffect(() => { setCurveIdInput(curveId ?? ""); }, [curveId]);
  useEffect(() => { setCurveFromInput(String(curveFrom ?? 0)); }, [curveFrom]);
  useEffect(() => { setCurveToInput(String(curveTo ?? 10)); }, [curveTo]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  // Builds segment dropdown options from metadata, always including indent/retract labels.
  const segmentOptions = [
    { value: "segment0", label: "Indent", enabled: true },
    {
      value: "segment1",
      label: "Retract",
      enabled:
        !availableSegmentTypes ||
        availableSegmentTypes.length === 0 ||
        availableSegmentTypes.includes("segment1"),
    },
  ];

  // --- Unified toolbar/card look (matches Dashboard/Filters) ---
  const toolbarCardStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "stretch" : "center",
    gap: isMobile ? "10px" : "8px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
    border: "1px solid #e9ecf5",
    borderRadius: "10px",
    boxShadow: "0 8px 18px rgba(20, 20, 43, 0.06)",
    padding: isMobile ? "10px" : "12px",
    boxSizing: "border-box",
    position: "sticky",
    top: isMobile ? 0 : 56, // tweak if your top header height differs
    zIndex: 4,
    // Disable when socket is down
    opacity: isDisabled ? 0.6 : 1,
    pointerEvents: isDisabled ? "none" : "auto",
  };

  const dividerStyle = {
    width: "1px",
    height: isMobile ? "20px" : "28px",
    backgroundColor: "#e6e9f7",
    margin: isMobile ? "0" : "0 4px",
  };

  const formControlStyle = {
    flex: isMobile ? "none" : "0 1 200px",
    minWidth: isMobile ? "100%" : "180px",
    maxWidth: isMobile ? "100%" : "260px",
  };

  const inputLabelStyle = { fontSize: 14, fontWeight: 600, color: "#4a4f6a" };

  const selectStyle = {
    height: 36,
    fontSize: 14,
    background: "#fff",
    borderRadius: "10px",
  };

  const menuHeaderStyle = {
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: 700,
    fontSize: 13,
    backgroundColor: "#f5f7ff",
    borderBottom: "1px solid #e9ecf5",
    pointerEvents: "none",
  };

  const menuItemStyle = {
    padding: "6px 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 13,
  };

  const checkboxStyle = { padding: "4px" };

  const fileLabelStyle = {
    fontSize: 14,
    color: "#1d1e2c",
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: isMobile ? "100%" : 320,
  };

  const numberRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flex: isMobile ? "none" : "0 1 auto",
    width: isMobile ? "100%" : "auto",
    marginLeft: isMobile ? 0 : "auto",
  };

  const numberLabelStyle = { fontSize: 14, color: "#4a4f6a", fontWeight: 600 };

  const numberInputStyle = {
    width: 80,
    height: 36,
    padding: "6px 10px",
    fontSize: 14,
    textAlign: "center",
    borderRadius: "10px",
    border: "1px solid #e6e9f7",
    background: "#fff",
    boxShadow: "0 2px 8px rgba(30,41,59,0.06) inset",
    outline: "none",
  };

  // Commits the current "From" value using the same validation logic as blur.
  const commitCurveFromInput = useCallback(() => {
    let val = parseInt(curveFromInput, 10);
    if (isNaN(val) || val < 0) val = 0;
    if (maxNumCurves != null && val >= maxNumCurves) val = maxNumCurves - 1;
    if (val >= curveTo) val = curveTo - 1;
    setCurveFromInput(String(val));
    handleCurveFromChange(val);
  }, [curveFromInput, maxNumCurves, curveTo, handleCurveFromChange]);

  // Commits the current "To" value using the same validation logic as blur.
  const commitCurveToInput = useCallback(() => {
    let val = parseInt(curveToInput, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (maxNumCurves != null && val > maxNumCurves) val = maxNumCurves;
    if (val <= curveFrom) val = curveFrom + 1;
    setCurveToInput(String(val));
    handleCurveToChange(val);
  }, [curveToInput, maxNumCurves, curveFrom, handleCurveToChange]);

  // Commits the current curve-id input to shared dashboard state.
  const commitCurveIdInput = useCallback(() => {
    setCurveId(curveIdInput);
  }, [curveIdInput, setCurveId]);

  // Triggers the shared update-curves shortcut after input values are committed.
  const triggerApplyChangesShortcut = useCallback(() => {
    if (typeof onApplyChangesShortcut === "function") {
      onApplyChangesShortcut();
    }
  }, [onApplyChangesShortcut]);

  // Handles Enter key for the "From" input to commit and apply updates.
  const handleCurveFromEnter = useCallback((event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitCurveFromInput();
    triggerApplyChangesShortcut();
  }, [commitCurveFromInput, triggerApplyChangesShortcut]);

  // Handles Enter key for the "To" input to commit and apply updates.
  const handleCurveToEnter = useCallback((event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitCurveToInput();
    triggerApplyChangesShortcut();
  }, [commitCurveToInput, triggerApplyChangesShortcut]);

  // Handles Enter key for the "Curve ID" input to commit and apply updates.
  const handleCurveIdEnter = useCallback((event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitCurveIdInput();
    triggerApplyChangesShortcut();
  }, [commitCurveIdInput, triggerApplyChangesShortcut]);

  const handleSelectChange = useCallback((event) => {
    const value = event.target.value;
    setSelectedCurveIds(value);
    console.log("Selected curves for display:", value);
  }, [setSelectedCurveIds]);
  const handleExportChange = useCallback(
  (curveId) => (event) => {
    event.stopPropagation();
    const isChecked = event.target.checked;
    const newExportCurveIds = isChecked
      ? [...selectedExportCurveIds, curveId]
      : selectedExportCurveIds.filter((id) => id !== curveId);// Only call onExportCurveIdsChange if the selection actually changed
if (JSON.stringify(newExportCurveIds) !== JSON.stringify(selectedExportCurveIds)) {
  console.log(`Export ${curveId}: ${isChecked}, Updated export curves:`, newExportCurveIds);
  onExportCurveIdsChange(newExportCurveIds);
}

// Update display selection based on export action
setSelectedCurveIds((prev) => {
  if (isChecked) {
    // When checking export, ensure display is checked
    return prev.includes(curveId) ? prev : [...prev, curveId];
  } else {
    // When unchecking export, uncheck display only if it's currently checked
    return prev.includes(curveId) ? prev.filter((id) => id !== curveId) : prev;
  }
});  },
  [selectedExportCurveIds, onExportCurveIdsChange, setSelectedCurveIds]
);  return (
    <div style={toolbarCardStyle}>
      {/* File name */}
      <div style={fileLabelStyle}>
        File: {filename || "No file selected"}
      </div>

      {/* Divider */}
      {!isMobile && <div style={dividerStyle} />}

      {/* Curve selector with Display/Export columns */}
      <FormControl style={formControlStyle}>
        <InputLabel id="curve-select-label" style={inputLabelStyle}>
          Select Curves
        </InputLabel>
        <Select
          labelId="curve-select-label"
          multiple
          value={selectedCurveIds}
          onChange={handleSelectChange}
          renderValue={(selected) =>
            selected.length === 0 ? "All Curves" : selected.join(", ")
          }
          style={selectStyle}
        >
          <MenuItem style={menuHeaderStyle} disabled>
            <Box display="flex" alignItems="center" width="100%">
              <Box width="56px" textAlign="center">Display</Box>
              <Box flexGrow={1} textAlign="left">Curve</Box>
              <Box width="56px" textAlign="center">Export</Box>
            </Box>
          </MenuItem>

          <MenuItem style={menuItemStyle}>
            <Box display="flex" alignItems="center" width="100%">
              <Box width="56px" textAlign="center">
                <Checkbox
                  checked={
                    forceData.length > 0 &&
                    forceData.every((c) => selectedCurveIds.includes(c.curve_id))
                  }
                  onChange={(event) => {
                    event.stopPropagation();
                    const allIds = forceData.map((c) => c.curve_id);
                    if (event.target.checked) {
                      setSelectedCurveIds(allIds);
                      onExportCurveIdsChange(allIds);
                    } else {
                      setSelectedCurveIds([]);
                      onExportCurveIdsChange([]);
                    }
                  }}
                  size="small"
                  style={checkboxStyle}
                />
              </Box>
              <Box flexGrow={1}>
                <ListItemText
                  primary="Select All"
                  primaryTypographyProps={{ fontSize: 13, fontWeight: 600 }}
                />
              </Box>
              <Box width="56px" textAlign="center">
                <Checkbox
                  checked={
                    exportableForceData.length > 0 &&
                    exportableForceData.every((c) => selectedExportCurveIds.includes(c.curve_id))
                  }
                  onChange={(event) => {
                    event.stopPropagation();
                    // Only real "curve{id}" entries are exportable; synthetic overlay
                    // curves (e.g. "0_linfit") are excluded so "Export All" never sends
                    // an id the backend will reject.
                    const allIds = exportableForceData.map((c) => c.curve_id);
                    if (event.target.checked) {
                      onExportCurveIdsChange(allIds);
                      setSelectedCurveIds(allIds);
                    } else {
                      onExportCurveIdsChange([]);
                    }
                  }}
                  size="small"
                  style={{ ...checkboxStyle, marginLeft: "6px" }}
                  title="Export All"
                />
              </Box>
            </Box>
          </MenuItem>

          {forceData.map((curve) => {
            const exportable = isExportableCurveId(curve.curve_id);
            return (
              <MenuItem key={curve.curve_id} value={curve.curve_id} style={menuItemStyle}>
                <Box display="flex" alignItems="center" width="100%">
                  <Box width="56px" textAlign="center">
                    <Checkbox
                      checked={selectedCurveIds.includes(curve.curve_id)}
                      size="small"
                      style={checkboxStyle}
                    />
                  </Box>
                  <Box flexGrow={1}>
                    <ListItemText
                      primary={curve.curve_id}
                      primaryTypographyProps={{ fontSize: 13 }}
                    />
                  </Box>
                  <Box width="56px" textAlign="center">
                    <Checkbox
                      checked={exportable && selectedExportCurveIds.includes(curve.curve_id)}
                      onChange={handleExportChange(curve.curve_id)}
                      disabled={!exportable}
                      size="small"
                      style={{ ...checkboxStyle, marginLeft: "6px" }}
                      title={exportable ? "Export" : "Diagnostic overlay curve — not exportable"}
                    />
                  </Box>
                </Box>
              </MenuItem>
            );
          })}
        </Select>
      </FormControl>

      {/* Segment selector */}
      <FormControl style={formControlStyle}>
        <InputLabel id="segment-select-label" style={inputLabelStyle}>
          Segment
        </InputLabel>
        <Select
          labelId="segment-select-label"
          value={selectedSegmentType || "segment0"}
          onChange={(event) => onSegmentTypeChange?.(event.target.value)}
          style={{ ...selectStyle, minWidth: isMobile ? "100%" : 140 }}
        >
          {segmentOptions.map((option) => (
            <MenuItem
              key={option.value}
              value={option.value}
              disabled={!option.enabled}
            >
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Divider */}
      {!isMobile && <div style={dividerStyle} />}

      {/* Curve range (From / To) + Curve ID */}
      <div style={numberRowStyle}>
        <label style={numberLabelStyle}>
          Curves:{maxNumCurves != null && (
            <span style={{ fontWeight: 400, color: "#8a8fa8", marginLeft: 4 }}>
              (max {maxNumCurves})
            </span>
          )}
        </label>

        {/* From */}
        <label style={{ ...numberLabelStyle, fontWeight: 400, fontSize: 13 }}>From</label>
        <input
          type="number"
          min="0"
          max={maxNumCurves != null ? maxNumCurves - 1 : undefined}
          value={curveFromInput}
          onChange={(e) => setCurveFromInput(e.target.value)}
          onBlur={commitCurveFromInput}
          onKeyDown={handleCurveFromEnter}
          style={numberInputStyle}
        />

        {/* To */}
        <label style={{ ...numberLabelStyle, fontWeight: 400, fontSize: 13 }}>To</label>
        <input
          type="number"
          min="1"
          max={maxNumCurves ?? undefined}
          value={curveToInput}
          onChange={(e) => setCurveToInput(e.target.value)}
          onBlur={commitCurveToInput}
          onKeyDown={handleCurveToEnter}
          style={numberInputStyle}
        />

        <label style={numberLabelStyle}>Curve ID:</label>
        <input
          type="text"
          value={curveIdInput ?? ""}
          onChange={(e) => setCurveIdInput(e.target.value)}
          onBlur={commitCurveIdInput}
          onKeyDown={handleCurveIdEnter}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
};

export default React.memo(CurveControlsComponent);

