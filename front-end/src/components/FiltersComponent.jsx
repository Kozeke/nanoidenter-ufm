import React from "react";

import FilterStatusSidebar from "./FilterStatusSidebar";

const FiltersComponent = ({
  filterDefaults,
  capitalizeFilterName,
  cpDefaults,
  fModelDefaults,
  regularFilters,
  cpFilters,
  selectedRegularFilter,
  selectedCpFilter,
  fModels,
  selectedFModel,
  setSelectedFmodel,
  eModels,
  selectedEModels,
  eModelDefaults,
  setSelectedEmodel,
  setSelectedRegularFilter,
  setSelectedCpFilter,
  handleAddFilter,
  handleRemoveFilter,
  handleFilterChange,
  sendCurveRequest,
  activeTab,
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggleFilters = () => {
    setIsOpen((prev) => !prev);
  };

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
          {/* Filters */}
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%", // Full width of parent container
        padding: "5px", // Reduced padding
        borderTop: "1px solid #ddd",
        backgroundColor: "#f9f9f9",
        height: "100%", // Take up full 15vh from parent
        display: "flex",
        flexDirection: "column", // Stack children vertically
        justifyContent: "flex-start", // Align content from top
        gap: "5px", // Reduced gap between elements
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: "0", fontSize: "14px" }}>Filters</h3>
        <button
          onClick={toggleFilters}
          style={{
            background: "none",
            border: "none",
            color: "#ff4d4d",
            fontSize: "14px",
            cursor: "pointer",
            padding: "0",
          }}
        >
          ✕
        </button>
      </div>

      {/* Four-Column Select Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr", // Four equal columns
          gap: "5px", // Space between columns
        }}
      >
        {/* Regular Filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <label style={{ fontSize: "14px" }}>Regular:</label>
          <select
            value={selectedRegularFilter}
            onChange={(e) => {
              setSelectedRegularFilter(e.target.value);
              handleAddFilter(e.target.value, false);
            }}
            style={{ width: "100%", padding: "2px", fontSize: "14px" }} // Smaller size
          >
            <option value="">None</option>
            {Object.keys(filterDefaults).map((filterName) => (
              <option key={filterName} value={filterName}>
                {capitalizeFilterName(filterName)}
              </option>
            ))}
          </select>
        </div>

        {/* CP Filter */}
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <label style={{ fontSize: "14px" }}>CP:</label>
          <select
            value={selectedCpFilter}
            onChange={(e) => {
              setSelectedCpFilter(e.target.value);
              handleAddFilter(e.target.value, true);
            }}
            style={{ width: "100%", padding: "2px", fontSize: "14px" }}
          >
            <option value="">None</option>
            {Object.keys(cpDefaults).map((filterName) => (
              <option key={filterName} value={filterName}>
                {capitalizeFilterName(filterName)}
              </option>
            ))}
          </select>
        </div>

        {/* Force Model */}
        {activeTab === "forceIndentation" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label style={{ fontSize: "14px" }}>Force:</label>
            <select
              value={selectedFModel}
              onChange={(e) => {
                setSelectedFmodel(e.target.value);
                handleAddFilter(e.target.value, false, true);
              }}
              style={{ width: "100%", padding: "2px", fontSize: "14px" }}
            >
              <option value="">None</option>
              {Object.keys(fModelDefaults).map((fmodelName) => (
                <option key={fmodelName} value={fmodelName}>
                  {capitalizeFilterName(fmodelName)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Elasticity Model */}
        {activeTab === "elasticitySpectra" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <label style={{ fontSize: "14px" }}>Elasticity:</label>
            <select
              value={selectedEModels}
              onChange={(e) => {
                setSelectedEmodel(e.target.value);
                handleAddFilter(e.target.value, false, false, true);
              }}
              style={{ width: "100%", padding: "2px", fontSize: "14px" }}
            >
              <option value="">None</option>
              {Object.keys(eModelDefaults).map((emodelName) => (
                <option key={emodelName} value={emodelName}>
                  {capitalizeFilterName(emodelName)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Filter Status Indicators */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap", // Allow wrapping to next line if needed
          gap: "5px", // Space between filter blocks
        }}
      >
        {Object.keys(regularFilters).map((filterName) => (
          <div
            key={filterName}
            style={{
              width: "150px", // Fixed width
              padding: "5px", // Reduced padding
              border: "1px solid #ddd",
              borderRadius: "3px", // Smaller radius
              backgroundColor: "#fff",
            }}
          >
            <h4
              style={{
                margin: "0",
                fontSize: "14px", // Reduced font size
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {capitalizeFilterName(filterName)}
              <button
                onClick={() => handleRemoveFilter(filterName, false)}
                style={{
                  color: "red",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "14px", // Reduced size
                  padding: "0",
                }}
              >
                ❌
              </button>
            </h4>
            {Object.keys(regularFilters[filterName]).map((param) => (
              <div
                key={param}
                style={{
                  marginTop: "2px", // Reduced margin
                  fontSize: "13px", // Smaller font
                }}
              >
                <label style={{ display: "block" }}>
                  {param.replace("_", " ")}:
                </label>
                <input
                  type="number"
                  value={regularFilters[filterName][param]}
                  onChange={(e) =>
                    handleFilterChange(
                      filterName,
                      param,
                      parseFloat(e.target.value),
                      false
                    )
                  }
                  style={{ width: "100%", padding: "2px", fontSize: "13px" }} // Compact input
                />
              </div>
            ))}
          </div>
        ))}

        {Object.keys(cpFilters).map((filterName) => (
          <div
            key={filterName}
            style={{
              width: "150px",
              padding: "5px",
              border: "1px solid #ddd",
              borderRadius: "3px",
              backgroundColor: "#fff",
            }}
          >
            <h4
              style={{
                margin: "0",
                fontSize: "14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              {filterName}
              <button
                onClick={() => handleRemoveFilter(filterName, true)}
                style={{
                  color: "red",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "0",
                }}
              >
                ❌
              </button>
            </h4>
            {Object.keys(cpFilters[filterName]).map((param) => (
              <div
                key={param}
                style={{
                  marginTop: "2px",
                  fontSize: "13px",
                }}
              >
                <label style={{ display: "block" }}>
                  {param.replace("_", " ")}:
                </label>
                <input
                  type="number"
                  value={cpFilters[filterName][param]}
                  onChange={(e) =>
                    handleFilterChange(
                      filterName,
                      param,
                      parseFloat(e.target.value),
                      true
                    )
                  }
                  style={{ width: "100%", padding: "2px", fontSize: "13px" }}
                />
              </div>
            ))}
          </div>
        ))}

        {/* Force Models (for forceIndentation tab) */}
        {activeTab === "forceIndentation" &&
          Object.keys(fModels).map((fmodelName) => (
            <div
              key={fmodelName}
              style={{
                width: "150px",
                padding: "5px",
                border: "1px solid #ddd",
                borderRadius: "3px",
                backgroundColor: "#fff",
              }}
            >
              <h4
                style={{
                  margin: "0",
                  fontSize: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {capitalizeFilterName(fmodelName)}
                <button
                  onClick={() => handleRemoveFilter(fmodelName, false, true)}
                  style={{
                    color: "red",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "0",
                  }}
                >
                  ❌
                </button>
              </h4>
              {Object.keys(fModels[fmodelName]).map((param) => (
                <div
                  key={param}
                  style={{
                    marginTop: "2px",
                    fontSize: "13px",
                  }}
                >
                  <label style={{ display: "block" }}>
                    {param.replace("_", " ")}:
                  </label>
                  <input
                    type="number"
                    value={
                      fModels[fmodelName]?.[param] ||
                      fModelDefaults[fmodelName][param]
                    }
                    onChange={(e) =>
                      handleFilterChange(
                        fmodelName,
                        param,
                        parseFloat(e.target.value),
                        false,
                        true
                      )
                    }
                    style={{ width: "100%", padding: "2px", fontSize: "13px" }}
                  />
                </div>
              ))}
            </div>
          ))}

        {/* Elasticity Models (for elasticitySpectra tab) */}
        {activeTab === "elasticitySpectra" &&
          Object.keys(eModels).map((filterName) => (
            <div
              key={filterName}
              style={{
                width: "150px",
                padding: "5px",
                border: "1px solid #ddd",
                borderRadius: "3px",
                backgroundColor: "#fff",
              }}
            >
              <h4
                style={{
                  margin: "0",
                  fontSize: "14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {filterName}
                <button
                  onClick={() =>
                    handleRemoveFilter(filterName, false, false, true)
                  }
                  style={{
                    color: "red",
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "0",
                  }}
                >
                  ❌
                </button>
              </h4>
              {Object.keys(eModels[filterName]).map((param) => (
                <div
                  key={param}
                  style={{
                    marginTop: "2px",
                    fontSize: "13px",
                  }}
                >
                  <label style={{ display: "block" }}>
                    {param.replace("_", " ")}:
                  </label>
                  <input
                    type="number"
                    value={eModels[filterName][param]}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        param,
                        parseFloat(e.target.value),
                        false,
                        false,
                        true
                      )
                    }
                    style={{ width: "100%", padding: "2px", fontSize: "13px" }}
                  />
                </div>
              ))}
            </div>
          ))}
      </div>

      {/* Update Curves Button */}
      <button
        onClick={sendCurveRequest}
        style={{
          width: "100%",
          padding: "5px",
          backgroundColor: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "3px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        Update Curves
      </button>
      {/* Sidebar with Filter Status */}
      <FilterStatusSidebar
        regularFilters={regularFilters}
        cpFilters={cpFilters}
        fModels={fModels}
        eModels={eModels}
        fModelDefaults={fModelDefaults}
        capitalizeFilterName={capitalizeFilterName}
        handleRemoveFilter={handleRemoveFilter}
        handleFilterChange={handleFilterChange}
      />
    </div>
  );
};

export default FiltersComponent;
