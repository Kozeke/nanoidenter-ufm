// Dashboard.jsx
import React, { useState, useEffect, useRef } from "react";
import ForceDisplacement from "./graphs/ForceDisplacement";
import ForceIdentation from "./graphs/ForceIndentation";
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
    autotresh: {},
    gof: {},
    gofSphere: { radius: 1.0 },
    rov: { window: 10 },
    stepanddrift: { step_size: 0.1 },
    threshold: { force_threshold: 0.01 },
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
    
          // Update Force vs Z graph
          setForceData((prev) => [...prev, ...graphForcevsZ.curves]);
          setDomainRange((prev) => ({
              xMin: Math.min(prev.xMin, graphForcevsZ.domain.xMin ?? Infinity),
              xMax: Math.max(prev.xMax, graphForcevsZ.domain.xMax ?? -Infinity),
              yMin: Math.min(prev.yMin, graphForcevsZ.domain.yMin ?? Infinity),
              yMax: Math.max(prev.yMax, graphForcevsZ.domain.yMax ?? -Infinity),
          }));
  
          // Update Force vs Indentation graph
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

  return (
    <div style={{ display: "flex" }}>
      <ForceDisplacement forceData={forceData} domainRange={domainRange} />
      <ForceIdentation forceData={indentationData} domainRange={indentationDomain} />
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