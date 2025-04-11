import React from "react";

const FilterStatusSidebar = ({
  regularFilters,
  cpFilters,
  fModels,
  eModels,
  fModelDefaults,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
}) => {
  // Check if any filters are applied
  const hasFilters =
    Object.keys(regularFilters).length > 0 ||
    Object.keys(cpFilters).length > 0 ||
    Object.keys(fModels).length > 0 ||
    Object.keys(eModels).length > 0;

  if (!hasFilters) return null; // Hide sidebar if no filters are applied

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        width: "200px", // Fixed width for sidebar
        height: "100vh", // Full viewport height
        backgroundColor: "#f9f9f9",
        borderLeft: "1px solid #ddd",
        padding: "10px",
        overflowY: "auto", // Scroll if content exceeds height
        boxSizing: "border-box",
        zIndex:10000
      }}
    >
      <h3 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>Applied Filters</h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column", // Stack vertically in sidebar
          gap: "10px", // Space between filter blocks
        }}
      >
        {/* Regular Filters */}
        {Object.keys(regularFilters).map((filterName) => (
          <div
            key={filterName}
            style={{
              width: "100%", // Full width within sidebar
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
              {capitalizeFilterName(filterName)}
              <button
                onClick={() => handleRemoveFilter(filterName, false)}
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
            {Object.keys(regularFilters[filterName]).map((param) => (
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
                  value={regularFilters[filterName][param]}
                  onChange={(e) =>
                    handleFilterChange(
                      filterName,
                      param,
                      parseFloat(e.target.value),
                      false
                    )
                  }
                  style={{ width: "100%", padding: "2px", fontSize: "13px" }}
                />
              </div>
            ))}
          </div>
        ))}

        {/* CP Filters */}
        {Object.keys(cpFilters).map((filterName) => (
          <div
            key={filterName}
            style={{
              width: "100%",
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

        {/* Force Models */}
        {Object.keys(fModels).map((fmodelName) => (
          <div
            key={fmodelName}
            style={{
              width: "100%",
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

        {/* Elasticity Models */}
        {Object.keys(eModels).map((filterName) => (
          <div
            key={filterName}
            style={{
              width: "100%",
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
                onClick={() => handleRemoveFilter(filterName, false, false, true)}
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
    </div>
  );
};

export default FilterStatusSidebar;