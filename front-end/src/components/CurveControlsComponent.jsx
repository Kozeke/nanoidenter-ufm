import React, { useState, useEffect } from "react";
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
}) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [selectedExportCurveIds, setSelectedExportCurveIds] = useState([]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setSelectedExportCurveIds(forceData.map((curve) => curve.curve_id));
  }, [forceData]);

  const isMobile = windowWidth < 768;

  const containerStyle = {
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
  };

  const formControlStyle = {
    flex: isMobile ? "none" : "0 1 auto",
    minWidth: isMobile ? "100%" : "120px",
    maxWidth: isMobile ? "100%" : "180px",
  };

  const selectStyle = {
    height: isMobile ? "40px" : "36px",
    fontSize: isMobile ? "14px" : "12px",
  };

  const inputLabelStyle = {
    fontSize: isMobile ? "14px" : "12px",
  };

  const menuItemStyle = {
    padding: isMobile ? "4px 12px" : "2px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const headerStyle = {
    padding: isMobile ? "4px 12px" : "2px 8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: "bold",
    fontSize: isMobile ? "14px" : "12px",
    backgroundColor: "#f5f5f5",
    borderBottom: "1px solid #ccc",
    pointerEvents: "none",
  };

  const checkboxStyle = {
    padding: isMobile ? "6px" : "4px",
  };

  const numberInputContainerStyle = {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flex: isMobile ? "none" : "1 1 auto",
    width: isMobile ? "100%" : "auto",
    marginLeft: isMobile ? "0" : "auto",
  };

  const numberInputStyle = {
    width: isMobile ? "80px" : "60px",
    padding: isMobile ? "6px" : "3px",
    fontSize: isMobile ? "14px" : "12px",
    textAlign: "center",
    borderRadius: "4px",
    border: "1px solid #ccc",
  };

  const labelStyle = {
    fontSize: isMobile ? "14px" : "12px",
    color: "#333",
  };

  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedCurveIds(value);
    console.log("Selected curves for display:", value);
  };

  const handleExportChange = (curveId) => (event) => {
    const isChecked = event.target.checked;
    setSelectedExportCurveIds((prev) =>
      isChecked ? [...prev, curveId] : prev.filter((id) => id !== curveId)
    );
    if (!isChecked) {
      setSelectedCurveIds((prev) => prev.filter((id) => id !== curveId));
    }
    console.log(
      `Export ${curveId}: ${isChecked}, Updated export curves:`,
      selectedExportCurveIds
    );
  };

  const handleGraphTypeChange = (event) => {
    const value = event.target.value;
    setGraphType(value);
    console.log("Graph type changed to:", value);
  };

  return (
    <div style={containerStyle}>
      <div style={{ ...labelStyle, marginRight: isMobile ? "0" : "10px" }}>
        File: {filename || "No file selected"}
      </div>
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
          ))}
        </Select>
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
      <div style={numberInputContainerStyle}>
        <label style={labelStyle}>Curves:</label>
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={numberInputStyle}
        />
      </div>
    </div>
  );
};

export default CurveControlsComponent;