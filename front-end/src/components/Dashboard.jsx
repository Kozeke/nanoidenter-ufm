import React, { useState, useEffect, useRef, useCallback } from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";
import ForceDisplacementSingle from "./graphs/ForceDisplacementSingle";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ForceIndentationSingle from "./graphs/ForceIndentationSingle";
import ElasticitySpectra from "./graphs/SpectraElasticity";
import ElasticitySpectraSingle from "./graphs/SpectraElasticitySingle";
import FiltersComponent from "./FiltersComponent";

const WEBSOCKET_URL = process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8080/ws/data";

const Dashboard = () => {
  const [forceData, setForceData] = useState([]); // For DataSet graph
  const [forceDataSingle, setForceDataSingle] = useState([]); // For Single Force vs Z graph
  const [indentationData, setIndentationData] = useState([]); // For DataSet indentation graph
  const [indentationDataSingle, setIndentationDataSingle] = useState([]); // For Single indentation graph
  const [elspectraData, setElspectraData] = useState([]); // For DataSet elspectra graph
  const [elspectraDataSingle, setElspectraDataSingle] = useState([]); // For Single elspectra graph

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
  const [regularFilters, setRegularFilters] = useState({});
  const [cpFilters, setCpFilters] = useState({});
  const [fModels, setfModels] = useState({});
  const [selectedFmodel, setSelectedFmodel] = useState({});
  
  const [eModels, seteModels] = useState({});
  const [selectedEmodel, setSelectedEmodel] = useState({});

  const [selectedRegularFilter, setSelectedRegularFilter] = useState("");
  const [selectedCpFilter, setSelectedCpFilter] = useState("");
  const [activeTab, setActiveTab] = useState("forceDisplacement");
  const [curveId, setCurveId] = useState("");

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
    stepanddrift: {
      algin_threshold: 10,
      threshold_ratio: 25,
      smoothing_window: 101,
    },
    threshold: { starting_threshold: 2, min_x: 1, max_x: 60, force_offset: 0 },
    hertz: { poisson: 0.5, minInd: 0, maxInd: 800 },
    hertzEffective: { minInd: 0, maxInd: 800 },
    driftedHertz: { poisson: 0.5, minInd: 0, maxInd: 800 },
  
    // ✅ New filters of emodel added below
    bilayer: {
      lambda_coefficient: 1.74,
      minInd: 0,
      maxInd: 800,
    },
    linemax: {
      upper_percentile: 100,
      lower_percentile: 10,
      minInd: 0,
      maxInd: 800,
    },
    constant: {
      minInd: 0,
      maxInd: 800,
    },
    sigmoid: {
      upper_percentile: 100,
      lower_percentile: 10,
      minInd: 0,
      maxInd: 800,
    },
  };
  
  const prevFiltersRef = useRef({ regular: null, cp: null });
  const prevNumCurvesRef = useRef(1); // Initialize with default numCurves

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
      console.log("useeffect")
      socketRef.current = new WebSocket(
        WEBSOCKET_URL
      );

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
          const {
            graphForcevsZ,
            graphForceIndentation,
            graphElspectra,
            graphForcevsZSingle,
            graphForceIndentationSingle,
            graphElspectraSingle,
          } = response.data;
          console.log("graphForcevsZ", graphForcevsZ)
          console.log("graphForceIndentation", graphForceIndentation)
          console.log("graphElspectra", graphElspectra)
          console.log("graphForcevsZSingle", graphForcevsZSingle)
          console.log("graphForceIndentationSingle", graphForceIndentationSingle)
          console.log("graphElspectraSingle", graphElspectraSingle)
          // if (curveId) {
          setForceDataSingle(graphForcevsZSingle?.curves || []);
          setIndentationDataSingle(graphForceIndentationSingle?.curves || []);
          setElspectraDataSingle(graphElspectraSingle?.curves || []);
          // } else {
          setForceData((prev) => [...prev, ...(graphForcevsZ?.curves || [])]);
          setIndentationData((prev) => [
            ...prev,
            ...(graphForceIndentation?.curves || []),
          ]);
          setElspectraData((prev) => [
            ...prev,
            ...(graphElspectra?.curves || []),
          ]);
          // }

          // Update all domain ranges
          setDomainRange((prev) => ({
            xMin: Math.min(prev.xMin, graphForcevsZ?.domain.xMin ?? Infinity),
            xMax: Math.max(prev.xMax, graphForcevsZ?.domain.xMax ?? -Infinity),
            yMin: Math.min(prev.yMin, graphForcevsZ?.domain.yMin ?? Infinity),
            yMax: Math.max(prev.yMax, graphForcevsZ?.domain.yMax ?? -Infinity),
          }));
          setIndentationDomain((prev) => ({
            xMin: Math.min(
              prev.xMin,
              graphForceIndentation?.domain.xMin ?? Infinity
            ),
            xMax: Math.max(
              prev.xMax,
              graphForceIndentation?.domain.xMax ?? -Infinity
            ),
            yMin: Math.min(
              prev.yMin,
              graphForceIndentation?.domain.yMin ?? Infinity
            ),
            yMax: Math.max(
              prev.yMax,
              graphForceIndentation?.domain.yMax ?? -Infinity
            ),
          }));
          setElspectraDomain((prev) => ({
            xMin: Math.min(prev.xMin, graphElspectra?.domain.xMin ?? Infinity),
            xMax: Math.max(prev.xMax, graphElspectra?.domain.xMax ?? -Infinity),
            yMin: Math.min(prev.yMin, graphElspectra?.domain.yMin ?? Infinity),
            yMax: Math.max(prev.yMax, graphElspectra?.domain.yMax ?? -Infinity),
          }));

          if (curveId) {
            setDomainRangeSingle((prev) => ({
              xMin: Math.min(
                prev.xMin,
                graphForcevsZSingle?.domain.xMin ?? Infinity
              ),
              xMax: Math.max(
                prev.xMax,
                graphForcevsZSingle?.domain.xMax ?? -Infinity
              ),
              yMin: Math.min(
                prev.yMin,
                graphForcevsZSingle?.domain.yMin ?? Infinity
              ),
              yMax: Math.max(
                prev.yMax,
                graphForcevsZSingle?.domain.yMax ?? -Infinity
              ),
            }));
            setIndentationDomainSingle((prev) => ({
              xMin: Math.min(
                prev.xMin,
                graphForceIndentationSingle?.domain.xMin ?? Infinity
              ),
              xMax: Math.max(
                prev.xMax,
                graphForceIndentationSingle?.domain.xMax ?? -Infinity
              ),
              yMin: Math.min(
                prev.yMin,
                graphForceIndentationSingle?.domain.yMin ?? Infinity
              ),
              yMax: Math.max(
                prev.yMax,
                graphForceIndentationSingle?.domain.yMax ?? -Infinity
              ),
            }));
            setElspectraDomainSingle((prev) => ({
              xMin: Math.min(
                prev.xMin,
                graphElspectraSingle?.domain.xMin ?? Infinity
              ),
              xMax: Math.max(
                prev.xMax,
                graphElspectraSingle?.domain.xMax ?? -Infinity
              ),
              yMin: Math.min(
                prev.yMin,
                graphElspectraSingle?.domain.yMin ?? Infinity
              ),
              yMax: Math.max(
                prev.yMin,
                graphElspectraSingle?.domain.yMax ?? -Infinity
              ),
            }));
          }
        }
      };

      socketRef.current.onclose = () => {
        console.log("WebSocket disconnected.");
      };

      return () => {
        socketRef.current.close();
      };
    }, [curveId]); // Added sendCurveRequest as dependency since it’s used in onopen

    const handleAddFilter = (filterName, isCpFilter = false, isFModel = false, isEModel = false) => {
      let targetFilters;
      let setTargetFilters;
    
      if (isEModel) {
        targetFilters = eModels;
        setTargetFilters = seteModels;
      } else if (isFModel) {
        targetFilters = fModels;
        setTargetFilters = setfModels;
      } else if (isCpFilter) {
        targetFilters = cpFilters;
        setTargetFilters = setCpFilters;
      } else {
        targetFilters = regularFilters;
        setTargetFilters = setRegularFilters;
      }
    
      if (filterName && !targetFilters[filterName]) {
        if (isCpFilter || isFModel || isEModel) {
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
    
    

    const handleRemoveFilter = (filterName, isCpFilter = false, isFModel = false, isEModel = false) => {
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
    
    

    const handleFilterChange = (filterName, param, value, isCpFilter = false, isFModel = false, isEModel = false) => {
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
    console.log("new")
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
      <div style={{ flex: 1, padding: "10px" }}>
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

        {/* Tab Content */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
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
                  Force vs Displacement (DataSet)
                </h2>
                <ForceDisplacementDataSet
                  forceData={forceData}
                  domainRange={domainRange}
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
                  Force vs Displacement (Single)
                </h2>
                <ForceDisplacementSingle
                  forceData={forceDataSingle} // Use separate data for Single graph
                  domainRange={domainRangeSingle}
                />
              </div>
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
                <h2
                  style={{
                    margin: "0 0 5px 0",
                    fontSize: "14px",
                    color: "#333",
                  }}
                >
                  Force vs Indentation (Data Set)
                </h2>
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
                <ForceIndentationSingle
                  forceData={indentationDataSingle}
                  domainRange={indentationDomainSingle}
                />
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
                <ElasticitySpectraSingle
                  forceData={elspectraDataSingle}
                  domainRange={elspectraDomainSingle}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <FiltersComponent
        numCurves={numCurves}
        regularFilters={regularFilters}
        cpFilters={cpFilters}
        fModels={fModels}
        eModels={eModels}
        selectedEmodel={selectedEmodel}
        setSelectedEmodel={setSelectedEmodel}
        selectedRegularFilter={selectedRegularFilter}
        selectedCpFilter={selectedCpFilter}
        selectedFmodel={selectedFmodel}
        setSelectedFmodel={setSelectedFmodel}
        handleNumCurvesChange={handleNumCurvesChange}
        setSelectedRegularFilter={setSelectedRegularFilter}
        setSelectedCpFilter={setSelectedCpFilter}
        handleAddFilter={handleAddFilter}
        handleRemoveFilter={handleRemoveFilter}
        handleFilterChange={handleFilterChange}
        sendCurveRequest={sendCurveRequest}
        curveId={curveId}
        setCurveId={setCurveId}
      />
    </div>
  );
};

export default Dashboard;
