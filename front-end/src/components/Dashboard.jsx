import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ElasticitySpectra from "./graphs/SpectraElasticity";
import ParametersGraph from "./graphs/ParametersGraph";
import FiltersComponent from "./FiltersComponent";
import CurveControlsComponent from "./CurveControlsComponent";
import FileOpener from "./FileOpener";
import ExportButton from "./ExportButton";
import { debounce } from 'lodash';
import { Box, CircularProgress } from '@mui/material';

const WEBSOCKET_URL =
  process.env.REACT_APP_WEBSOCKET_URL || "ws://localhost:8000/ws/data";
// Create MetadataContext
const MetadataContext = createContext({
  metadataObject: { columns: [], sample_row: {} },
  setMetadataObject: () => { },
});// Hook to use MetadataContext
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
  const [filename, setFilename] = useState(""); const [domainRange, setDomainRange] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  }); const [indentationDomain, setIndentationDomain] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  }); const [elspectraDomain, setElspectraDomain] = useState({
    xMin: Infinity,
    xMax: -Infinity,
    yMin: Infinity,
    yMax: -Infinity,
  }); const [metadataObject, setMetadataObject] = useState({ columns: [], sample_row: {} });
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
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCurves, setIsLoadingCurves] = useState(false);
  const [isLoadingImport, setIsLoadingImport] = useState(false);
  const [isLoadingExport, setIsLoadingExport] = useState(false);
  const [showParameters, setShowParameters] = useState(false);
  const [allFparams, setAllFparams] = useState([]);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [selectedForceModel, setSelectedForceModel] = useState("");
  const [selectedElasticityModel, setSelectedElasticityModel] = useState("");
  const [selectedElasticityParameters, setSelectedElasticityParameters] = useState([]);
  const [showElasticityParameters, setShowElasticityParameters] = useState(false);
  const [allElasticityParams, setAllElasticityParams] = useState([]);
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
      setIsLoadingCurves(true); // Start loading when sending request
      const areFiltersEqual = (prev, current) => {
        return JSON.stringify(prev) === JSON.stringify(current);
      }; const filtersChanged = !areFiltersEqual(
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
    }// socketRef.current = new WebSocket(WEBSOCKET_URL);
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
        setIsLoadingCurves(false); // Stop loading when curves are received
        const { graphForcevsZ, graphForceIndentation, graphElspectra, graphForcevsZSingle, graphForceIndentationSingle, graphElspectraSingle } = response.data;

        // console.log("graphForcevsZ:", JSON.stringify(graphForcevsZ, null, 2));
        console.log("graphForceIndentationSingle:", JSON.stringify(graphForceIndentation, null, 2));
        // console.log("graphElspectra:", JSON.stringify(graphElspectra, null, 2));

        const forceGraph = (graphForcevsZSingle?.curves?.length > 0 ? graphForcevsZSingle : graphForcevsZ) || { curves: [], domain: {} };
        const indentationGraph = (graphForceIndentationSingle?.curves?.curves_cp?.length > 0 ? graphForceIndentationSingle : graphForceIndentation) || { curves: [], domain: {} };
        const elspectraGraph = (graphElspectraSingle?.curves?.length > 0 ? graphElspectraSingle : graphElspectra) || { curves: [], domain: {} };
        // const elspectraGraph =  (graphElspectraSingle?.curves?.length > 0 ? graphElspectraSingle : { curves: [], domain: {} });
        //         console.log("elspectraGraph", elspectraGraph)

        // Handle multi-curve data - replace instead of append to avoid duplicates
        setForceData(forceGraph.curves || []);
        setIndentationData(indentationGraph.curves || { curves_cp: [], curves_fparam: [] });
        setElspectraData(elspectraGraph.curves || []);

        // Update domain ranges
        setDomainRange((prev) => ({
          xMin: Math.min(prev.xMin, forceGraph.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, forceGraph.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, forceGraph.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, forceGraph.domain.yMax ?? -Infinity),
        }));

        setIndentationDomain((prev) => ({
          xMin: Math.min(prev.xMin, indentationGraph.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, indentationGraph.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, indentationGraph.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, indentationGraph.domain.yMax ?? -Infinity),
        }));

        setElspectraDomain((prev) => ({
          xMin: Math.min(prev.xMin, elspectraGraph.domain.xMin ?? Infinity),
          xMax: Math.max(prev.xMax, elspectraGraph.domain.xMax ?? -Infinity),
          yMin: Math.min(prev.yMin, elspectraGraph.domain.yMin ?? Infinity),
          yMax: Math.max(prev.yMax, elspectraGraph.domain.yMax ?? -Infinity),
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
        console.log("metadata", response.metadata)
        setMetadataObject(response.metadata);
      }
      
      if (response.status === "complete") {
        console.log("WebSocket request completed");
        setIsLoadingCurves(false); // Ensure loading is stopped on completion
      }
      
      if (response.status === "error") {
        console.error("WebSocket error:", response.message);
        setIsLoadingCurves(false); // Stop loading on error
      }
    };

    socketRef.current.onclose = () => {
      console.log("WebSocket disconnected.");
      setIsLoadingCurves(false); // Stop loading when connection is lost
      initialRequestSent.current = false; // Allow reinitialization
    };
  }, []);  // Send request when curveId changes
  useEffect(() => {
    if (curveId) {
      console.log("changed curveId")
      sendCurveRequest();
    }
  }, [curveId, sendCurveRequest]); const filterTypes = {
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
  }; const handleAddFilter = (filterName, type) => {
    const config = filterTypes[type];
    if (filterName && !config.filters[filterName]) {
      const defaultParams = config.defaults[filterName] || {};
      config.setFilters((prev) => ({
        ...prev,
        [filterName]: defaultParams,
      }));
    }
  }; const handleRemoveFilter = (filterName, type) => {
    const config = filterTypes[type];
    config.setFilters((prev) => {
      const newFilters = { ...prev };
      delete newFilters[filterName];
      return newFilters;
    });
    config.setSelected((prev) => prev.filter((name) => name !== filterName));
  }; const handleFilterChange = (filterName, param, value, type) => {
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
  }; const handleProcessSuccess = (result) => {
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
  };

  const handleImportStart = () => {
    setIsLoadingImport(true);
  };

  const handleImportEnd = () => {
    setIsLoadingImport(false);
  };

  const handleExportStart = () => {
    setIsLoadingExport(true);
  };

  const handleExportEnd = () => {
    setIsLoadingExport(false);
  }; const handleNumCurvesChange = (value) => {
    console.log("new");
    const newValue = Math.max(1, Math.min(100, parseInt(value, 10)));
    setNumCurves(newValue);
  }; const [windowWidth, setWindowWidth] = useState(window.innerWidth);  // Update window width on resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const handleExportCurveIdsChange = debounce((curveIds) => {
    console.log("Selected export curve IDs:", curveIds);
    setSelectedForExportCurveIds(curveIds);
  }, 300);

  // Function to fetch all fparams
  const fetchAllFparams = useCallback(async () => {
    if (!showParameters) {
      setAllFparams([]);
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/get-all-fparams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: forceModels,
            e_models: elasticityModels,
          },
          num_curves: numCurves,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Fetched all fparams:", result);
      
      if (result.status === "success") {
        setAllFparams(result.fparams || []);
      } else {
        console.error("Failed to fetch fparams:", result.message);
        setAllFparams([]);
      }
    } catch (error) {
      console.error("Error fetching fparams:", error);
      setAllFparams([]);
    }
  }, [showParameters, regularFilters, cpFilters, forceModels, elasticityModels, numCurves]);

  // Effect to fetch fparams when checkbox is checked
  useEffect(() => {
    fetchAllFparams();
  }, [fetchAllFparams]);  // Function to fetch all elasticity parameters
  const fetchAllElasticityParams = useCallback(async () => {
    if (!showElasticityParameters || !selectedElasticityModel) {
      setAllElasticityParams([]);
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/get-all-elasticity-params`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filters: {
            regular: regularFilters,
            cp_filters: cpFilters,
            f_models: forceModels,
            e_models: elasticityModels,
          },
        }),
      });

      const result = await response.json();
      console.log("Fetched all elasticity params:", result);

      if (result.status === "success") {
        setAllElasticityParams(result.elasticity_params || []);
      } else {
        console.error("Failed to fetch elasticity params:", result.message);
        setAllElasticityParams([]);
      }
    } catch (error) {
      console.error("Error fetching elasticity params:", error);
      setAllElasticityParams([]);
    }
  }, [showElasticityParameters, selectedElasticityModel, regularFilters, cpFilters, forceModels, elasticityModels]);

  // Effect to fetch elasticity params when checkbox is checked
  useEffect(() => {
    fetchAllElasticityParams();
  }, [fetchAllElasticityParams]);  // Determine if mobile view (e.g., < 768px)
  const isMobile = windowWidth < 768;  // Dynamic styles based on window size
  const containerStyle = {
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    height: "100vh",
    backgroundColor: "#f4f6f8",
    fontFamily: "'Roboto', sans-serif",
    overflow: "hidden",
    position: "relative",
  }; const mainContentStyle = {
    flex: isMobile ? "none" : 1,
    padding: isMobile ? "8px" : "10px",
    display: "flex",
    flexDirection: "column",
    minWidth: isMobile ? "auto" : "300px",
    overflowY: isMobile ? "auto" : "hidden",
  }; const tabNavStyle = {
    display: "flex",
    flexWrap: "wrap",
    gap: "5px",
    marginBottom: "10px",
  }; const buttonStyle = (isActive) => ({
    padding: isMobile ? "6px 12px" : "8px 16px",
    backgroundColor: isActive ? "#A4A9FC" : "#fff",
    color: isActive ? "#141414" : "#333",
    border: "1px solid #ccc",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: isMobile ? "14px" : "16px",
    flex: isMobile ? "1 1 auto" : "none",
  }); const filtersContainerStyle = {
    marginBottom: "10px",
    padding: isMobile ? "8px" : "10px",
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  }; const tabContentStyle = {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    overflowY: "auto",
  }; const chartContainerStyle = {
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    padding: isMobile ? "8px" : "10px",
    height: isMobile ? "auto" : "100%",
    minHeight: isMobile ? "400px" : "auto",
  }; const curveControlsStyle = {
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
  //   input.accept = '.json,.hdf5'; // Restrict to supported file types  //   input.onchange = async (event) => {
  //     const file = event.target.files[0];
  //     if (!file) return;  //     const formData = new FormData();
  //     formData.append("file", file);  //     try {
  //       const response = await fetch("http://localhost:8090/load-experiment", {
  //         method: "POST",
  //         body: formData,
  //       });  //       if (!response.ok) {
  //         throw new Error(HTTP error! Status: ${response.status});
  //       }  //       const result = await response.json();
  //       console.log("File read result:", result);  //       // Display the message from the response
  //       alert(result.message || "File processed successfully");
  //     } catch (err) {
  //       console.error("Error uploading file:", err);
  //       alert(Failed to open file: ${err.message});
  //     }
  //   };  //   input.click();
  // }; 
  useEffect(() => {
    initializeWebSocket();
  }, [initializeWebSocket]);

  return (
    <MetadataContext.Provider value={{ metadataObject, setMetadataObject }}><div style={containerStyle}>
      {(isLoadingCurves || isLoadingImport || isLoadingExport) && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <CircularProgress size={60} />
          <div style={{ 
            fontSize: '16px', 
            fontWeight: 'bold', 
            color: '#333',
            textAlign: 'center'
          }}>
            {isLoadingCurves && 'Loading curves...'}
            {isLoadingImport && 'Importing file...'}
            {isLoadingExport && 'Exporting data...'}
          </div>
        </Box>
      )}
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
          <FileOpener 
            onProcessSuccess={handleProcessSuccess} 
            onProcessStart={handleImportStart}
            onProcessEnd={handleImportEnd}
            setIsLoading={setIsLoadingImport} 
          />
          {isMetadataReady ? (
            <ExportButton
              curveIds={selectedExportCurveIds}
              isMetadataReady={isMetadataReady}
              onExportStart={handleExportStart}
              onExportEnd={handleExportEnd}
              setIsLoading={setIsLoadingExport}
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
             selectedRegularFilters={selectedRegularFilters}
             selectedCpFilters={selectedCpFilters}
             selectedForceModels={selectedForceModels}
             selectedElasticityModels={selectedElasticityModels}
             setSelectedRegularFilters={setSelectedRegularFilters}
             setSelectedCpFilters={setSelectedCpFilters}
             setSelectedForceModels={setSelectedForceModels}
             setSelectedElasticityModels={setSelectedElasticityModels}
             handleAddFilter={handleAddFilter}
             handleRemoveFilter={handleRemoveFilter}
             handleFilterChange={handleFilterChange}
             sendCurveRequest={sendCurveRequest}
             activeTab={activeTab}
             onForceModelChange={(model) => {
               if (model) {
                 setSelectedForceModel(model);
                 setSelectedParameters([]);
               } else {
                 setSelectedForceModel("");
                 setSelectedParameters([]);
               }
             }}
             selectedForceModel={selectedForceModel}
             selectedParameters={selectedParameters}
             onParameterChange={setSelectedParameters}
             showParameters={showParameters}
             setShowParameters={setShowParameters}
             selectedElasticityModel={selectedElasticityModel}
             selectedElasticityParameters={selectedElasticityParameters}
             onElasticityParameterChange={setSelectedElasticityParameters}
             showElasticityParameters={showElasticityParameters}
             setShowElasticityParameters={setShowElasticityParameters}
             onElasticityModelChange={(model) => {
               if (model) {
                 setSelectedElasticityModel(model);
                 setSelectedElasticityParameters([]);
               } else {
                 setSelectedElasticityModel("");
                 setSelectedElasticityParameters([]);
               }
             }}
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
             <div style={showParameters ? { display: "flex", gap: "10px", height: "100%" } : chartContainerStyle}>
               <div style={showParameters ? { flex: 1, ...chartContainerStyle } : {}}>
                 <ForceIndentationDataSet
                   forceData={indentationData}
                   domainRange={indentationDomain}
                   setSelectedCurveIds={setSelectedCurveIds}
                   onCurveSelect={handleForceDisplacementCurveSelect}
                   selectedCurveIds={selectedCurveIds}
                   graphType={graphType}
                 />
               </div>
               {activeTab === "forceIndentation" && selectedForceModel && showParameters && (
                 <div style={{ flex: 1, ...chartContainerStyle }}>
                   <ParametersGraph
                     forceData={indentationData}
                     domainRange={indentationDomain}
                     setSelectedCurveIds={setSelectedCurveIds}
                     onCurveSelect={handleForceDisplacementCurveSelect}
                     selectedCurveIds={selectedCurveIds}
                     allFparams={allFparams}
                     selectedParameters={selectedParameters}
                     selectedForceModel={selectedForceModel}
                   />
                 </div>
               )}
             </div>
           )}

          {activeTab === "elasticitySpectra" && (
            <div style={showElasticityParameters ? { display: "flex", gap: "10px", height: "100%" } : chartContainerStyle}>
              <div style={showElasticityParameters ? { flex: 1, ...chartContainerStyle } : {}}>
                <ElasticitySpectra
                  forceData={elspectraData}
                  domainRange={elspectraDomain}
                  setSelectedCurveIds={setSelectedCurveIds}
                  onCurveSelect={handleForceDisplacementCurveSelect}
                  selectedCurveIds={selectedCurveIds}
                  graphType={graphType}
                />
              </div>
              {activeTab === "elasticitySpectra" && selectedElasticityModel && showElasticityParameters && (
                <div style={{ flex: 1, ...chartContainerStyle }}>
                  <ParametersGraph
                    forceData={elspectraData}
                    domainRange={elspectraDomain}
                    setSelectedCurveIds={setSelectedCurveIds}
                    onCurveSelect={handleForceDisplacementCurveSelect}
                    selectedCurveIds={selectedCurveIds}
                    allFparams={allElasticityParams}
                    selectedParameters={selectedElasticityParameters}
                    selectedForceModel={selectedElasticityModel}
                  />
                </div>
              )}
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
             activeTab={activeTab}
             selectedForceModel={selectedForceModel}
             selectedParameters={selectedParameters}
             onParameterChange={setSelectedParameters}
             showParameters={showParameters}
             setShowParameters={setShowParameters}
        />
      </div>
    </div>
    </MetadataContext.Provider>);
}; export default Dashboard;

