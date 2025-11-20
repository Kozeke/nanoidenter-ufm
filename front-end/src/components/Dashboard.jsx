// Renders the main dashboard experience coordinating datasets, filters, and controls.
import React, { useState, useEffect, useRef, useCallback, createContext, useContext, Suspense, lazy } from "react";
import debounce from 'lodash/debounce';
import { Box, CircularProgress } from '@mui/material';
import FiltersComponent from "./FiltersComponent";
import CurveControlsComponent from "./CurveControlsComponent";
import { useDashboardStore } from "../state/useDashboardStore";
import { useDashboardWebSocket } from "../hooks/useDashboardWebSocket";
// Lazy-load panel components to improve initial load performance
const ForceDisplacementPanel = lazy(() => import("./ForceDisplacementPanel"));
const ForceIndentationPanel = lazy(() => import("./ForceIndentationPanel"));
const ElasticitySpectraPanel = lazy(() => import("./ElasticitySpectraPanel"));
const FileOpener = lazy(() => import("./FileOpener"));
const ExportButton = lazy(() => import("./ExportButton"));

// Keep this in sync with FilterStatusSidebar / FiltersComponent drawer width
const DRAWER_WIDTH = 300;

// Create MetadataContext
const MetadataContext = createContext({
  metadataObject: { columns: [], sample_row: {} },
  setMetadataObject: () => { },
});// Hook to use MetadataContext
export const useMetadata = () => useContext(MetadataContext);
const Dashboard = () => {
  // Pulls shared dashboard state values and mutators from the central store.
  const {
    // Tracks whether the filter sidebar is visible to the user.
    sidebarOpen,
    // Toggles the sidebar visibility state.
    toggleSidebar,
    // Identifies the currently selected curve across charts.
    selectedCurveId,
    // Updates the active curve identifier for shared components.
    setSelectedCurveId,
    // Stores the active filter configuration propagated to the backend.
    filters,
    // Merges filter updates from UI interactions.
    setFilters,
    // Indicates if zero force correction should be applied.
    setZeroForce,
    // Updates the zero force correction toggle.
    updateZeroForce,
    // Provides the elasticity smoothing configuration.
    elasticityParams,
    // Merges incoming elasticity parameter tweaks.
    setElasticityParams,
    // Provides the elastic model configuration sent to the backend.
    elasticModelParams,
    // Merges elastic model parameter updates.
    setElasticModelParams,
    // Provides the force model configuration sent to the backend.
    forceModelParams,
    // Merges force model parameter updates.
    setForceModelParams,
    // Controls how many curves to request from the backend.
    numCurves,
    // Updates the curve count while respecting valid bounds.
    setNumCurves,
    // Tracks which dashboard tab is currently active.
    activeTab,
    // Updates the active tab selection.
    setActiveTab,
    // Stores the graph visualization style for charts.
    graphType,
    // Updates the graph visualization style.
    setGraphType,
    // Stores the list of curves currently highlighted in charts.
    selectedCurveIds,
    // Updates the highlighted curves array.
    setSelectedCurveIds,
    // Stores the curves selected for exporting.
    selectedExportCurveIds,
    // Updates the export curve selection.
    setSelectedExportCurveIds,
    // Tracks parallel loading indicators for key workflows.
    loadingMulti,
    // Merges loading indicator updates.
    setLoadingMulti,
    // Indicates whether the dashboard is performing a generic loading workflow.
    isLoading,
    // Updates the generic loading indicator so dialogs stay responsive.
    setIsLoading,
    // Indicates whether curve data is currently loading.
    isLoadingCurves,
    // Updates the curve loading indicator shared across charts.
    setIsLoadingCurves,
    // Indicates whether an import job is underway.
    isLoadingImport,
    // Updates the import loading indicator so overlays can render.
    setIsLoadingImport,
    // Indicates whether an export job is underway.
    isLoadingExport,
    // Updates the export loading indicator so overlays can render.
    setIsLoadingExport,
    // WebSocket connection status for UX.
    connectionStatus,
  } = useDashboardStore();
  
  // Centralizes WebSocket lifecycle + curve fetching for the dashboard
  const {
    forceData,
    indentationData,
    elspectraData,
    domainRange,
    indentationDomain,
    elspectraDomain,
    metadataObject,
    setMetadataObject,
    sendCurveRequest,
    resetAndReload,
    filterDefaults,
    cpDefaults,
    forceModelDefaults,
    elasticityModelDefaults,
  } = useDashboardWebSocket();

  // Derives a simple boolean indicating WebSocket connection state.
  const isWebSocketConnected = connectionStatus === 'connected';

  // Maps connection status to user-friendly labels for display.
  const connectionLabel =
    connectionStatus === 'connected'
      ? 'Connected'
      : connectionStatus === 'connecting'
      ? 'Connecting…'
      : connectionStatus === 'error'
      ? 'Error'
      : 'Disconnected';
  const [filename, setFilename] = useState("");
  // Exposes regular filter configurations tracked in the shared store.
  const regularFilters = filters.regular;
  // Exposes contact point filter configurations tracked in the shared store.
  const cpFilters = filters.cp_filters;
  // Exposes force model configurations tracked in the shared store.
  const forceModels = filters.f_models;
  const [selectedForceModels, setSelectedForceModels] = useState([]);
  // Exposes elasticity model configurations tracked in the shared store.
  const elasticityModels = filters.e_models;
  const [selectedElasticityModels, setSelectedElasticityModels] = useState([]);
  const [selectedRegularFilters, setSelectedRegularFilters] = useState([]);
  const [selectedCpFilters, setSelectedCpFilters] = useState([]);
  // Applies incoming changes to regular filters while preserving unrelated groups.
  const updateRegularFilters = (updater) => {
    const nextValue = typeof updater === "function" ? updater(regularFilters) : updater;
    setFilters({ regular: nextValue });
  };
  // Applies incoming changes to contact point filters while preserving unrelated groups.
  const updateCpFilters = (updater) => {
    const nextValue = typeof updater === "function" ? updater(cpFilters) : updater;
    setFilters({ cp_filters: nextValue });
  };
  // Applies incoming changes to force model filters while preserving unrelated groups.
  const updateForceModels = (updater) => {
    const nextValue = typeof updater === "function" ? updater(forceModels) : updater;
    setFilters({ f_models: nextValue });
  };
  // Applies incoming changes to elasticity model filters while preserving unrelated groups.
  const updateElasticityModels = (updater) => {
    const nextValue = typeof updater === "function" ? updater(elasticityModels) : updater;
    setFilters({ e_models: nextValue });
  };
  const isMetadataReady = metadataObject.columns.length > 0 || Object.keys(metadataObject.sample_row).length > 0;
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
  useEffect(() => {
    const allCurveIds = forceData.map((curve) => curve.curve_id);
    setSelectedExportCurveIds((prev) => {
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

  // Determine if we're in single-curve mode based on selectedCurveId
  const hasSingleCurve = Boolean(selectedCurveId && String(selectedCurveId).trim() !== "");
  const isSingleCurveMode = hasSingleCurve;

  // Handler to set curve ID and optionally sync visual selection
  const handleSetCurveId = (curveId) => {
    setSelectedCurveId(curveId);

    // If this curve exists in the loaded data, auto-select it visually
    if (curveId && forceData.some(c => c.curve_id === curveId)) {
      setSelectedCurveIds([curveId]);
    }
  };

  // Auto-clear models when leaving single-curve mode
  useEffect(() => {
    if (!isSingleCurveMode) {
      // Clear models and parameter selections
      setFilters({ f_models: {}, e_models: {} });
      setSelectedForceModel("");
      setSelectedElasticityModel("");
      setSelectedParameters([]);
      setSelectedElasticityParameters([]);
    }
  }, [isSingleCurveMode, setFilters]); const filterTypes = {
    regular: {
      filters: regularFilters,
      setFilters: updateRegularFilters,
      selected: selectedRegularFilters,
      setSelected: setSelectedRegularFilters,
      defaults: filterDefaults,
    },
    cp: {
      filters: cpFilters,
      setFilters: updateCpFilters,
      selected: selectedCpFilters,
      setSelected: setSelectedCpFilters,
      defaults: cpDefaults,
    },
    force: {
      filters: forceModels,
      setFilters: updateForceModels,
      selected: selectedForceModels,
      setSelected: setSelectedForceModels,
      defaults: forceModelDefaults,
    },
    elasticity: {
      filters: elasticityModels,
      setFilters: updateElasticityModels,
      selected: selectedElasticityModels,
      setSelected: setSelectedElasticityModels,
      defaults: elasticityModelDefaults,
    },
  }; const handleAddFilter = (filterName, type) => {
    const config = filterTypes[type];
    if (!filterName) return;

    const defaultParams = config.defaults[filterName] || {};

    config.setFilters(() => {
      // For CP, Force model and Elasticity model we want **exactly one** active:
      // when a new one is chosen, drop all old ones for that family.
      if (type === "cp" || type === "force" || type === "elasticity") {
        return {
          [filterName]: defaultParams,
        };
      }

      // For other filter types (regular) keep multi-select behaviour
      return {
        [filterName]: defaultParams,
      };
    });

    // Keep the "selected" list in sync so the toolbar + sidebar reflect a single choice
    if (type === "cp") {
      setSelectedCpFilters([filterName]);
    } else if (type === "force") {
      setSelectedForceModels([filterName]);
    } else if (type === "elasticity") {
      setSelectedElasticityModels([filterName]);
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
    // Set numCurves: if loaded data has fewer than 10 curves, use that value; otherwise use 10
    if (result.curves) {
      setNumCurves(Math.min(result.curves, 10));
    }
    setFilename(result.filename || ""); // Set filename from result
    // Force a fresh WebSocket request after import
    resetAndReload();
  };

  const handleImportStart = () => {
    setLoadingMulti({ import: true });
    setIsLoadingImport(true);
  };

  const handleImportEnd = () => {
    setLoadingMulti({ import: false });
    setIsLoadingImport(false);
  };

  // Bridges FileOpener loading updates into the centralized loading tracker.
  const setImportLoadingFlag = (value) => {
    const nextValue = Boolean(value);
    setLoadingMulti({ import: nextValue });
    setIsLoadingImport(nextValue);
  };

  const handleExportStart = () => {
    setLoadingMulti({ export: true });
    setIsLoadingExport(true);
  };

  const handleExportEnd = () => {
    setLoadingMulti({ export: false });
    setIsLoadingExport(false);
  };

  // Bridges ExportButton loading updates into the centralized loading tracker.
  const setExportLoadingFlag = (value) => {
    const nextValue = Boolean(value);
    setLoadingMulti({ export: nextValue });
    setIsLoadingExport(nextValue);
  };

  const handleNumCurvesChange = (value) => {
    // console.log("new");
    setNumCurves(value);
  }; const [windowWidth, setWindowWidth] = useState(window.innerWidth);  // Update window width on resize
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const handleExportCurveIdsChange = debounce((curveIds) => {
    console.log("Selected export curve IDs:", curveIds);
    setSelectedExportCurveIds(curveIds);
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
    if (!isDesktop && sidebarOpen) toggleSidebar();
  }, [isDesktop, sidebarOpen, toggleSidebar]);

  // Handler to toggle sidebar state - single source of truth
  const handleToggleSidebar = () => toggleSidebar(); 

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

  // Wrapper style for the WebSocket connection status pill.
  const statusPillWrapperStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 600,
  };

  // Generates status-specific styling for the WebSocket connection indicator pill.
  const statusPillStyle = (status) => {
    const base = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '2px 10px',
      borderRadius: 999,
      border: '1px solid #ddd',
    };
    switch (status) {
      case 'connected':
        return {
          ...base,
          background: '#e6f4ea',
        };
      case 'connecting':
        return {
          ...base,
          background: '#fff7e6',
        };
      case 'error':
        return {
          ...base,
          background: '#fdecea',
        };
      case 'disconnected':
      default:
        return {
          ...base,
          background: '#f3f4f6',
        };
    }
  };

  // Generates status-specific dot color for the WebSocket connection indicator.
  const statusDotStyle = (status) => {
    switch (status) {
      case 'connected':
        return {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#34a853',
        };
      case 'connecting':
        return {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#fbbc04',
        };
      case 'error':
        return {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#ea4335',
        };
      case 'disconnected':
      default:
        return {
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#9ca3af',
        };
    }
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

  return (
    <MetadataContext.Provider value={{ metadataObject, setMetadataObject }}>
      <Suspense
        fallback={
          <Box display="flex" justifyContent="center" mt={4}>
            <CircularProgress />
          </Box>
        }
      >
        <div style={containerStyle}>
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

          {/* Middle: WebSocket status */}
          <div style={statusPillWrapperStyle}>
            <span style={statusPillStyle(connectionStatus)}>
              <span style={statusDotStyle(connectionStatus)} />
              {connectionStatus === "connected" && "Connected"}
              {connectionStatus === "connecting" && "Connecting..."}
              {connectionStatus === "error" && "Error"}
              {connectionStatus === "disconnected" && "Disconnected"}
            </span>
          </div>

          {/* Right: Actions */}
          <div style={actionsWrapStyle}>
            {/* File Open as "secondary" style to match */}
            <Suspense fallback={null}>
              <div {...pressable}>
                <FileOpener
                  disabled={!isWebSocketConnected || isLoadingImport}
                  onProcessSuccess={handleProcessSuccess}
                  onProcessStart={handleImportStart}
                  onProcessEnd={handleImportEnd}
                  setIsLoading={setImportLoadingFlag}
                  // render prop: force consistent button look
                  renderTrigger={(open) => (
                    <button 
                      style={(!isWebSocketConnected || isLoadingImport) ? actionBtnStyle("disabled") : actionBtnStyle("secondary")} 
                      onClick={open}
                      disabled={!isWebSocketConnected || isLoadingImport}
                    >
                      Open file
                    </button>
                  )}
                />
              </div>
            </Suspense>

            {/* Export */}
            {isMetadataReady ? (
              <Suspense fallback={null}>
                <div {...pressable}>
                  <ExportButton
                    disabled={!isWebSocketConnected || isLoadingExport}
                    // render prop: consistent primary button look
                    renderTrigger={(doExport, disabled) => (
                      <button
                        onClick={doExport}
                        disabled={disabled || !isWebSocketConnected || isLoadingExport}
                        style={(disabled || !isWebSocketConnected || isLoadingExport) ? actionBtnStyle("disabled") : actionBtnStyle("primary")}
                      >
                        Export
                      </button>
                    )}
                  />
                </div>
              </Suspense>
            ) : (
              <button disabled style={actionBtnStyle("disabled")}>Export</button>
            )}

            {/* Reconnect only when socket is not connected */}
            {connectionStatus !== 'connected' && (
              <button
                onClick={resetAndReload}
                style={actionBtnStyle("secondary")}
                {...pressable}
              >
                Reconnect
              </button>
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
             canUseModels={isSingleCurveMode}
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
             onSetZeroForceChange={updateZeroForce}
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
             // Disable filters when socket is down
             isSocketConnected={isWebSocketConnected}
           />
        </div>

        {/* Tab Content */}
        <div style={tabContentStyle}>
          {activeTab === "forceDisplacement" && (
            <ForceDisplacementPanel
              chartContainerStyle={chartContainerStyle}
              forceData={forceData}
              domainRange={domainRange}
              graphType={graphType}
              onGraphTypeChange={setGraphType}
              selectedCurveIds={selectedCurveIds}
              setSelectedCurveIds={setSelectedCurveIds}
              onCurveSelect={handleForceDisplacementCurveSelect}
            />
          )}

          {activeTab === "forceIndentation" && (
            <ForceIndentationPanel
              chartContainerStyle={chartContainerStyle}
              indentationData={indentationData}
              indentationDomain={indentationDomain}
              graphType={graphType}
              onGraphTypeChange={setGraphType}
              selectedCurveIds={selectedCurveIds}
              setSelectedCurveIds={setSelectedCurveIds}
              onCurveSelect={handleForceDisplacementCurveSelect}
              showParameters={showParameters}
              selectedForceModel={selectedForceModel}
              allFparams={allFparams}
              selectedParameters={selectedParameters}
              onParameterChange={setSelectedParameters}
              isSingleCurveMode={isSingleCurveMode}
            />
          )}

          {activeTab === "elasticitySpectra" && (
            <ElasticitySpectraPanel
              chartContainerStyle={chartContainerStyle}
              elspectraData={elspectraData}
              elspectraDomain={elspectraDomain}
              graphType={graphType}
              onGraphTypeChange={setGraphType}
              selectedCurveIds={selectedCurveIds}
              setSelectedCurveIds={setSelectedCurveIds}
              onCurveSelect={handleForceDisplacementCurveSelect}
              showElasticityParameters={showElasticityParameters}
              selectedElasticityModel={selectedElasticityModel}
              allElasticityParams={allElasticityParams}
              selectedElasticityParameters={selectedElasticityParameters}
              onElasticityParameterChange={setSelectedElasticityParameters}
              isSingleCurveMode={isSingleCurveMode}
            />
          )}
        </div>
        <CurveControlsComponent
          numCurves={numCurves}
          handleNumCurvesChange={handleNumCurvesChange}
          curveId={selectedCurveId}
          setCurveId={handleSetCurveId}
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
             // Disable curve controls when socket is down
             isSocketConnected={isWebSocketConnected}
        />
      </div>
    </div>
      </Suspense>
    </MetadataContext.Provider>);
}; export default Dashboard;

