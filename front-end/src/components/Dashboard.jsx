import React, { useState, useEffect, useRef, useCallback } from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";
import ForceDisplacementSingle from "./graphs/ForceDisplacementSingle";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ForceIndentationSingle from "./graphs/ForceIndentationSingle";
import ElasticitySpectra from "./graphs/SpectraElasticity";
import ElasticitySpectraSingle from "./graphs/SpectraElasticitySingle";
import FiltersComponent from "./FiltersComponent";
import CurveControlsComponent from "./CurveControlsComponent";

const WEBSOCKET_URL =
  process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8080/ws/data";

const Dashboard = () => {
  const [forceData, setForceData] = useState([]); // For DataSet graph
  const [forceDataSingle, setForceDataSingle] = useState([]); // For Single Force vs Z graph
  const [indentationData, setIndentationData] = useState([]); // For DataSet indentation graph
  const [indentationDataSingle, setIndentationDataSingle] = useState([]); // For Single indentation graph
  const [elspectraData, setElspectraData] = useState([]); // For DataSet elspectra graph
  const [elspectraDataSingle, setElspectraDataSingle] = useState([]); // For Single elspectra graph
  const [filterDefaults, setFilterDefaults] = useState([]);
  const [cpDefaults, setCpDefaults] = useState({
    autotresh: { range_to_set_zero: 500 },
  });
  const [fModelDefaults, setFmodelDefaults] = useState([]);
  const [eModelDefaults, setEmodelDefaults] = useState([]);
  const [selectedCurveIds, setSelectedCurveIds] = useState([]);
  const [graphType, setGraphType] = useState("line"); // Default to line

  const [domainRange, setDomainRange] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });
  const [domainRangeSingle, setDomainRangeSingle] = useState({
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
  const [indentationDomainSingle, setIndentationDomainSingle] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });
  const [elspectraDomain, setElspectraDomain] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });
  const [elspectraDomainSingle, setElspectraDomainSingle] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });

  const [numCurves, setNumCurves] = useState(1);
  const socketRef = useRef(null);
  const initialRequestSent = useRef(false);
  const [regularFilters, setRegularFilters] = useState([]);
  const [cpFilters, setCpFilters] = useState([]);
  const [fModels, setfModels] = useState([]);
  const [selectedFModels, setselectedFModels] = useState([]);

  const [eModels, seteModels] = useState([]);
  const [selectedEModels, setSelectedEModels] = useState([]);

  const [selectedRegularFilters, setSelectedRegularFilters] = useState([]);
  const [selectedCpFilters, setSelectedCpFilters] = useState([]);
  const [activeTab, setActiveTab] = useState("forceDisplacement");
  const [curveId, setCurveId] = useState("");
  const prevFiltersRef = useRef({ regular: null, cp: null });
  const prevNumCurvesRef = useRef(1); // Initialize with default numCurves

  // Helper to capitalize filter names for display
  const capitalizeFilterName = (name) => {
    return (
      name.charAt(0).toUpperCase() +
      name
        .slice(1)
        .replace(/([A-Z])/g, " $1")
        .trim()
    );
  };

  // Callback to handle curve selection
  const handleForceDisplacementCurveSelect = (curveData) => {
    console.log(curveData)
    // setForceDataSingle(curveData); // Update state with selected curve data
    // setCurveId(curveData.curve_id); 
    // const parsedCurveId = parseInt(curveData.curve_id.replace("curve", ""), 10);
    // setCurveId(isNaN(parsedCurveId) ? null : parsedCurveId);
  };

  const sendCurveRequest = useCallback(() => {
    console.log("sendcurve");
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const areFiltersEqual = (prev, current) => {
        return JSON.stringify(prev) === JSON.stringify(current);
      };

      const filtersChanged = !areFiltersEqual(
        {
          regular: prevFiltersRef.current.regular,
          cp: prevFiltersRef.current.cp,
          f_models: prevFiltersRef.current.f_models,
          e_models: prevFiltersRef.current.e_models,
        },
        {
          regular: regularFilters,
          cp: cpFilters,
          f_models: fModels,
          e_models: eModels,
        }
      );

      const numCurvesChanged = prevNumCurvesRef.current !== numCurves;

      const resetState = {
        xMin: Infinity,
        xMax: -Infinity,
        yMin: Infinity,
        yMax: -Infinity,
      };

      if (filtersChanged || numCurvesChanged) {
        console.log("filters changed");
        setForceData([]);
        setIndentationData([]);
        setElspectraData([]);
        setForceDataSingle([]);
        setIndentationDataSingle([]);
        setElspectraDataSingle([]);
        setDomainRange(resetState);
        setIndentationDomain(resetState);
        setElspectraDomain(resetState);
        setDomainRangeSingle(resetState);
        setIndentationDomainSingle(resetState);
        setElspectraDomainSingle(resetState);

        const requestData = {
          num_curves: numCurves,
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: fModels,
            e_models: eModels,
          },
          ...(curveId && { curve_id: curveId }),
          filters_changed: true,
        };
        socketRef.current.send(JSON.stringify(requestData));
      } else if (curveId) {
        setForceDataSingle([]);
        setIndentationDataSingle([]);
        setElspectraDataSingle([]);
        setDomainRangeSingle(resetState);
        setIndentationDomainSingle(resetState);
        setElspectraDomainSingle(resetState);

        const requestData = {
          curve_id: curveId,
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: fModels,
            e_models: eModels,
          },
          filters_changed: false,
        };
        socketRef.current.send(JSON.stringify(requestData));
      }

      prevFiltersRef.current = {
        regular: regularFilters,
        cp: cpFilters,
        f_models: fModels,
        e_models: eModels,
      };
    }
  }, [curveId, numCurves, regularFilters, cpFilters, fModels, eModels]);

  useEffect(() => {
    console.log("useEffect: Initializing WebSocket");
    // socketRef.current = new WebSocket(WEBSOCKET_URL);
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
      console.log("WebSocket response:", JSON.stringify(response, null, 2));
  
      if (response.status === "batch" && response.data) {
        const {
          graphForcevsZ,
          graphForceIndentation,
          graphElspectra,
          graphForcevsZSingle,
          graphForceIndentationSingle,
          graphElspectraSingle,
        } = response.data;
  
        console.log("graphForcevsZ:", JSON.stringify(graphForcevsZ, null, 2));
        console.log("graphForceIndentation:", JSON.stringify(graphForceIndentation, null, 2));
        console.log("graphElspectra:", JSON.stringify(graphElspectra, null, 2));
        console.log("graphForcevsZSingle:", JSON.stringify(graphForcevsZSingle, null, 2));
        console.log("graphForceIndentationSingle:", JSON.stringify(graphForceIndentationSingle, null, 2));
        console.log("graphElspectraSingle:", JSON.stringify(graphElspectraSingle, null, 2));
  
        // Handle single curve data
        if (graphForcevsZSingle?.curves && graphForcevsZSingle.curves.length > 0) {
          if (graphForcevsZSingle.curves.length > 1) {
            console.warn("Expected single curve in graphForcevsZSingle, got:", graphForcevsZSingle.curves.length);
          }
          setForceDataSingle(graphForcevsZSingle.curves[0]);
        } else {
          console.warn("No curves in graphForcevsZSingle");
          setForceDataSingle({});
        }
  
        if (graphForceIndentationSingle?.curves && graphForceIndentationSingle.curves.length > 0) {
          setIndentationDataSingle(graphForceIndentationSingle.curves[0]);
        } else {
          setIndentationDataSingle({});
        }
  
        if (graphElspectraSingle?.curves && graphElspectraSingle.curves.length > 0) {
          setElspectraDataSingle(graphElspectraSingle.curves[0]);
        } else {
          setElspectraDataSingle({});
        }
  
        // Handle multi-curve data
        setForceData((prev) => [...prev, ...(graphForcevsZ?.curves || [])]);
        setIndentationData((prev) => [...prev, ...(graphForceIndentation?.curves || [])]);
        setElspectraData((prev) => [...prev, ...(graphElspectra?.curves || [])]);
  
        // Update domain ranges
        setDomainRange((prev) => ({
          xMin: Math.min(prev.xMin, graphForcevsZ?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForcevsZ?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForcevsZ?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForcevsZ?.domain.yMax ?? -Infinity),
        }));
  
        setIndentationDomain((prev) => ({
          xMin: Math.min(prev.xMin, graphForceIndentation?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForceIndentation?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForceIndentation?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForceIndentation?.domain.yMax ?? -Infinity),
        }));
  
        setElspectraDomain((prev) => ({
          xMin: Math.min(prev.xMin, graphElspectra?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphElspectra?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphElspectra?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphElspectra?.domain.yMax ?? -Infinity),
        }));
  
        setDomainRangeSingle((prev) => ({
          xMin: Math.min(prev.xMin, graphForcevsZSingle?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForcevsZSingle?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForcevsZSingle?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForcevsZSingle?.domain.yMax ?? -Infinity),
        }));
  
        setIndentationDomainSingle((prev) => ({
          xMin: Math.min(prev.xMin, graphForceIndentationSingle?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphForceIndentationSingle?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphForceIndentationSingle?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphForceIndentationSingle?.domain.yMax ?? -Infinity),
        }));
  
        setElspectraDomainSingle((prev) => ({
          xMin: Math.min(prev.xMin, graphElspectraSingle?.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, graphElspectraSingle?.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, graphElspectraSingle?.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, graphElspectraSingle?.domain.yMax ?? -Infinity),
        }));
      }
  
      if (response.status === "filter_defaults") {
        const { regular_filters, cp_filters, fmodels, emodels } = response.data;
        const cleanedRegularFilters = Object.fromEntries(
          Object.entries(regular_filters).map(([key, value]) => [
            key.replace("_filter_array", ""),
            value,
          ])
        );
        const cleanedCpFilters = Object.fromEntries(
          Object.entries(cp_filters).map(([key, value]) => [
            key.replace("_filter_array", ""),
            value,
          ])
        );
        const cleanedFmodels = Object.fromEntries(
          Object.entries(fmodels).map(([key, value]) => [
            key.replace("_filter_array", ""),
            value,
          ])
        );
        const cleanedEmodels = Object.fromEntries(
          Object.entries(emodels).map(([key, value]) => [
            key.replace("_filter_array", ""),
            value,
          ])
        );
        setFilterDefaults(cleanedRegularFilters);
        setCpDefaults(cleanedCpFilters);
        setFmodelDefaults(cleanedFmodels);
        setEmodelDefaults(cleanedEmodels);
  
        console.log("Received filter defaults:", cleanedRegularFilters);
        console.log("Received CP filter defaults:", cleanedCpFilters);
      }
    };
  
    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected.");
    };
  
    return () => {
      socketRef.current.close();
    };
  }, []);

  // Send request when curveId changes
  useEffect(() => {
    if (curveId) {
      console.log("changed curveId")
      // sendCurveRequest();
    }
  }, [curveId, sendCurveRequest]);

  const handleAddFilter = (
    filterName,
    isCpFilter = false,
    isFModel = false,
    isEModel = false
  ) => {
    let currentFilters; // Renamed from targetFilters
    let setFilters; // Renamed from setTargetFilters
    let filterDefaultsSource; // Renamed from defaultsSource

    if (isEModel) {
      currentFilters = eModels;
      setFilters = seteModels;
      filterDefaultsSource = eModelDefaults; // Assuming this exists
    } else if (isFModel) {
      currentFilters = fModels;
      setFilters = setfModels;
      filterDefaultsSource = fModelDefaults;
    } else if (isCpFilter) {
      currentFilters = cpFilters;
      setFilters = setCpFilters;
      filterDefaultsSource = cpDefaults;
    } else {
      currentFilters = regularFilters;
      setFilters = setRegularFilters;
      filterDefaultsSource = filterDefaults;
    }

    if (filterName && !currentFilters[filterName]) {
      const defaultParams = filterDefaultsSource[filterName] || {}; // Fallback to empty object
      setFilters((prev) => ({
        ...prev, // Merge with existing filters
        [filterName]: defaultParams,
      }));
    }
  };

  const handleRemoveFilter = (
    filterName,
    isCpFilter = false,
    isFModel = false,
    isEModel = false
  ) => {
    let setTargetFilters;

    if (isEModel) {
      setTargetFilters = seteModels;
    } else if (isFModel) {
      setTargetFilters = setfModels;
    } else if (isCpFilter) {
      setTargetFilters = setCpFilters;
    } else {
      setTargetFilters = setRegularFilters;
    }

    setTargetFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[filterName];
      return newFilters;
    });
  };

  const handleFilterChange = (
    filterName,
    param,
    value,
    isCpFilter = false,
    isFModel = false,
    isEModel = false
  ) => {
    let setTargetFilters;

    if (isEModel) {
      setTargetFilters = seteModels;
    } else if (isFModel) {
      setTargetFilters = setfModels;
    } else if (isCpFilter) {
      setTargetFilters = setCpFilters;
    } else {
      setTargetFilters = setRegularFilters;
    }

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
    console.log("new");
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
          padding: "10px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Tab Navigation */}
        <div style={{ marginBottom: "10px" }}>
          <button
            onClick={() => setActiveTab("forceDisplacement")}
            style={{
              padding: "8px 16px",
              marginRight: "5px",
              backgroundColor:
                activeTab === "forceDisplacement" ? "#007bff" : "#fff",
              color: activeTab === "forceDisplacement" ? "#fff" : "#333",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Force vs Displacement
          </button>
          <button
            onClick={() => setActiveTab("forceIndentation")}
            style={{
              padding: "8px 16px",
              marginRight: "5px",
              backgroundColor:
                activeTab === "forceIndentation" ? "#007bff" : "#fff",
              color: activeTab === "forceIndentation" ? "#fff" : "#333",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Force vs Indentation
          </button>
          <button
            onClick={() => setActiveTab("elasticitySpectra")}
            style={{
              padding: "8px 16px",
              backgroundColor:
                activeTab === "elasticitySpectra" ? "#007bff" : "#fff",
              color: activeTab === "elasticitySpectra" ? "#fff" : "#333",
              border: "1px solid #ccc",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Elasticity Spectra
          </button>
        </div>

        {/* Filters Component */}
        <div
        >
          <FiltersComponent
            filterDefaults={filterDefaults}
            capitalizeFilterName={capitalizeFilterName}
            cpDefaults={cpDefaults}
            fModelDefaults={fModelDefaults}
            numCurves={numCurves}
            regularFilters={regularFilters}
            cpFilters={cpFilters}
            fModels={fModels}
            eModels={eModels}
            eModelDefaults={eModelDefaults}
            selectedEModels={selectedEModels}
            setSelectedEModels={setSelectedEModels}
            selectedRegularFilters={selectedRegularFilters}
            selectedCpFilters={selectedCpFilters}
            selectedFModels={selectedFModels}
            setSelectedFModels={setselectedFModels}
            handleNumCurvesChange={handleNumCurvesChange}
            setSelectedRegularFilters={setSelectedRegularFilters}
            setSelectedCpFilters={setSelectedCpFilters}
            handleAddFilter={handleAddFilter}
            handleRemoveFilter={handleRemoveFilter}
            handleFilterChange={handleFilterChange}
            sendCurveRequest={sendCurveRequest}
            curveId={curveId}
            setCurveId={setCurveId}
            activeTab={activeTab}
          />
        </div>

        {/* Tab Content */}
        <div
          style={{
            flex: 1,
            display: "grid",
            // gridTemplateColumns: "1fr 1fr",
            gap: "10px",
            overflowY: "auto",
          }}
        >
          {activeTab === "forceDisplacement" && (
            <>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  {/* Force vs Displacement (DataSet) */}
                </h2>
                <ForceDisplacementDataSet
                  forceData={forceData}
                  domainRange={domainRange}
                  onCurveSelect={handleForceDisplacementCurveSelect}
                  setSelectedCurveIds={setSelectedCurveIds}
                  selectedCurveIds={selectedCurveIds}
                  graphType={graphType}
                />
              </div>
              {/* <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  Force vs Displacement (Single)
                </h2>
                <ForceDisplacementSingle
                  forceData={forceDataSingle}
                  domainRange={domainRangeSingle}
                />
              </div> */}
            </>
          )}

          {activeTab === "forceIndentation" && (
            <>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >

                <ForceIndentationDataSet
                  forceData={indentationData}
                  domainRange={indentationDomain}
                />
              </div>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  Force vs Indentation (Single)
                </h2>
                {/* <ForceIndentationSingle
                  forceData={indentationDataSingle}
                  domainRange={indentationDomainSingle}
                /> */}
              </div>
            </>
          )}

          {activeTab === "elasticitySpectra" && (
            <>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  Elasticity Spectra
                </h2>
                <ElasticitySpectra
                  forceData={elspectraData}
                  domainRange={elspectraDomain}
                />
              </div>
              <div
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "8px",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                  padding: "10px",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  Elasticity Spectra (Single)
                </h2>
                {/* <ElasticitySpectraSingle
                  forceData={elspectraDataSingle}
                  domainRange={elspectraDomainSingle}
                /> */}
              </div>
            </>
          )}
        </div>
      </div>
      <CurveControlsComponent
                numCurves={numCurves}
                handleNumCurvesChange={handleNumCurvesChange}
                curveId={curveId}
                setCurveId={setCurveId}
                forceData={forceData}
                selectedCurveIds={selectedCurveIds}
                setSelectedCurveIds={setSelectedCurveIds}
                setGraphType={setGraphType}
                graphType={graphType}
      />
    </div>
  );
};

export default Dashboard;
