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

// Keep this in sync with FilterStatusSidebar / FiltersComponent drawer width
const DRAWER_WIDTH = 300;

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
  const [indentationData, setIndentationData] = useState({ curves_cp: [], curves_fparam: [] }); // For DataSet indentation graph
  const [elspectraData, setElspectraData] = useState({ curves: [], curves_elasticity_param: [] }); // For DataSet elspectra graph
  const [filterDefaults, setFilterDefaults] = useState([]);
  const [cpDefaults, setCpDefaults] = useState({
    autotresh: { range_to_set_zero: 500 },
  });
  const [forceModelDefaults, setForceModelDefaults] = useState([]);
  const [elasticityModelDefaults, setElasticityModelDefaults] = useState([]);
  const [selectedCurveIds, setSelectedCurveIds] = useState([]);
  const [graphType, setGraphType] = useState("line"); // Default to line
  const [filename, setFilename] = useState("");   const [domainRange, setDomainRange] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  }); const [indentationDomain, setIndentationDomain] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  }); const [elspectraDomain, setElspectraDomain] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
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
  const [lastFparamsKey, setLastFparamsKey] = useState(null);
  const fparamsAbortRef = useRef(null);
  const prevForceModel = useRef(null);
  const [selectedParameters, setSelectedParameters] = useState([]);
  const [selectedForceModel, setSelectedForceModel] = useState("");
  const [fparamsProgress, setFparamsProgress] = useState({
    phase: "",
    done: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
    isLoading: false
  });
  const [selectedElasticityModel, setSelectedElasticityModel] = useState("");
  const [selectedElasticityParameters, setSelectedElasticityParameters] = useState([]);
  const [showElasticityParameters, setShowElasticityParameters] = useState(false);
  const [allElasticityParams, setAllElasticityParams] = useState([]);
  const [lastElasticityKey, setLastElasticityKey] = useState(null);
  const eparamsAbortRef = useRef(null);
  const prevElasticityModel = useRef(null);
  const [eparamsProgress, setEparamsProgress] = useState({
    phase: "",
    done: 0,
    total: 0,
    currentBatch: 0,
    totalBatches: 0,
    isLoading: false,
  });
  const [setZeroForce, setSetZeroForce] = useState(true); // Default to True as requested
  const [elasticityParams, setElasticityParams] = useState({
    interpolate: true,  // Default to True as requested
    order: 2,          // Default order
    window: 61        // Default window size
  });
  const [forceModelParams, setForceModelParams] = useState({
    maxInd: 800,       // Default max indentation in nm
    minInd: 0,         // Default min indentation in nm
    poisson: 0.5       // Default Poisson's ratio
  });
  const [elasticModelParams, setElasticModelParams] = useState({
    maxInd: 800,       // Default max indentation in nm
    minInd: 0          // Default min indentation in nm
  });
  // Auto-show sidebar when filters are selected
  const hasFilters = Object.keys(regularFilters).length > 0 || 
                     Object.keys(cpFilters).length > 0 || 
                     Object.keys(forceModels).length > 0 || 
                     Object.keys(elasticityModels).length > 0;
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
    // console.log(curveData)
    // setForceDataSingle(curveData); // Update state with selected curve data
    // setCurveId(curveData.curve_id); 
    // const parsedCurveId = parseInt(curveData.curve_id.replace("curve", ""), 10);
    // setCurveId(isNaN(parsedCurveId) ? null : parsedCurveId);
  };
  // Debug metadataObject changes
  useEffect(() => {
    // console.log("metadataObject updated:", metadataObject);
  }, [metadataObject]);
  const sendCurveRequest = useCallback(() => {
    // console.log("sendcurve", forceRequest);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      setIsLoadingCurves(true); // Start loading when sending request
      
      // Add a timeout to prevent loading from getting stuck
      const loadingTimeout = setTimeout(() => {
        // console.log("Loading timeout reached, stopping loading state");
        setIsLoadingCurves(false);
      }, 30000); // 30 second timeout
      
      // Store the timeout ID to clear it when we get a response
      socketRef.current.loadingTimeout = loadingTimeout;
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
        xMin: null,
        xMax: null,
        yMin: null,
        yMax: null,
      };

      // if (filtersChanged || numCurvesChanged || forceRequest) {
      // console.log("Request triggered: filtersChanged:", filtersChanged, "numCurvesChanged:", numCurvesChanged, "forceRequest:", forceRequest);
      setForceData([]);
      setIndentationData({ curves_cp: [], curves_fparam: [] });
      setElspectraData({ curves: [], curves_elasticity_param: [] });
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
        set_zero_force: setZeroForce,
        elasticity_params: elasticityParams,
        force_model_params: forceModelParams,
        elastic_model_params: elasticModelParams,
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
  }, [curveId, numCurves, regularFilters, cpFilters, forceModels, elasticityModels, forceRequest, setZeroForce, elasticityParams, forceModelParams, elasticModelParams]);
  useEffect(() => {
    const allCurveIds = forceData.map((curve) => curve.curve_id);
    setSelectedForExportCurveIds((prev) => {
      // Only update if the curve IDs have changed to avoid redundant updates
      if (JSON.stringify(prev) !== JSON.stringify(allCurveIds)) {
        // console.log("Initializing export curve IDs:", allCurveIds);
        return allCurveIds;
      }
      return prev;
    });
    setSelectedCurveIds((prev) => {
      // Only update if the curve IDs have changed to avoid redundant updates
      if (JSON.stringify(prev) !== JSON.stringify(allCurveIds)) {
        // console.log("Initializing export curve IDs:", allCurveIds);
        return allCurveIds;
      }
      return prev;
    });
  }, [forceData]);
  const initializeWebSocket = useCallback(() => {
    // console.log("initializeWebSocket: Initializing WebSocket");
    // Close existing connection if open
    if (socketRef.current) {
      socketRef.current.close();
    }// socketRef.current = new WebSocket(WEBSOCKET_URL);
    socketRef.current = new WebSocket(`${process.env.REACT_APP_BACKEND_URL.replace("https", "wss")}/ws/data`);
    socketRef.current.onopen = () => {
      // console.log("WebSocket connected.");
      if (!initialRequestSent.current) {
        sendCurveRequest();
        initialRequestSent.current = true;
      }
    };

    socketRef.current.onmessage = (event) => {
      const response = JSON.parse(event.data);
      // console.log("WebSocket response:", JSON.stringify(response, null, 2));

      if (response.status === "batch" && response.data) {
        const { graphForcevsZ, graphForceIndentation, graphElspectra, graphForcevsZSingle, graphForceIndentationSingle, graphElspectraSingle } = response.data;

        // console.log("graphForcevsZ:", JSON.stringify(graphForcevsZ, null, 2));
        // console.log("graphForceIndentationSingle:", JSON.stringify(graphForceIndentation, null, 2));
        // console.log("graphElspectra:", JSON.stringify(graphElspectra, null, 2));

        const forceGraph = (graphForcevsZSingle?.curves?.length > 0 ? graphForcevsZSingle : graphForcevsZ) || { curves: [], domain: {} };
        const indentationGraph = (graphForceIndentationSingle?.curves?.curves_cp?.length > 0 ? graphForceIndentationSingle : graphForceIndentation) || { curves: { curves_cp: [], curves_fparam: [] }, domain: {} };
        const elspectraGraph = (graphElspectraSingle?.curves?.length > 0 ? graphElspectraSingle : graphElspectra) || { curves: [], domain: {} };
        // Debug: Log elspectra data right after computing elspectraGraph
        console.log("ELS single?", !!graphElspectraSingle?.curves?.length, "len:", (elspectraGraph.curves||[])[0]?.x?.length, "domain:", elspectraGraph.domain);
        // const elspectraGraph =  (graphElspectraSingle?.curves?.length > 0 ? graphElspectraSingle : { curves: [], domain: {} });
        //         // console.log("elspectraGraph", elspectraGraph)

        // Handle multi-curve data - accumulate data from batches instead of replacing
        setForceData((prevData) => {
          // If this is a single curve request, replace the data
          if (graphForcevsZSingle?.curves?.length > 0) {
            return forceGraph.curves || [];
          }
          // Otherwise, accumulate with existing data
          const newCurves = forceGraph.curves || [];
          return [...prevData, ...newCurves];
        });

        setIndentationData((prevData) => {
          // If this is a single curve request, replace the data
          if (graphForceIndentationSingle?.curves?.curves_cp?.length > 0) {
            return indentationGraph.curves || { curves_cp: [], curves_fparam: [] };
          }
          // Otherwise, accumulate with existing data
          const newCurves = indentationGraph.curves || { curves_cp: [], curves_fparam: [] };
          return {
            curves_cp: [...(prevData.curves_cp || []), ...(newCurves.curves_cp || [])],
            curves_fparam: [...(prevData.curves_fparam || []), ...(newCurves.curves_fparam || [])]
          };
        });

        // Reset selectedCurveIds to the current curve when a single curve arrives
        // This keeps the charts consistent across tabs
        if (graphForceIndentationSingle?.curves?.curves_cp?.length === 1) {
          const singleCurveId = graphForceIndentationSingle.curves.curves_cp[0].curve_id;
          setSelectedCurveIds([singleCurveId]);
        }

        setElspectraData((prevData) => {
          // If this is a single curve request, replace the data
          if (graphElspectraSingle?.curves?.length > 0) {
            return {
              curves: elspectraGraph.curves || [],
              curves_elasticity_param: elspectraGraph.curves_elasticity_param || []
            };
          }
          // Otherwise, accumulate with existing data
          const newCurves = elspectraGraph.curves || [];
          const newElasticityParams = elspectraGraph.curves_elasticity_param || [];
          return {
            curves: [...(prevData.curves || []), ...newCurves],
            curves_elasticity_param: [...(prevData.curves_elasticity_param || []), ...newElasticityParams]
          };
        });

        // Update domain ranges
        setDomainRange((prev) => ({
          xMin: prev.xMin === null ? forceGraph.domain.xMin : Math.min(prev.xMin, forceGraph.domain.xMin ?? prev.xMin),
          xMax: prev.xMax === null ? forceGraph.domain.xMax : Math.max(prev.xMax, forceGraph.domain.xMax ?? prev.xMax),
          yMin: prev.yMin === null ? forceGraph.domain.yMin : Math.min(prev.yMin, forceGraph.domain.yMin ?? prev.yMin),
          yMax: prev.yMax === null ? forceGraph.domain.yMax : Math.max(prev.yMax, forceGraph.domain.yMax ?? prev.yMax),
        }));

        setIndentationDomain((prev) => ({
          xMin: prev.xMin === null ? indentationGraph.domain.xMin : Math.min(prev.xMin, indentationGraph.domain.xMin ?? prev.xMin),
          xMax: prev.xMax === null ? indentationGraph.domain.xMax : Math.max(prev.xMax, indentationGraph.domain.xMax ?? prev.xMax),
          yMin: prev.yMin === null ? indentationGraph.domain.yMin : Math.min(prev.yMin, indentationGraph.domain.yMin ?? prev.yMin),
          yMax: prev.yMax === null ? indentationGraph.domain.yMax : Math.max(prev.yMax, indentationGraph.domain.yMax ?? prev.yMax),
        }));

        setElspectraDomain((prev) => ({
          xMin: prev.xMin === null ? elspectraGraph.domain.xMin : Math.min(prev.xMin, elspectraGraph.domain.xMin ?? prev.xMin),
          xMax: prev.xMax === null ? elspectraGraph.domain.xMax : Math.max(prev.xMax, elspectraGraph.domain.xMax ?? prev.xMax),
          yMin: prev.yMin === null ? elspectraGraph.domain.yMin : Math.min(prev.yMin, elspectraGraph.domain.yMin ?? prev.yMin),
          yMax: prev.yMax === null ? elspectraGraph.domain.yMax : Math.max(prev.yMax, elspectraGraph.domain.yMax ?? prev.yMax),
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

        // console.log("Received filter defaults:", cleanedRegularFilters);
        // console.log("Received CP filter defaults:", cleanedCpFilters);
      }
      if (response.status === "metadata") {
        // console.log("metadata", response.metadata)
        setMetadataObject(response.metadata);
      }
      
      if (response.status === "complete") {
        // console.log("WebSocket request completed");
        setIsLoadingCurves(false); // Stop loading when all batches are complete
        // Clear the loading timeout
        if (socketRef.current.loadingTimeout) {
          clearTimeout(socketRef.current.loadingTimeout);
          socketRef.current.loadingTimeout = null;
        }
      }
      
      if (response.status === "error") {
        // console.error("WebSocket error:", response.message);
        setIsLoadingCurves(false); // Stop loading on error
        // Clear the loading timeout
        if (socketRef.current.loadingTimeout) {
          clearTimeout(socketRef.current.loadingTimeout);
          socketRef.current.loadingTimeout = null;
        }
      }
      
      if (response.status === "batch_empty" || response.status === "batch_error") {
        // console.log(`WebSocket ${response.status}:`, response.message);
        // Don't stop loading here as we might get more batches
        // Only stop on "complete" message
      }
    };

    socketRef.current.onclose = () => {
      // console.log("WebSocket disconnected.");
      setIsLoadingCurves(false); // Stop loading when connection is lost
      // Clear the loading timeout
      if (socketRef.current.loadingTimeout) {
        clearTimeout(socketRef.current.loadingTimeout);
        socketRef.current.loadingTimeout = null;
      }
      initialRequestSent.current = false; // Allow reinitialization
    };
  }, []);  // Send request when curveId changes
  useEffect(() => {
    if (curveId) {
      // console.log("changed curveId")
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
  };   const handleProcessSuccess = (result) => {
    // console.log('File processed successfully:', result);
    setForceData([]);
    setIndentationData({ curves_cp: [], curves_fparam: [] });
    setElspectraData({ curves: [], curves_elasticity_param: [] });
    setDomainRange({ xMin: null, xMax: null, yMin: null, yMax: null });
    setIndentationDomain({ xMin: null, xMax: null, yMin: null, yMax: null });
    setElspectraDomain({ xMin: null, xMax: null, yMin: null, yMax: null });
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
  };   const handleNumCurvesChange = (value) => {
    // console.log("new");
    const newValue = Math.max(1, Math.min(100, parseInt(value, 10)));
    setNumCurves(newValue);
  }; const [windowWidth, setWindowWidth] = useState(window.innerWidth);  // Update window width on resize
  // Single source of truth for sidebar open state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const handleExportCurveIdsChange = debounce((curveIds) => {
    console.log("Selected export curve IDs:", curveIds);
    setSelectedForExportCurveIds(curveIds);
  }, 300);

  // Helper: stable stringify that sorts keys deterministically
  const stableStringify = useCallback((obj) => {
    if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
    return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
  }, []);

  // Only the subset that actually affects fparams; also freeze the selected fmodel subtree
  const activeFmodel = selectedForceModel
    ? { [selectedForceModel]: forceModels?.[selectedForceModel] || {} }
    : {};
  const fparamsCacheKey = stableStringify({
    regularFilters,
    cpFilters,
    activeFmodel,
    numCurves
  });

  // Function to fetch all fparams with progress tracking
  const fetchAllFparams = useCallback(async () => {
    // Only load when the Force–Indentation tab is active AND the card is open AND a force model is chosen
    if (!showParameters || activeTab !== "forceIndentation" || !selectedForceModel) {
      // stop spinner; keep data and toggle as-is
      setFparamsProgress(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Guard: if we have cached data for this key, do not fetch
    if (lastFparamsKey === fparamsCacheKey && allFparams.length > 0) {
      setFparamsProgress(prev => ({ ...prev, isLoading: false, phase: "Cached" }));
      return;
    }

    // Reset progress and show loading state
    setFparamsProgress({ phase: "Initializing...", done: 0, total: 0, currentBatch: 0, totalBatches: 0, isLoading: true });
    // DO NOT clear allFparams; if stream fails, user still sees old data

    try {
      // Abort any in-flight request before starting a new one
      if (fparamsAbortRef.current) {
        try { fparamsAbortRef.current.abort(); } catch {}
      }
      fparamsAbortRef.current = new AbortController();

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/get-all-fparams-stream`, {
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
        signal: fparamsAbortRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Decode chunk and append to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE messages (ending with \n\n)
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ""; // Keep incomplete message in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                // Update progress state
                setFparamsProgress({
                  phase: data.phase || "",
                  done: data.done || 0,
                  total: data.total || 0,
                  currentBatch: data.current_batch || 0,
                  totalBatches: data.total_batches || 0,
                  isLoading: true
                });
              } else if (data.type === 'complete') {
                // Final result received
                setFparamsProgress(prev => ({ ...prev, isLoading: false, phase: "Complete" }));
                if (data.status === "success") {
                  setAllFparams(data.fparams || []);
                  setLastFparamsKey(fparamsCacheKey);
                } else {
                  setAllFparams([]);
                }
              } else if (data.type === 'error') {
                // Error occurred
                setFparamsProgress(prev => ({ ...prev, isLoading: false, phase: `Error: ${data.message || 'Unknown error'}` }));
                setAllFparams([]);
                console.error("Failed to fetch fparams:", data.message);
              }
            } catch (e) {
              console.error("Error parsing SSE data:", e, line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching fparams:", error);
      // Only show error if it wasn't an abort (abort is expected when switching tabs)
      if (error.name !== 'AbortError') {
        setFparamsProgress(prev => ({ ...prev, isLoading: false, phase: `Error: ${error.message}` }));
      } else {
        setFparamsProgress(prev => ({ ...prev, isLoading: false }));
      }
      // Don't clear allFparams on error - keep previously loaded data
    }
  }, [
    showParameters, activeTab, selectedForceModel,
    fparamsCacheKey, lastFparamsKey, allFparams.length,
    regularFilters, cpFilters, forceModels, elasticityModels, numCurves,
    stableStringify
  ]);

  // Fetch or reuse cache whenever dependencies indicate it's needed
  useEffect(() => {
    fetchAllFparams();
  }, [fetchAllFparams]);

  // Keep fmodel results cached; do not clear on tab switch
  // Invalidate/clear ONLY when the selected force model *changes*
  useEffect(() => {
    if (prevForceModel.current !== selectedForceModel) {
      prevForceModel.current = selectedForceModel;
      // uncheck the toggle and remove param points
      setShowParameters(false);
      setAllFparams([]);
      setLastFparamsKey(null);
      setFparamsProgress({
        phase: "",
        done: 0,
        total: 0,
        currentBatch: 0,
        totalBatches: 0,
        isLoading: false
      });
      // (optional) also abort any in-flight request
      if (fparamsAbortRef.current) {
        try { fparamsAbortRef.current.abort(); } catch {}
      }
    }
  }, [selectedForceModel]);

  // On tab switch, stop spinners; keep toggles & data. Also abort any in-flight streams.
  useEffect(() => {
    if (activeTab !== "elasticitySpectra") {
      if (eparamsAbortRef.current) {
        try { eparamsAbortRef.current.abort(); } catch {}
      }
      setEparamsProgress(prev => ({ ...prev, isLoading: false }));
    }
    if (activeTab !== "forceIndentation") {
      setFparamsProgress(prev => ({ ...prev, isLoading: false }));
      if (fparamsAbortRef.current) {
        try { fparamsAbortRef.current.abort(); } catch {}
      }
    }
  }, [activeTab]);

  // Build a stable cache key for elasticity (only the parts that affect results)
  const activeEmodel = selectedElasticityModel
    ? { [selectedElasticityModel]: elasticityModels?.[selectedElasticityModel] || {} }
    : {};
  const eparamsCacheKey = stableStringify({
    regularFilters,
    cpFilters,
    activeEmodel,
    numCurves
  });

  // Function to fetch all elasticity parameters (SSE streaming + caching + tab gating)
  const fetchAllElasticityParams = useCallback(async () => {
    // Only load on Elasticity tab with the card open and a model selected
    if (!showElasticityParameters || activeTab !== "elasticitySpectra" || !selectedElasticityModel) {
      // stop spinner if card got hidden or tab changed; keep data
      setEparamsProgress(prev => ({ ...prev, isLoading: false }));
      return;
    }

    // Use cache if key matches and we have data
    if (lastElasticityKey === eparamsCacheKey && allElasticityParams.length > 0) {
      setEparamsProgress(prev => ({ ...prev, isLoading: false, phase: "Cached" }));
      return;
    }

    try {
      // Start streaming progress
      setEparamsProgress({ phase: "Initializing...", done: 0, total: 0, currentBatch: 0, totalBatches: 0, isLoading: true });
      // Abort any in-flight request before starting a new one
      if (eparamsAbortRef.current) {
        try { eparamsAbortRef.current.abort(); } catch {}
      }
      eparamsAbortRef.current = new AbortController();

      // Prefer the SSE endpoint (same format as fmodel); fall back to JSON if unavailable
      const streamUrl = `${process.env.REACT_APP_BACKEND_URL}/get-all-emodels-stream`;
      let response = await fetch(streamUrl, {
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
        signal: eparamsAbortRef.current.signal
      });

      if (response.ok && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
        // --- Parse SSE stream like fmodel ---
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "initializing") {
                // Handle initialization event from backend
                setEparamsProgress({
                  phase: data.phase || "Initializing...",
                  done: 0,
                  total: data.total_curves || data.total || 0,
                  currentBatch: 0,
                  totalBatches: data.num_batches || data.total_batches || 0,
                  isLoading: true,
                });
              } else if (data.type === "progress") {
                // Update progress state with batch progress
                setEparamsProgress({
                  phase: data.phase || "",
                  done: data.done || data.completed || 0,
                  total: data.total || 0,
                  currentBatch: data.current_batch || 0,
                  totalBatches: data.total_batches || 0,
                  isLoading: true,
                });
              } else if (data.type === "complete") {
                setEparamsProgress(prev => ({ ...prev, isLoading: false, phase: "Complete" }));
                if (data.status === "success") {
                  setAllElasticityParams(data.elasticity_params || []);
                  setLastElasticityKey(eparamsCacheKey);
                } else {
                  setAllElasticityParams([]);
                }
              } else if (data.type === "error") {
                setEparamsProgress(prev => ({ ...prev, isLoading: false, phase: `Error: ${data.message || 'Unknown error'}` }));
                setAllElasticityParams([]);
              }
            } catch (e) {
              console.error("Error parsing SSE (emodel):", e, line);
            }
          }
        }
      } else {
        // --- Fallback to existing JSON endpoint (no progress granularity) ---
        response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/get-all-elasticity-params`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filters: {
              regular: regularFilters,
              cp_filters: cpFilters,
              f_models: forceModels,
              e_models: elasticityModels,
            },
          }),
          signal: eparamsAbortRef.current.signal
        });
        const result = await response.json();
        if (result.status === "success") {
          const data = result.elasticity_params || [];
          setAllElasticityParams(data);
          setLastElasticityKey(eparamsCacheKey);
          setEparamsProgress({ phase: "Complete", done: 1, total: 1, currentBatch: 1, totalBatches: 1, isLoading: false });
        } else {
          setAllElasticityParams([]);
          setEparamsProgress({ phase: "Error", done: 0, total: 0, currentBatch: 0, totalBatches: 0, isLoading: false });
        }
      }
    } catch (error) {
      // Ignore aborts; on real errors, keep previous data
      if (error.name !== 'AbortError') {
        setAllElasticityParams([]);
        setEparamsProgress({ phase: `Error: ${error.message}`, done: 0, total: 0, currentBatch: 0, totalBatches: 0, isLoading: false });
      } else {
        setEparamsProgress(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [
    showElasticityParameters, selectedElasticityModel, activeTab,
    lastElasticityKey, eparamsCacheKey, allElasticityParams.length,
    regularFilters, cpFilters, forceModels, elasticityModels,
    stableStringify
  ]);

  // Effect to fetch elasticity params when checkbox is checked
  useEffect(() => {
    fetchAllElasticityParams();
  }, [fetchAllElasticityParams]);

  // Keep emodel results cached; do not clear on tab switch
  // Invalidate/clear ONLY when the selected elasticity model *changes*
  useEffect(() => {
    if (prevElasticityModel.current !== selectedElasticityModel) {
      prevElasticityModel.current = selectedElasticityModel;
      // uncheck the toggle and remove param points
      setShowElasticityParameters(false);
      setAllElasticityParams([]);
      setLastElasticityKey(null);
      setEparamsProgress({
        phase: "",
        done: 0,
        total: 0,
        currentBatch: 0,
        totalBatches: 0,
        isLoading: false
      });
      // (optional) also abort any in-flight request
      if (eparamsAbortRef.current) {
        try { eparamsAbortRef.current.abort(); } catch {}
      }
    }
  }, [selectedElasticityModel]);  // Determine if mobile view (e.g., < 768px)
  const isMobile = windowWidth < 768;  // Dynamic styles based on window size
  const isDesktop = !isMobile;
  // Drawer docks only on desktop; content shifts only if actually open
  const contentShift = isDesktop && sidebarOpen;
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
  };
  // When the right drawer is docked on desktop, push the whole main content left
  const mainShiftStyle = {
    marginRight: contentShift ? `${DRAWER_WIDTH}px` : 0,
    transition: "margin-right .25s ease",
  };

  // If the viewport shrinks to mobile, auto-close so content doesn't stay shifted
  useEffect(() => {
    if (!isDesktop && sidebarOpen) setSidebarOpen(false);
  }, [isDesktop, sidebarOpen]);

  // Handler to toggle sidebar state - single source of truth
  const handleToggleSidebar = () => setSidebarOpen((v) => !v); 

  // --- New/updated header styles ---
  const headerBarStyle = {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: isMobile ? "8px" : "10px",
    marginBottom: "10px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
    border: "1px solid #e9ecf5",
    borderRadius: "10px",
    boxShadow: "0 8px 18px rgba(20, 20, 43, 0.06)",
  };

  const tabsWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: "0px",
    background: "#f2f4ff",
    border: "1px solid #dfe3ff",
    borderRadius: "12px",
    overflow: "hidden",
  };

  const tabButtonStyle = (isActive) => ({
    padding: isMobile ? "8px 10px" : "10px 14px",
    fontSize: isMobile ? "13px" : "14px",
    fontWeight: 600,
    letterSpacing: "0.01em",
    border: "none",
    outline: "none",
    cursor: "pointer",
    background: isActive ? "#ffffff" : "transparent",
    color: isActive ? "#1d1e2c" : "#4a4f6a",
    transition: "all .15s ease",
    boxShadow: isActive ? "inset 0 0 0 1px #cfd6ff" : "none",
  });

  const actionsWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? "6px" : "10px",
    marginLeft: "auto",
  };

  const actionBtnStyle = (variant = "primary") => {
    const base = {
      padding: isMobile ? "8px 10px" : "9px 12px",
      fontSize: isMobile ? "13px" : "14px",
      fontWeight: 600,
      borderRadius: "10px",
      border: "1px solid transparent",
      cursor: "pointer",
      transition: "transform .04s ease, box-shadow .15s ease, background .15s ease",
      whiteSpace: "nowrap",
    };
    if (variant === "primary") {
      return {
        ...base,
        background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
        color: "#fff",
        boxShadow: "0 8px 16px rgba(90, 105, 255, 0.25)",
      };
    }
    if (variant === "secondary") {
      return {
        ...base,
        background: "#fff",
        color: "#2c2f3a",
        border: "1px solid #e6e9f7",
      };
    }
    // disabled look when metadata is not ready
    return {
      ...base,
      background: "#f5f6fb",
      color: "#9aa0b5",
      border: "1px solid #eceef7",
      cursor: "not-allowed",
    };
  };

  // Add subtle pressed effect to all clickable buttons via inline events
  const pressable = {
    onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
    onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
    onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
  }; const filtersContainerStyle = {
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
      <div style={{ ...mainContentStyle, ...mainShiftStyle }}>
        {/* Header Toolbar */}
        <div style={headerBarStyle}>
          {/* Left: Segmented Tabs */}
          <div style={tabsWrapStyle} role="tablist" aria-label="Graphs">
            <button
              role="tab"
              aria-selected={activeTab === "forceDisplacement"}
              onClick={() => setActiveTab("forceDisplacement")}
              style={tabButtonStyle(activeTab === "forceDisplacement")}
              {...pressable}
            >
              Force–Displacement
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "forceIndentation"}
              onClick={() => setActiveTab("forceIndentation")}
              style={tabButtonStyle(activeTab === "forceIndentation")}
              {...pressable}
            >
              Force–Indentation
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "elasticitySpectra"}
              onClick={() => setActiveTab("elasticitySpectra")}
              style={tabButtonStyle(activeTab === "elasticitySpectra")}
              {...pressable}
            >
              Elasticity Spectra
            </button>
          </div>

          {/* Right: Actions */}
          <div style={actionsWrapStyle}>
            {/* File Open as "secondary" style to match */}
            <div {...pressable}>
              <FileOpener
                onProcessSuccess={handleProcessSuccess}
                onProcessStart={handleImportStart}
                onProcessEnd={handleImportEnd}
                setIsLoading={setIsLoadingImport}
                // render prop: force consistent button look
                renderTrigger={(open) => (
                  <button style={actionBtnStyle("secondary")} onClick={open}>
                    Open file
                  </button>
                )}
              />
            </div>

            {/* Export */}
            {isMetadataReady ? (
              <div {...pressable}>
                <ExportButton
                  curveIds={selectedExportCurveIds}
                  numCurves={numCurves}
                  isMetadataReady={isMetadataReady}
                  onExportStart={handleExportStart}
                  onExportEnd={handleExportEnd}
                  setIsLoading={setIsLoadingExport}
                  regularFilters={regularFilters}
                  cpFilters={cpFilters}
                  forceModels={forceModels}
                  elasticityModels={elasticityModels}
                  // render prop: consistent primary button look
                  renderTrigger={(doExport, disabled) => (
                    <button
                      onClick={doExport}
                      disabled={disabled}
                      style={disabled ? actionBtnStyle("disabled") : actionBtnStyle("primary")}
                    >
                      Export
                    </button>
                  )}
                />
              </div>
            ) : (
              <button disabled style={actionBtnStyle("disabled")}>Export</button>
            )}
          </div>
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
             setZeroForce={setZeroForce}
             onSetZeroForceChange={setSetZeroForce}
             elasticityParams={elasticityParams}
             onElasticityParamsChange={setElasticityParams}
             forceModelParams={forceModelParams}
             onForceModelParamsChange={setForceModelParams}
             elasticModelParams={elasticModelParams}
             onElasticModelParamsChange={setElasticModelParams}
             open={sidebarOpen}
             onToggle={handleToggleSidebar}
             fparamsProgress={fparamsProgress}
             eparamsProgress={eparamsProgress}
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
                   activeTab={activeTab}
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
                  forceData={elspectraData.curves || []}
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
                     forceData={elspectraData.curves || []}
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

