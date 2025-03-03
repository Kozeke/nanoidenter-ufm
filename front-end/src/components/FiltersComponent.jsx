import React from "react";

const FiltersComponent = ({
  numCurves,
  regularFilters,
  cpFilters,
  selectedRegularFilter,
  selectedCpFilter,
  handleNumCurvesChange,
  setSelectedRegularFilter,
  setSelectedCpFilter,
  handleAddFilter,
  handleRemoveFilter,
  handleFilterChange,
  sendCurveRequest,
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggleFilters = () => {
    setIsOpen((prev) => !prev);
  };

  // Render only a toggle button when filters are closed
  if (!isOpen) {
    return (
      <div style={{ position: "fixed", right: "10px", top: "10px" }}>
        <button
          onClick={toggleFilters}
          style={{
            padding: "8px 12px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Filters
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "300px",
        padding: "10px",
        borderLeft: "1px solid #ddd",
        backgroundColor: "#f9f9f9",
        position: "fixed",
        right: "0",
        top: "0",
        height: "100vh",
        overflowY: "auto",
        boxShadow: "-2px 0 5px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: "0" }}>Filters</h3>
        <button
          onClick={toggleFilters}
          style={{
            background: "none",
            border: "none",
            color: "#ff4d4d",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: "20px", marginTop: "20px" }}>
        <label>Number of Curves: </label>
        <input
          type="range"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={{ width: "80%" }}
        />
        <input
          type="number"
          min="1"
          max="100"
          value={numCurves}
          onChange={(e) => handleNumCurvesChange(e.target.value)}
          style={{ width: "50px", textAlign: "center", marginLeft: "10px" }}
        />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>Select Regular Filter: </label>
        <select
          value={selectedRegularFilter}
          onChange={(e) => {
            setSelectedRegularFilter(e.target.value);
            handleAddFilter(e.target.value, false);
          }}
          style={{ width: "100%", padding: "5px" }}
        >
          <option value="">None</option>
          <option value="median">Median Filter</option>
          <option value="lineardetrend">Linear Detrend</option>
          <option value="notch">Notch Filter</option>
          <option value="polytrend">Polynomial Detrend</option>
          <option value="prominence">Prominence Filter</option>
          <option value="savgol">Savitzky-Golay</option>
        </select>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>Select CP Filter: </label>
        <select
          value={selectedCpFilter}
          onChange={(e) => {
            setSelectedCpFilter(e.target.value);
            handleAddFilter(e.target.value, true);
          }}
          style={{ width: "100%", padding: "5px" }}
        >
          <option value="">None</option>
          <option value="autotresh">Auto Threshold</option>
          <option value="gof">Goodness of Fit</option>
          <option value="gofSphere">GoF Sphere</option>
          <option value="rov">Rate of Variation</option>
          <option value="stepanddrift">Step and Drift</option>
          <option value="threshold">Threshold</option>
        </select>
      </div>

      {Object.keys(regularFilters).map((filterName) => (
        <div
          key={filterName}
          style={{
            marginBottom: "15px",
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "5px",
            backgroundColor: "#fff",
          }}
        >
          <h4 style={{ margin: "0", display: "flex", justifyContent: "space-between" }}>
            {filterName}
            <button
              onClick={() => handleRemoveFilter(filterName, false)}
              style={{ color: "red", border: "none", background: "none", cursor: "pointer" }}
            >
              ❌
            </button>
          </h4>
          {Object.keys(regularFilters[filterName]).map((param) => (
            <div key={param} style={{ marginTop: "5px" }}>
              <label>{param.replace("_", " ")}: </label>
              <input
                type="number"
                value={regularFilters[filterName][param]}
                onChange={(e) =>
                  handleFilterChange(filterName, param, parseFloat(e.target.value), false)
                }
                style={{ width: "80px" }}
              />
            </div>
          ))}
        </div>
      ))}

      {Object.keys(cpFilters).map((filterName) => (
        <div
          key={filterName}
          style={{
            marginBottom: "15px",
            padding: "10px",
            border: "1px solid #ddd",
            borderRadius: "5px",
            backgroundColor: "#fff",
          }}
        >
          <h4 style={{ margin: "0", display: "flex", justifyContent: "space-between" }}>
            {filterName}
            <button
              onClick={() => handleRemoveFilter(filterName, true)}
              style={{ color: "red", border: "none", background: "none", cursor: "pointer" }}
            >
              ❌
            </button>
          </h4>
          {Object.keys(cpFilters[filterName]).map((param) => (
            <div key={param} style={{ marginTop: "5px" }}>
              <label>{param.replace("_", " ")}: </label>
              <input
                type="number"
                value={cpFilters[filterName][param]}
                onChange={(e) =>
                  handleFilterChange(filterName, param, parseFloat(e.target.value), true)
                }
                style={{ width: "80px" }}
              />
            </div>
          ))}
        </div>
      ))}

      <button
        onClick={sendCurveRequest}
        style={{
          width: "100%",
          padding: "10px",
          marginTop: "10px",
          backgroundColor: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
        }}
      >
        Update Curves
      </button>
    </div>
  );
};

export default FiltersComponent;