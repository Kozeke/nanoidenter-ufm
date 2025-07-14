import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ElasticitySpectra from "./graphs/SpectraElasticity";
import FiltersComponent from "./FiltersComponent";
import CurveControlsComponent from "./CurveControlsComponent";
import FileOpener from "./FileOpener";
import ExportButton from "./ExportButton";
import { debounce } from 'lodash';

const WEBSOCKET_URL =
  process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8000/ws/data";
// Create MetadataContext
const MetadataContext = createContext({
  metadataObject: { columns: [], sample_row: {} },
  setMetadataObject: () => {},
});

// Hook to use MetadataContext
export const useMetadata = () => useContext(MetadataContext);
const Dashboard = () => {
  const [forceData, setForceData] = useState([]); // For DataSet graph
  const [indentationData, setIndentationData] = useState([]); // For DataSet indentation graph
  const [elspectraData, setElspectraData] = useState([]); // For DataSet elspectra graph
  const [filterDefaults, setFilterDefaults] = useState([]);
  const [cpDefaults, setCpDefaults] = useState({
    autotresh: { range_to_set_zero: 500 },
  });
  const [forceModelDefaults, setForceModelDefaults] = useState([]);
  const [elasticityModelDefaults, setElasticityModelDefaults] = useState([]);
  const [selectedCurveIds, setSelectedCurveIds] = useState([]);
  const [graphType, setGraphType] = useState("line"); // Default to line
  const [filename, setFilename] = useState("");

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

  const [elspectraDomain, setElspectraDomain] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  });

  const [metadataObject, setMetadataObject] = useState({ columns: [], sample_row: {} });
  const [numCurves, setNumCurves] = useState(1);
  const socketRef = useRef(null);
  const initialRequestSent = useRef(false);
  const [regularFilters, setRegularFilters] = useState({});
  const [cpFilters, setCpFilters] = useState({});
  const [forceModels, setForceModels] = useState({});
  const [selectedForceModels, setSelectedForceModels] = useState([]);
  const [elasticityModels, setElasticityModels] = useState({});
  const [selectedElasticityModels, setSelectedElasticityModels] = useState([]);
  const [selectedRegularFilters, setSelectedRegularFilters] = useState([]);
  const [selectedCpFilters, setSelectedCpFilters] = useState([]);
  const [activeTab, setActiveTab] = useState("forceDisplacement");
  const [curveId, setCurveId] = useState("");
  const prevFiltersRef = useRef({ regular: null, cp: null });
  const prevNumCurvesRef = useRef(1); // Initialize with default numCurves
  const [forceRequest, setForceRequest] = useState(false);
  const [selectedExportCurveIds, setSelectedForExportCurveIds] = useState([]);
  const isMetadataReady = metadataObject.columns.length > 0 || Object.keys(metadataObject.sample_row).length > 0;

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
      // Debug metadataObject changes
  useEffect(() => {
    console.log("metadataObject updated:", metadataObject);
  }, [metadataObject]);
  const sendCurveRequest = useCallback(() => {
    console.log("sendcurve", forceRequest);
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
          f_models: forceModels,
          e_models: elasticityModels,
        }
      );

      const numCurvesChanged = prevNumCurvesRef.current !== numCurves;

      const resetState = {
        xMin: Infinity,
        xMax: -Infinity,
        yMin: Infinity,
        yMax: -Infinity,
      };

      // if (filtersChanged || numCurvesChanged || forceRequest) {
        console.log("Request triggered: filtersChanged:", filtersChanged, "numCurvesChanged:", numCurvesChanged, "forceRequest:", forceRequest);
        setForceData([]);
        setIndentationData([]);
        setElspectraData([]);
        setDomainRange(resetState);
        setIndentationDomain(resetState);
        setElspectraDomain(resetState);

        const requestData = {
          action: 'get_metadata',
          num_curves: numCurves,
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: forceModels,
            e_models: elasticityModels,
          },
          ...(curveId && { curve_id: curveId }),
          filters_changed: true,
        };
        socketRef.current.send(JSON.stringify(requestData));

        prevFiltersRef.current = {
          regular: regularFilters,
          cp: cpFilters,
          f_models: forceModels,
          e_models: elasticityModels,
        };
        prevNumCurvesRef.current = numCurves;
        setForceRequest(false); // Reset after sending
      // }
    }
  }, [curveId, numCurves, regularFilters, cpFilters, forceModels, elasticityModels, forceRequest]);
  useEffect(() => {
    const allCurveIds = forceData.map((curve) => curve.curve_id);
    setSelectedForExportCurveIds((prev) => {
      // Only update if the curve IDs have changed to avoid redundant updates
      if (JSON.stringify(prev) !== JSON.stringify(allCurveIds)) {
        console.log("Initializing export curve IDs:", allCurveIds);
        return allCurveIds;
      }
      return prev;
    });
    setSelectedCurveIds((prev) => {
      // Only update if the curve IDs have changed to avoid redundant updates
      if (JSON.stringify(prev) !== JSON.stringify(allCurveIds)) {
        console.log("Initializing export curve IDs:", allCurveIds);
        return allCurveIds;
      }
      return prev;
    });
  }, [forceData]);
  const initializeWebSocket = useCallback(() => {
    console.log("initializeWebSocket: Initializing WebSocket");
    // Close existing connection if open
    if (socketRef.current) {
      socketRef.current.close();
    }

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
      // console.log("WebSocket response:", JSON.stringify(response, null, 2));

      if (response.status === "batch" && response.data) {
        const { graphForcevsZ, graphForceIndentation, graphElspectra } = response.data;

        // console.log("graphForcevsZ:", JSON.stringify(graphForcevsZ, null, 2));
        // console.log("graphForceIndentation:", JSON.stringify(graphForceIndentation, null, 2));
        // console.log("graphElspectra:", JSON.stringify(graphElspectra, null, 2));

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
        setForceModelDefaults(cleanedFmodels);
        setElasticityModelDefaults(cleanedEmodels);

        console.log("Received filter defaults:", cleanedRegularFilters);
        console.log("Received CP filter defaults:", cleanedCpFilters);
      }
            if (response.status === "metadata") {
              console.log("metadata",response.metadata)
              setMetadataObject(response.metadata);
            }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected.");
      initialRequestSent.current = false; // Allow reinitialization
    };
  }, []);


  // Send request when curveId changes
  useEffect(() => {
    if (curveId) {
      console.log("changed curveId")
      // sendCurveRequest();
    }
  }, [curveId, sendCurveRequest]);

  const filterTypes = {
    regular: {
      filters: regularFilters,
      setFilters: setRegularFilters,
      selected: selectedRegularFilters,
      setSelected: setSelectedRegularFilters,
      defaults: filterDefaults,
    },
    cp: {
      filters: cpFilters,
      setFilters: setCpFilters,
      selected: selectedCpFilters,
      setSelected: setSelectedCpFilters,
      defaults: cpDefaults,
    },
    force: {
      filters: forceModels,
      setFilters: setForceModels,
      selected: selectedForceModels,
      setSelected: setSelectedForceModels,
      defaults: forceModelDefaults,
    },
    elasticity: {
      filters: elasticityModels,
      setFilters: setElasticityModels,
      selected: selectedElasticityModels,
      setSelected: setSelectedElasticityModels,
      defaults: elasticityModelDefaults,
    },
  };

  const handleAddFilter = (filterName, type) => {
    const config = filterTypes[type];
    if (filterName && !config.filters[filterName]) {
      const defaultParams = config.defaults[filterName] || {};
      config.setFilters((prev) => ({
        ...prev,
        [filterName]: defaultParams,
      }));
    }
  };

  const handleRemoveFilter = (filterName, type) => {
    const config = filterTypes[type];
    config.setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[filterName];
      return newFilters;
    });
    config.setSelected((prev) => prev.filter((name) => name !== filterName));
  };

  const handleFilterChange = (filterName, param, value, type) => {
    const config = filterTypes[type];
    config.setFilters((prev) => {
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

  const handleProcessSuccess = (result) => {
    console.log('File processed successfully:', result);
    setForceData([]);
    setIndentationData([]);
    setElspectraData([]);
    setDomainRange({ xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
    setIndentationDomain({ xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
    setElspectraDomain({ xMin: Infinity, xMax: -Infinity, yMin: Infinity, yMax: -Infinity });
    if (result.curves) {
      setNumCurves(result.curves);
    }
    setFilename(result.filename || ""); // Set filename from result
    setForceRequest(true);
    initialRequestSent.current = false;
    initializeWebSocket();
    // socketRef.current.onopen = () => {
    //   console.log("WebSocket connected in handleProcessSuccess.");
    //   sendCurveRequest();
    // };
  };


  const handleNumCurvesChange = (value) => {
    console.log("new");
    const newValue = Math.max(1, Math.min(100, parseInt(value, 10)));
    setNumCurves(newValue);
  };

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Update window width on resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleExportCurveIdsChange = debounce((curveIds) => {
    console.log("Selected export curve IDs:", curveIds);
    setSelectedForExportCurveIds(curveIds);
  }, 300);

  // Determine if mobile view (e.g., < 768px)
  const isMobile = windowWidth < 768;

  // Dynamic styles based on window size
  const containerStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    height: "100vh",
    backgroundColor: "#f4f6f8",
    fontFamily: "'Roboto', sans-serif",
    overflow: "hidden",
  };

  const mainContentStyle = {
    flex: isMobile ? "none" : 1,
    padding: isMobile ? "8px" : "10px",
    display: "flex",
    flexDirection: "column",
    minWidth: isMobile ? "auto" : "300px",
    overflowY: isMobile ? "auto" : "hidden",
  };

  const tabNavStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
    marginBottom: "10px",
  };

  const buttonStyle = (isActive) => ({
    padding: isMobile ? "6px 12px" : "8px 16px",
    backgroundColor: isActive ? "#A4A9FC" : "#fff",
    color: isActive ? "#141414" : "#333",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: isMobile ? "14px" : "16px",
    flex: isMobile ? "1 1 auto" : "none",
  });

  const filtersContainerStyle = {
    marginBottom: "10px",
    padding: isMobile ? "8px" : "10px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  };

  const tabContentStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    overflowY: "auto",
  };

  const chartContainerStyle = {
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    padding: isMobile ? "8px" : "10px",
    height: isMobile ? "auto" : "100%",
    minHeight: isMobile ? "400px" : "auto",
  };

  const curveControlsStyle = {
    width: isMobile ? "auto" : "300px",
    padding: isMobile ? "8px" : "10px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    margin: isMobile ? "8px" : "10px",
    overflowY: isMobile ? "visible" : "auto",
  };
  //   const handleOpenFile = async () => {
  //   const input = document.createElement('input');
  //   input.type = 'file';
  //   input.accept = '.json,.hdf5'; // Restrict to supported file types

  //   input.onchange = async (event) => {
  //     const file = event.target.files[0];
  //     if (!file) return;

  //     const formData = new FormData();
  //     formData.append("file", file);

  //     try {
  //       const response = await fetch("http://localhost:8090/load-experiment", {
  //         method: "POST",
  //         body: formData,
  //       });

  //       if (!response.ok) {
  //         throw new Error(`HTTP error! Status: ${response.status}`);
  //       }

  //       const result = await response.json();
  //       console.log("File read result:", result);

  //       // Display the message from the response
  //       alert(result.message || "File processed successfully");
  //     } catch (err) {
  //       console.error("Error uploading file:", err);
  //       alert(`Failed to open file: ${err.message}`);
  //     }
  //   };

  //   input.click();
  // };

  return (
        <MetadataContext.Provider value={{ metadataObject, setMetadataObject }}>

    <div style={containerStyle}>
      <div style={mainContentStyle}>
        {/* Tab Navigation */}
        <div style={{ ...tabNavStyle, display: 'flex', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setActiveTab("forceDisplacement")}
              style={buttonStyle(activeTab === "forceDisplacement")}
            >
              Force vs Displacement
            </button>
            <button
              onClick={() => setActiveTab("forceIndentation")}
              style={buttonStyle(activeTab === "forceIndentation")}
            >
              Force vs Indentation
            </button>
            <button
              onClick={() => setActiveTab("elasticitySpectra")}
              style={buttonStyle(activeTab === "elasticitySpectra")}
            >
              Elasticity Spectra
            </button>
          </div>


          <FileOpener onProcessSuccess={handleProcessSuccess} />
          {isMetadataReady ? (
              <ExportButton
                curveIds={selectedExportCurveIds}
                isMetadataReady={isMetadataReady}
              />
            ) : (
              <button disabled style={{ ...buttonStyle(false), opacity: 0.5, marginLeft: '10px' }}>
                Export (Waiting for metadata)
              </button>
            )}
        </div>


        {/* Filters Component */}
        <div style={filtersContainerStyle}>
          <FiltersComponent
            filterDefaults={filterDefaults}
            capitalizeFilterName={capitalizeFilterName}
            cpDefaults={cpDefaults}
            forceModelDefaults={forceModelDefaults}
            elasticityModelDefaults={elasticityModelDefaults}
            regularFilters={regularFilters}
            cpFilters={cpFilters}
            forceModels={forceModels}
            elasticityModels={elasticityModels}
            selectedElasticityModels={selectedElasticityModels}
            setSelectedElasticityModels={setSelectedElasticityModels}
            selectedRegularFilters={selectedRegularFilters}
            selectedCpFilters={selectedCpFilters}
            selectedForceModels={selectedForceModels}
            setSelectedForceModels={setSelectedForceModels}
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
        <div style={tabContentStyle}>
          {activeTab === "forceDisplacement" && (
            <div style={chartContainerStyle}>
              <ForceDisplacementDataSet
                forceData={forceData}
                domainRange={domainRange}
                onCurveSelect={handleForceDisplacementCurveSelect}
                setSelectedCurveIds={setSelectedCurveIds}
                selectedCurveIds={selectedCurveIds}
                graphType={graphType}
              />
            </div>
          )}

          {activeTab === "forceIndentation" && (
            <div style={chartContainerStyle}>
              <ForceIndentationDataSet
                forceData={indentationData}
                domainRange={indentationDomain}
                setSelectedCurveIds={setSelectedCurveIds}
                onCurveSelect={handleForceDisplacementCurveSelect}
                selectedCurveIds={selectedCurveIds}
                graphType={graphType}
              />
            </div>
          )}

          {activeTab === "elasticitySpectra" && (
            <div style={chartContainerStyle}>
              <ElasticitySpectra
                forceData={elspectraData}
                domainRange={elspectraDomain}
                setSelectedCurveIds={setSelectedCurveIds}
                onCurveSelect={handleForceDisplacementCurveSelect}
                selectedCurveIds={selectedCurveIds}
                graphType={graphType}
              />
            </div>
          )}
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
          filename={filename} // Pass filename
          onExportCurveIdsChange={handleExportCurveIdsChange} // Pass the handler
          selectedExportCurveIds={selectedExportCurveIds}
        />
      </div>
    </div>
    </MetadataContext.Provider>

  );
};

export default Dashboard;