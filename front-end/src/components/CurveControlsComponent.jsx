import React from "react";

const CurveControlsComponent = ({
  numCurves,
  handleNumCurvesChange,
  curveId,
  setCurveId,
}) => {
  return (
    <div
      style={{
        position: "absolute", // Position it at the bottom of the parent
        bottom: 0, // Align to the bottom
        width: "100%", // Full width of the parent container
        height: "50px", // Fixed height of ~50px
        display: "grid",
        gridTemplateColumns: "1fr 1fr", // Two equal columns
        alignItems: "center", // Center content vertically within 50px
        gap: "10px", // Space between the two columns
        backgroundColor: "#f9f9f9", // Optional: background for visibility
        padding: "5px", // Reduced padding to fit content
        boxSizing: "border-box", // Include padding in height calculation
      }}
    >
      {/* Curve ID Input */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <label style={{ fontSize: "12px" }}>Curve ID:</label>
        <input
          type="text"
          value={curveId}
          onChange={(e) => setCurveId(e.target.value)}
          style={{ width: "100%", padding: "3px", fontSize: "12px" }}
          placeholder="Enter Curve ID"
        />
      </div>

      {/* Number of Curves */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
        <label style={{ fontSize: "12px" }}>Curves:</label>
        <input
          type="range"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={{ width: "60%", margin: "0" }}
        />
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={{
            width: "40px",
            padding: "3px",
            fontSize: "12px",
            textAlign: "center",
          }}
        />
      </div>
    </div>
  );
};

export default CurveControlsComponent;