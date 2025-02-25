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

  const [regularFilters, setRegularFilters] = useState({});
  const [cpFilters, setCpFilters] = useState({});
  const [selectedRegularFilter, setSelectedRegularFilter] = useState("");
  const [selectedCpFilter, setSelectedCpFilter] = useState("");

  const filterDefaults = {
    median: { window_size: 5 },
    lineardetrend: { threshold: 10, smoothing_window: 101 },
    notch: { period_nm: 150.0, quality_factor: 20 },
    polytrend: { baseline_percentile: 90, polynomial_degree: 2 },
    prominence: { prominency: 40, min_frequency: 25, band_pass: 30 },
    savgol: { window_size: 25.0, polyorder: 3 },
    autotresh: {},
    gof: { threshold: 0.5 },
    gofSphere: { radius: 1.0 },
    rov: { window: 10 },
    stepanddrift: { step_size: 0.1 },
    threshold: { force_threshold: 0.01 }
  };

  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:8080/ws/data");

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
          setForceData((prevData) => {
            // Ensure prevData is an array
            const currentData = Array.isArray(prevData) ? prevData : [];
            // Replace or add curves, avoiding duplicates by curve_id
            const updatedData = [...currentData];
            response.data.forEach((newCurve) => {
              const existingIndex = updatedData.findIndex(
                (curve) => curve.curve_id === newCurve.curve_id
              );
              if (existingIndex !== -1) {
                // Replace existing curve
                updatedData[existingIndex] = newCurve;
              } else {
                // Add new curve
                updatedData.push(newCurve);
              }
            });
            return updatedData;
          });
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

  const sendCurveRequest = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const requestData = {
        num_curves: numCurves,
        filters: {
          regular: regularFilters,
          cp_filters: cpFilters
        },
      };
      socketRef.current.send(JSON.stringify(requestData));
      console.log("Request sent:", requestData);
    }
  };

  const handleAddFilter = (filterName, isCpFilter = false) => {
    const targetFilters = isCpFilter ? cpFilters : regularFilters;
    const setTargetFilters = isCpFilter ? setCpFilters : setRegularFilters;
    if (filterName && !targetFilters[filterName]) {
      setTargetFilters((prev) => ({
        ...prev,
        [filterName]: filterDefaults[filterName],
      }));
    }
  };

  const handleRemoveFilter = (filterName, isCpFilter = false) => {
    const setTargetFilters = isCpFilter ? setCpFilters : setRegularFilters;
    setTargetFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[filterName];
      return newFilters;
    });
  };

  const handleFilterChange = (filterName, param, value, isCpFilter = false) => {
    const setTargetFilters = isCpFilter ? setCpFilters : setRegularFilters;
    setTargetFilters((prev) => {
      if (prev[filterName]?.[param] === value) return prev;
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

  const chartOptions = useMemo(
    () => ({
      title: { text: "Force vs Z (Live)", left: "center" },
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "value",
        name: "Z",
        nameLocation: "middle",
        nameGap: 25,
        min: domainRange.xMin,
        max: domainRange.xMax,
      },
      yAxis: {
        type: "value",
        name: "Force",
        nameLocation: "middle",
        nameGap: 40,
        scale: true,
        min: domainRange.yMin,
        max: domainRange.yMax,
      },
      series: forceData.map((curve) => ({
        name: curve.curve_id,
        type: "line",
        smooth: false,
        showSymbol: false,
        large: true,
        data: curve.x.map((x, i) => [x, curve.y[i]]) || [],
      })),
      legend: { show: false, bottom: 0 },
      grid: { left: "10%", right: "10%", bottom: "5%" },
      animation: false,
      progressive: 5000,
    }),
    [forceData, domainRange]
  );

  return (
    <div style={{ display: "flex" }}>
      <div style={{ flex: 1 }}>
        <h2>Force vs Z (Live)</h2>
        <ReactECharts
          option={chartOptions}
          style={{ height: 600 }}
          notMerge={true}
          opts={{ renderer: "canvas" }}
        />
      </div>
      <div style={{ width: "300px", padding: "10px", borderLeft: "1px solid #ddd" }}>
        <div style={{ marginBottom: "20px" }}>
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
              borderRadius: "5px"
            }}
          >
            <h4>
              {filterName}
              <button
                onClick={() => handleRemoveFilter(filterName, false)}
                style={{ marginLeft: "10px", color: "red", border: "none", background: "none" }}
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
              borderRadius: "5px"
            }}
          >
            <h4>
              {filterName}
              <button
                onClick={() => handleRemoveFilter(filterName, true)}
                style={{ marginLeft: "10px", color: "red", border: "none", background: "none" }}
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
          style={{ width: "100%", padding: "10px", marginTop: "10px" }}
        >
          Update Curves
        </button>
      </div>
    </div>
  );
};

export default MultiLineChart;