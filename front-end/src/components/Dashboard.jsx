import React, { useState, useEffect, useRef } from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";
import ForceDisplacementSingle from "./graphs/ForceDisplacementSingle";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ForceIndentationSingle from "./graphs/ForceIndentationSingle";

import ElasticitySpectra from "./graphs/SpectraElasticity";
import FiltersComponent from "./FiltersComponent";

const Dashboard = () => {
  const [forceData, setForceData] = useState([]);
  const [domainRange, setDomainRange] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });
  const [indentationDomain, setIndentationDomain] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });
  const [numCurves, setNumCurves] = useState(50);
  const socketRef = useRef(null);
  const initialRequestSent = useRef(false);
  const [regularFilters, setRegularFilters] = useState({});
  const [cpFilters, setCpFilters] = useState({});
  const [selectedRegularFilter, setSelectedRegularFilter] = useState("");
  const [selectedCpFilter, setSelectedCpFilter] = useState("");
  const [indentationData, setIndentationData] = useState([]);

  const filterDefaults = {
    median: { window_size: 5 },
    lineardetrend: { threshold: 10, smoothing_window: 101 },
    notch: { period_nm: 150.0, quality_factor: 20 },
    polytrend: { baseline_percentile: 90, polynomial_degree: 2 },
    prominence: { prominency: 40, min_frequency: 25, band_pass: 30 },
    savgol: { window_size: 25.0, polyorder: 3 },
    autotresh: { range_to_set_zero: 500 },
    gof: { fit_window: 200, min_x: 50, max_force: 50 },
    gofSphere: { fit_window: 200, x_range: 1000, force_threshold: 10 },
    rov: { safe_threshold: 10, x_range: 1000, windowRov: 200 },
    stepanddrift: { algin_threshold: 10, threshold_ratio: 25, smoothing_window: 101 },
    threshold: { starting_threshold: 2, min_x: 1, max_x: 60, force_offset: 0 },
  };

  useEffect(() => {
    // socketRef.current = new WebSocket("ws://localhost:8080/ws/data");
    socketRef.current = new WebSocket(`${process.env.REACT_APP_BACKEND_URL.replace("https", "wss")}/ws/data`);

    socketRef.current.onopen = () => {
      console.log("WebSocket connected.");
      if (!initialRequestSent.current) {
        sendCurveRequest();
        initialRequestSent.current = true;
      }
    };

    socketRef.current.onmessage = (event) => {
      const response = JSON.parse(event.data);
      if (response.status === "batch" && response.data) {
        const { graphForcevsZ, graphForceIndentation } = response.data;

        setForceData((prev) => [...prev, ...graphForcevsZ.curves]);
        setDomainRange((prev) => ({
          xMin: Math.min(prev.xMin, graphForcevsZ.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForcevsZ.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForcevsZ.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForcevsZ.domain.yMax ?? -Infinity),
        }));

        setIndentationData((prev) => [...prev, ...graphForceIndentation.curves]);
        setIndentationDomain((prev) => ({
          xMin: Math.min(prev.xMin, graphForceIndentation.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForceIndentation.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForceIndentation.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForceIndentation.domain.yMax ?? -Infinity),
        }));
      } else if (response.status === "batch_empty") {
        console.log("No data for batch:", response.batch_ids);
      } else if (response.status === "batch_error") {
        console.error("Batch error:", response.message);
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
      setForceData([]);
      setIndentationData([]);
      setDomainRange({
        xMin: Infinity,
        xMax: -Infinity,
        yMin: Infinity,
        yMax: -Infinity,
      });
      setIndentationDomain({
        xMin: Infinity,
        xMax: -Infinity,
        yMin: Infinity,
        yMax: -Infinity,
      });
      const requestData = {
        num_curves: numCurves,
        filters: {
          regular: regularFilters,
          cp_filters: cpFilters,
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
      if (isCpFilter) {
        setTargetFilters(() => ({
          [filterName]: filterDefaults[filterName],
        }));
      } else {
        setTargetFilters((prev) => ({
          ...prev,
          [filterName]: filterDefaults[filterName],
        }));
      }
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

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        backgroundColor: "#f4f6f8",
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr", // Two columns
          gridTemplateRows: "1fr 1fr", // Three rows
          gap: "10px", // Reduced gap for tighter fit
          padding: "10px", // Reduced padding
        }}
      >
        {/* Graph 1 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Force vs Displacement
          </h2>
          <ForceDisplacementDataSet forceData={forceData} domainRange={domainRange} />
        </div>

        {/* Graph 2 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Force vs Indentation
          </h2>
          <ForceIndentationDataSet forceData={indentationData} domainRange={indentationDomain} />
        </div>

        {/* Graph 3 */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Elasticity Spectra
          </h2>
          <ElasticitySpectra forceData={indentationData} domainRange={indentationDomain} />
        </div>

        {/* Graph 4 (Duplicate for demo) */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Force vs Displacement (2)
          </h2>
          <ForceDisplacementSingle forceData={forceData} domainRange={domainRange} />
        </div>

        {/* Graph 5 (Duplicate for demo) */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Force vs Indentation (2)
          </h2>
          <ForceIndentationSingle forceData={indentationData} domainRange={indentationDomain} />
        </div>

        {/* Graph 6 (Duplicate for demo) */}
        <div
          style={{
            backgroundColor: "#fff",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
            padding: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 5px 0", fontSize: "14px", color: "#333" }}>
            Elasticity Spectra (2)
          </h2>
          <ElasticitySpectra forceData={indentationData} domainRange={indentationDomain} />
        </div>
      </div>

      <FiltersComponent
        numCurves={numCurves}
        regularFilters={regularFilters}
        cpFilters={cpFilters}
        selectedRegularFilter={selectedRegularFilter}
        selectedCpFilter={selectedCpFilter}
        handleNumCurvesChange={handleNumCurvesChange}
        setSelectedRegularFilter={setSelectedRegularFilter}
        setSelectedCpFilter={setSelectedCpFilter}
        handleAddFilter={handleAddFilter}
        handleRemoveFilter={handleRemoveFilter}
        handleFilterChange={handleFilterChange}
        sendCurveRequest={sendCurveRequest}
      />
    </div>
  );
};

export default Dashboard;