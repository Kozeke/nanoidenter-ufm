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
  }, []);  const isMobile = windowWidth < 768;  const containerStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "stretch" : "center",
    gap: isMobile ? "8px" : "6px",
    backgroundColor: "#fff",
    padding: isMobile ? "8px" : "10px",
    boxSizing: "border-box",
    height: "auto",
    minHeight: isMobile ? "auto" : "100px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    borderRadius: "8px",
  };  const formControlStyle = {
    flex: isMobile ? "none" : "0 1 auto",
    minWidth: isMobile ? "100%" : "120px",
    maxWidth: isMobile ? "100%" : "180px",
  };  const selectStyle = {
    height: isMobile ? "40px" : "36px",
    fontSize: isMobile ? "14px" : "12px",
  };  const inputLabelStyle = {
    fontSize: isMobile ? "14px" : "12px",
  };  const menuItemStyle = {
    padding: isMobile ? "4px 12px" : "2px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };  const headerStyle = {
    padding: isMobile ? "4px 12px" : "2px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: "bold",
    fontSize: isMobile ? "14px" : "12px",
    backgroundColor: "#f5f5f5",
    borderBottom: "1px solid #ccc",
    pointerEvents: "none",
  };  const checkboxStyle = {
    padding: isMobile ? "6px" : "4px",
  };  const numberInputContainerStyle = {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flex: isMobile ? "none" : "1 1 auto",
    width: isMobile ? "100%" : "auto",
    marginLeft: isMobile ? "0" : "auto",
  };  const numberInputStyle = {
    width: isMobile ? "80px" : "60px",
    padding: isMobile ? "6px" : "3px",
    fontSize: isMobile ? "14px" : "12px",
    textAlign: "center",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };  const labelStyle = {
    fontSize: isMobile ? "14px" : "12px",
    color: "#333",
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
    <div style={containerStyle}>
      <div style={{ ...labelStyle, marginRight: isMobile ? "0" : "10px" }}>
        File: {filename || "No file selected"}
      </div>
      <div style={{
        width: "1px",
        height: isMobile ? "20px" : "30px",
        backgroundColor: "#ccc",
        margin: isMobile ? "0 8px" : "0 6px"
      }}></div>
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
    style={selectStyle}>
<MenuItem style={headerStyle} disabled>
  <Box display="flex" alignItems="center" width="100%">
    <Box width="50px" textAlign="center">
      Display
    </Box>
    <Box flexGrow={1} textAlign="left">
      Curve
    </Box>
    <Box width="50px" textAlign="center">
      Export
    </Box>
  </Box>
</MenuItem>
<MenuItem style={menuItemStyle}>
  <Box display="flex" alignItems="center" width="100%">
    <Box width="50px" textAlign="center">
      <Checkbox
        checked={
          forceData.length > 0 &&
          forceData.every((curve) =>
            selectedCurveIds.includes(curve.curve_id)
          )
        }
        onChange={(event) => {
          event.stopPropagation();
          const allCurveIds = forceData.map((curve) => curve.curve_id);
          if (event.target.checked) {
            setSelectedCurveIds(allCurveIds);
            onExportCurveIdsChange(allCurveIds); // Select all for export too
            console.log("Selected all curves for display and export:", allCurveIds);
          } else {
            setSelectedCurveIds([]);
            onExportCurveIdsChange([]); // Deselect all for export
            console.log("Deselected all curves for display and export");
          }
        }}
        size="small"
        style={checkboxStyle}
      />
    </Box>
    <Box flexGrow={1}>
      <ListItemText
        primary="Select All"
        primaryTypographyProps={{
          fontSize: isMobile ? "14px" : "12px",
        }}
      />
    </Box>
    <Box width="50px" textAlign="center">
      <Checkbox
        checked={
          forceData.length > 0 &&
          forceData.every((curve) =>
            selectedExportCurveIds.includes(curve.curve_id)
          )
        }
        onChange={(event) => {
          event.stopPropagation();
          const allCurveIds = forceData.map((curve) => curve.curve_id);
          if (event.target.checked) {
            onExportCurveIdsChange(allCurveIds);
            setSelectedCurveIds(allCurveIds); // Ensure all are displayed when exported
            console.log("Selected all curves for export:", allCurveIds);
          } else {
            onExportCurveIdsChange([]);
            console.log("Deselected all curves for export");
          }
        }}
        size="small"
        style={{ ...checkboxStyle, marginLeft: "10px" }}
        title="Export All"
      />
    </Box>
  </Box>
</MenuItem>
{forceData.map((curve) => (
  <MenuItem
    key={curve.curve_id}
    value={curve.curve_id}
    style={menuItemStyle}
  >
    <Box display="flex" alignItems="center" width="100%">
      <Box width="50px" textAlign="center">
        <Checkbox
          checked={selectedCurveIds.includes(curve.curve_id)}
          size="small"
          style={checkboxStyle}
        />
      </Box>
      <Box flexGrow={1}>
        <ListItemText
          primary={curve.curve_id}
          primaryTypographyProps={{
            fontSize: isMobile ? "14px" : "12px",
          }}
        />
      </Box>
      <Box width="50px" textAlign="center">
        <Checkbox
          checked={selectedExportCurveIds.includes(curve.curve_id)}
          onChange={handleExportChange(curve.curve_id)}
          size="small"
          style={{ ...checkboxStyle, marginLeft: "10px" }}
          title="Export"
        />
      </Box>
    </Box>
  </MenuItem>
))}  </Select>
</FormControl>
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
          <MenuItem value="line" style={menuItemStyle}>
            Line
          </MenuItem>
          <MenuItem value="scatter" style={menuItemStyle}>
            Scatter
          </MenuItem>
        </Select>
      </FormControl>
      <div style={{
        width: "1px",
        height: isMobile ? "20px" : "30px",
        backgroundColor: "#ccc",
        margin: isMobile ? "0 8px" : "0 6px"
      }}></div>
      <div style={numberInputContainerStyle}>
        <label style={labelStyle}>Number of Curves:</label>
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={numberInputStyle}
        />
        <label style={labelStyle}>Curve ID:</label>
        <input
          type="text"
          value={curveIdInput}
          onChange={(e) => setCurveIdInput(e.target.value)}
          onBlur={() => setCurveId(curveIdInput)}
          style={numberInputStyle}
        />
      </div>
       <div style={{
         width: "1px",
         height: isMobile ? "20px" : "30px",
         backgroundColor: "#ccc",
         margin: isMobile ? "0 8px" : "0 6px"
       }}></div>
       
    </div>
  );
};

export default React.memo(CurveControlsComponent);

