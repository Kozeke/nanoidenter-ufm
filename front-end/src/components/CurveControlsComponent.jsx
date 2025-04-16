import React from "react";
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
  curveId,
  setCurveId,
  forceData,
  selectedCurveIds,
  setSelectedCurveIds,
  graphType,
  setGraphType,
}) => {
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
    <div
      style={{
        position: "absolute",
        bottom: 0,
        width: "100%",
        height: "50px",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        backgroundColor: "#f9f9f9",
        padding: "5px",
        boxSizing: "border-box",
      }}
    >
      {/* Multi-Select Curves */}
      <FormControl style={{ flex: 1, minWidth: 150 }}>
        <InputLabel id="curve-select-label" style={{ fontSize: "12px" }}>
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
          style={{ height: "30px", fontSize: "12px" }}
        >
          {forceData.map((curve) => (
            <MenuItem
              key={curve.curve_id}
              value={curve.curve_id}
              style={{ padding: "2px 8px" }}
            >
              <Checkbox
                checked={selectedCurveIds.includes(curve.curve_id)}
                size="small"
              />
              <ListItemText
                primary={curve.curve_id}
                primaryTypographyProps={{ fontSize: "12px" }}
              />
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Number of Curves */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "5px" }}>
        <label style={{ fontSize: "12px" }}>Curves:</label>
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={{
            width: "60px",
            padding: "3px",
            fontSize: "12px",
            textAlign: "center",
          }}
        />
      </div>

      {/* Graph Type Selector */}
      <FormControl style={{ flex: 1, minWidth: 150 }}>
        <InputLabel id="graph-type-label" style={{ fontSize: "12px" }}>
          Graph Type
        </InputLabel>
        <Select
          labelId="graph-type-label"
          value={graphType}
          onChange={handleGraphTypeChange}
          style={{ height: "30px", fontSize: "12px" }}
        >
          <MenuItem value="line">Line</MenuItem>
          <MenuItem value="scatter">Scatter</MenuItem>
        </Select>
      </FormControl>
    </div>
  );
};

export default CurveControlsComponent;