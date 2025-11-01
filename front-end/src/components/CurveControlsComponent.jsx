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
const CurveControlsComponent = ({
  numCurves,
  handleNumCurvesChange,
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
}) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [curveIdInput, setCurveIdInput] = useState(curveId);  useEffect(() => {
    setCurveIdInput(curveId);
  }, [curveId]);  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);  const isMobile = windowWidth < 768;

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
  };  const handleSelectChange = useCallback((event) => {
    const value = event.target.value;
    setSelectedCurveIds(value);
    console.log("Selected curves for display:", value);
  }, [setSelectedCurveIds]);  const handleExportChange = useCallback(
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
);  const handleGraphTypeChange = useCallback((event) => {
    const value = event.target.value;
    setGraphType(value);
    console.log("Graph type changed to:", value);
  }, [setGraphType]);  return (
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
                    forceData.length > 0 &&
                    forceData.every((c) => selectedExportCurveIds.includes(c.curve_id))
                  }
                  onChange={(event) => {
                    event.stopPropagation();
                    const allIds = forceData.map((c) => c.curve_id);
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

          {forceData.map((curve) => (
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
                    checked={selectedExportCurveIds.includes(curve.curve_id)}
                    onChange={handleExportChange(curve.curve_id)}
                    size="small"
                    style={{ ...checkboxStyle, marginLeft: "6px" }}
                    title="Export"
                  />
                </Box>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Divider */}
      {!isMobile && <div style={dividerStyle} />}

      {/* Graph type */}
      <FormControl style={formControlStyle}>
        <InputLabel id="graph-type-label" style={inputLabelStyle}>
          Graph Type
        </InputLabel>
        <Select
          labelId="graph-type-label"
          value={graphType}
          onChange={handleGraphTypeChange}
          style={selectStyle}
        >
          <MenuItem value="line" style={menuItemStyle}>Line</MenuItem>
          <MenuItem value="scatter" style={menuItemStyle}>Scatter</MenuItem>
        </Select>
      </FormControl>

      {/* Divider */}
      {!isMobile && <div style={dividerStyle} />}

      {/* Number of curves + Curve ID */}
      <div style={numberRowStyle}>
        <label style={numberLabelStyle}>Number of Curves:</label>
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={numberInputStyle}
        />
        <label style={numberLabelStyle}>Curve ID:</label>
        <input
          type="text"
          value={curveIdInput}
          onChange={(e) => setCurveIdInput(e.target.value)}
          onBlur={() => setCurveId(curveIdInput)}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
};

export default React.memo(CurveControlsComponent);

