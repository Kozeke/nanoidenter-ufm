import React, { useState, useEffect } from "react";
import {
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  FormControl,
  InputLabel,
} from "@mui/material";

const CurveControlsComponent = ({
  numCurves,
  handleNumCurvesChange,
  forceData,
  selectedCurveIds,
  setSelectedCurveIds,
  graphType,
  setGraphType,
}) => {
  // Track window width for responsive styling
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  // Dynamic styles
  const containerStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "stretch" : "center",
    gap: isMobile ? "8px" : "6px", // Reduced gap for tighter layout
    backgroundColor: "#fff",
    padding: isMobile ? "8px" : "10px",
    boxSizing: "border-box",
    height: "auto",
    minHeight: isMobile ? "auto" : "100px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    borderRadius: "8px",
  };

  const formControlStyle = {
    flex: isMobile ? "none" : "0 1 auto", // Grow less aggressively on desktop
    minWidth: isMobile ? "100%" : "120px",
    maxWidth: isMobile ? "100%" : "180px", // Slightly smaller maxWidth
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
  };

  const checkboxStyle = {
    padding: isMobile ? "6px" : "4px",
  };

  const numberInputContainerStyle = {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    flex: isMobile ? "none" : "1 1 auto", // Takes remaining space
    width: isMobile ? "100%" : "auto",
    marginLeft: isMobile ? "0" : "auto", // Pushes to right on desktop
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

  // Handle multi-select change
  const handleSelectChange = (event) => {
    const value = event.target.value;
    setSelectedCurveIds(value);
    console.log("Selected curves:", value);
  };

  // Handle graph type change
  const handleGraphTypeChange = (event) => {
    const value = event.target.value;
    setGraphType(value);
    console.log("Graph type changed to:", value);
  };

  return (
    <div style={containerStyle}>
      {/* Multi-Select Curves */}
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
          {forceData.map((curve) => (
            <MenuItem
              key={curve.curve_id}
              value={curve.curve_id}
              style={menuItemStyle}
            >
              <Checkbox
                checked={selectedCurveIds.includes(curve.curve_id)}
                size="small"
                style={checkboxStyle}
              />
              <ListItemText
                primary={curve.curve_id}
                primaryTypographyProps={{ fontSize: isMobile ? "14px" : "12px" }}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Graph Type Selector */}
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

      {/* Number of Curves */}
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