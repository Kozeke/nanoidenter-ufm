import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";

const MultiLineChart = () => {
  console.log("rerender");
  const [forceData, setForceData] = useState([]);
  const [domainRange, setDomainRange] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity
  });
  const [numCurves, setNumCurves] = useState(50);
  const socketRef = useRef(null);
  const initialRequestSent = useRef(false);

  // ✅ Filter parameters state
  const [filters, setFilters] = useState({
    // median: { window_size: 5 },
    // lineardetrend: { threshold: 10, smoothing_window: 101 },
    // notch: { period_nm: 150.0, quality_factor: 20 },
    // polytrend: { baseline_percentile: 90, polynomial_degree: 2 },
    // prominence: { prominency: 40, min_frequency: 25, band_pass: 30 },
    // savgol: { window_size: 25.0, polyorder: 3 },
  });

  const [selectedFilter, setSelectedFilter] = useState(""); // ✅ Dropdown filter selection

  const filterDefaults = {
    median: { window_size: 5 },
    lineardetrend: { threshold: 10, smoothing_window: 101 },
    notch: { period_nm: 150.0, quality_factor: 20 },
    polytrend: { baseline_percentile: 90, polynomial_degree: 2 },
    prominence: { prominency: 40, min_frequency: 25, band_pass: 30 },
    savgol: { window_size: 25.0, polyorder: 3 },
  };

  useEffect(() => {
    socketRef.current = new WebSocket(`${process.env.REACT_APP_BACKEND_URL.replace("https", "wss")}/ws/data`);
    // socketRef.current = new WebSocket("ws://localhost:8080/ws/data");

    socketRef.current.onopen = () => {
      console.log("WebSocket connected.");
      if (!initialRequestSent.current) {
        sendCurveRequest();
        initialRequestSent.current = true;
      }
    };

    socketRef.current.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        if (response.status === "batch" && response.data) {
          console.log("Received batch of curves:", response.data);
          
          // Append new batch to existing data
          setForceData((prevData) => {
            const newData = [...prevData, ...response.data];
            // Optional: Check for duplicates by curve_id if needed
            return newData;
          });

          // Update domain range incrementally
          setDomainRange((prev) => ({
            xMin: Math.min(prev.xMin, response.domain.xMin),
            xMax: Math.max(prev.xMax, response.domain.xMax),
            yMin: Math.min(prev.yMin, response.domain.yMin),
            yMax: Math.max(prev.yMax, response.domain.yMax)
          }));
        } else if (response.status === "complete") {
          console.log("All batches received");
        } else if (response.status === "error") {
          console.error("WebSocket error:", response.message);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected.");
    };

    return () => {
      socketRef.current.close();
    };
  }, []);

  // ✅ Function to send curve request with filters
  const sendCurveRequest = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const requestData = {
        num_curves: numCurves,
        filters: filters,
      };
      socketRef.current.send(JSON.stringify(requestData));
      console.log("Request sent:", requestData);
    }
  };

  // ✅ Handle adding filters dynamically
  const handleAddFilter = (filterName) => {
    if (filterName && !filters[filterName]) {
      setFilters((prev) => ({
        ...prev,
        [filterName]: filterDefaults[filterName], // Add default values
      }));
    }
  };

  // ✅ Handle removing filters
  const handleRemoveFilter = (filterName) => {
    setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[filterName]; // Remove filter
      return newFilters;
    });
  };

  const handleFilterChange = (filterName, param, value) => {
    setFilters((prev) => {
      if (prev[filterName]?.[param] === value) return prev; // ✅ Prevent unnecessary updates
      return {
        ...prev,
        [filterName]: {
          ...prev[filterName],
          [param]: value,
        },
      };
    });
  };

  const handleNumCurvesChange = (value) => {
    const newValue = Math.max(1, Math.min(100, parseInt(value, 10)));
    setNumCurves(newValue);
  };
  // ✅ Only re-run if forceData changes

  const chartOptions = useMemo(
    () => ({
      title: { text: "Force vs Z (Live)", left: "center" },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "value",
        name: "Z",
        nameLocation: "middle",
        nameGap: 25,
        min: domainRange.xMin, // ✅ Set calculated domain
        max: domainRange.xMax,
      },
      yAxis: {
        type: "value",
        name: "Force",
        nameLocation: "middle",
        nameGap: 40,
        scale: true,
        min: domainRange.yMin, // ✅ Set calculated range
        max: domainRange.yMax,
      },
      series: Object.keys(forceData).map((curveName) => ({
        name: curveName,
        type: "line",
        smooth: false,
        showSymbol: false,
        large: true,
        data:
          forceData[curveName]?.x.map((x, i) => [
            x,
            forceData[curveName]?.y[i],
          ]) || [],
      })),
      legend: { show: false, bottom: 0 },
      grid: { left: "10%", right: "10%", bottom: "5%" },
      animation: false,
      progressive: 5000,
    }),
    [forceData, domainRange]
  );

  return (
    <div>
      <h2>Force vs Z (Live)</h2>

      {/* ✅ Controls for number of curves */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
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
          style={{ width: "50px", textAlign: "center" }}
        />
      </div>

      {/* ✅ Dropdown to select filter */}
      <div>
        <label>Select a Filter: </label>
        <select
          value={selectedFilter}
          onChange={(e) => {
            setSelectedFilter(e.target.value);
            handleAddFilter(e.target.value);
          }}
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

      {/* ✅ Dynamic Inputs based on Selected Filter */}
      {/* ✅ Dynamically Render Selected Filters */}
      {Object.keys(filters).map((filterName) => (
        <div
          key={filterName}
          style={{
            marginTop: "10px",
            padding: "5px",
            border: "1px solid #ddd",
          }}
        >
          <h4>
            {filterName}{" "}
            <button
              onClick={() => handleRemoveFilter(filterName)}
              style={{ marginLeft: "10px", color: "red" }}
            >
              ❌ Remove
            </button>
          </h4>

          {/* Render Filter Parameters */}
          {Object.keys(filters[filterName]).map((param) => (
            <div key={param}>
              <label>{param}: </label>
              <input
                type="number"
                value={filters[filterName][param]}
                onChange={(e) =>
                  handleFilterChange(
                    filterName,
                    param,
                    parseFloat(e.target.value)
                  )
                }
              />
            </div>
          ))}
        </div>
      ))}
      {/* </div> */}

      {/* ✅ Update Button */}
      <button onClick={sendCurveRequest}>Update Curves</button>

      {/* ✅ Chart */}
      <ReactECharts
        option={chartOptions}
        style={{ height: 600 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
};

export default MultiLineChart;
