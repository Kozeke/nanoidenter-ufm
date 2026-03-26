// Drives dashboard WebSocket coordination so chart components can stay declarative.
import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardStore } from "../state/useDashboardStore";
import { useAuthStore } from "../state/useAuthStore";
import { normalizeForceStats, normalizeElasticityStats  } from "../utils/elasticityMapper"
// Exposes dashboard curve data and WebSocket helpers to the presentation layer.
export const useDashboardWebSocket = () => {
  // Stores Force–Z curve batches received from the backend.
  const [forceData, setForceData] = useState([]);
  // Stores Force–Indentation curve batches received from the backend.
  const [indentationData, setIndentationData] = useState({
    curves_cp: [],
    curves_fparam: [],
  });
  // Stores Elasticity Spectra curve batches received from the backend.
  const [elspectraData, setElspectraData] = useState({
    curves: [],
    curves_elasticity_param: [],
  });

  // Stores the Force–Z graph domain limits for consistent scaling.
  const [domainRange, setDomainRange] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  });
  // Stores the Force–Indentation graph domain limits for consistent scaling.
  const [indentationDomain, setIndentationDomain] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  });
  // Stores the Elasticity Spectra graph domain limits for consistent scaling.
  const [elspectraDomain, setElspectraDomain] = useState({
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  });

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);

  // Stores metadata columns and sample rows for file operations.
  const [metadataObject, setMetadataObject] = useState({
    columns: [],
    sample_row: {},
  });

  // Stores default definitions for all filter families (populated from backend).
  const [filterDefaults, setFilterDefaults] = useState({});
  // Stores default contact point filter configurations (fallback until backend responds).
  const [cpDefaults, setCpDefaults] = useState({
    autotresh: { range_to_set_zero: 500 }, // fallback until backend responds
  });
  // Stores default force model filter configurations (populated from backend).
  const [forceModelDefaults, setForceModelDefaults] = useState({});
  // Stores default elasticity model filter configurations (populated from backend).
  const [elasticityModelDefaults, setElasticityModelDefaults] = useState({});

  // Retains the live WebSocket connection for reuse across renders.
  const socketRef = useRef(null);
  // Tracks whether the initial data request has already been sent.
  const initialRequestSent = useRef(false);
  // Tracks the previous filter payloads so we can detect changes.
  const prevFiltersRef = useRef({
    regular: null,
    cp: null,
    f_models: null,
    e_models: null,
  });
  // Tracks the previous curve range to detect request changes.
  const prevCurveRangeRef = useRef({ from: 0, to: 10 });
  // Flags when the caller explicitly wants to re-request curves.
  const [forceRequest, setForceRequest] = useState(false);
  // Tracks whether get_metadata operation is in progress
  const metadataInProgressRef = useRef(false);
  // Tracks whether compute_stats operation is in progress
  const statsInProgressRef = useRef(false);

  // Exposes the centralized dashboard store for shared state access.
  const dashboardStore = useDashboardStore();
  // Provides the collection of active filters shared with the backend.
  const { filters } = dashboardStore;
  // Provides elasticity smoothing parameters requested by the backend.
  const { elasticityParams } = dashboardStore;
  // Provides elastic model parameters requested by the backend.
  const { elasticModelParams } = dashboardStore;
  // Provides force model parameters requested by the backend.
  const { forceModelParams } = dashboardStore;
  // Provides the start index of the curve range requested for rendering.
  const { curveFrom } = dashboardStore;
  // Provides the end index of the curve range requested for rendering.
  const { curveTo } = dashboardStore;
  // Provides the identifier of the currently selected curve.
  const { selectedCurveId } = dashboardStore;
  // Reports whether zero-force correction should be applied server-side.
  const { setZeroForce } = dashboardStore;
  // Provides the current dataset ID from the most recently loaded file.
  const { datasetId } = dashboardStore;
  // Exposes the multi-loading indicator dispatcher.
  const { setLoadingMulti, loadingMulti } = dashboardStore;
  // Exposes the flag that toggles curve-level loading indicators.
  const { setIsLoadingCurves, isLoadingCurves } = dashboardStore;
  // Exposes the setter for maintaining highlighted curve identifiers.
  const { setSelectedCurveIds } = dashboardStore;
  // Updates connection status used for UX.
  const { setConnectionStatus, setLastSocketError, connectionStatus, lastSocketError } = dashboardStore;
  // Provides setters for selected curve ID and curve range.
  const { setSelectedCurveId, setCurveFrom, setCurveTo } = dashboardStore;

  // Simplifies access to regular filter groups.
  const regularFilters = filters.regular;
  // Simplifies access to contact point filter groups.
  const cpFilters = filters.cp_filters;
  // Simplifies access to force model filter groups.
  const forceModels = filters.f_models;
  // Simplifies access to elasticity model filter groups.
  const elasticityModels = filters.e_models;

  // Sends a curve metadata request through the active WebSocket channel.
  const sendCurveRequest = useCallback(() => {
    console.log("sendCurveReq")
    // Avoid sending requests when the socket is unavailable.
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    console.log("sendCurveReq2")

    // Mark metadata operation as in progress
    metadataInProgressRef.current = true;
    
    // Flag loading so UI elements stay responsive.
    setLoadingMulti({ curves: true });
    // Flag curve-specific loading while waiting for batches.
    setIsLoadingCurves(true);

    // Safety-net timeout: clears any stale loading state if neither "complete"
    // message arrives within 5 minutes. Intentionally generous so that a slow
    // compute_stats request (> 1 min) is never cut short by this timer.
    if (socketRef.current.loadingTimeout) {
      clearTimeout(socketRef.current.loadingTimeout);
    }
    const loadingTimeout = setTimeout(() => {
      metadataInProgressRef.current = false;
      statsInProgressRef.current = false;
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
    }, 300000); // 5 minutes
    socketRef.current.loadingTimeout = loadingTimeout;
    console.log("sendCurveReq3")

    // Compares previous and current filter snapshots for change detection.
    const areFiltersEqual = (prev, current) => {
      if (!prev || !current) {
        return false;
      }
      return JSON.stringify(prev) === JSON.stringify(current);
    };

    // Determines if any filter group has changed since the last request.
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

    // Determines whether the requested curve range changed.
    const numCurvesChanged =
      prevCurveRangeRef.current.from !== curveFrom ||
      prevCurveRangeRef.current.to !== curveTo;

    // Resets chart domains to trigger automatic scaling.
    const resetState = {
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
    };

    if (filtersChanged || numCurvesChanged || forceRequest) {
      setForceData([]);
      setIndentationData({ curves_cp: [], curves_fparam: [] });
      setElspectraData({ curves: [], curves_elasticity_param: [] });
      setDomainRange(resetState);
      setIndentationDomain(resetState);
      setElspectraDomain(resetState);
    }

    // Builds the payload describing which curves and metadata to retrieve.
    // Get fresh datasetId from store to ensure we have the latest value
    const currentDatasetId = useDashboardStore.getState().datasetId;
    console.log("sendCurveRequest - datasetId from store:", currentDatasetId);
    const requestData = {
      action: "get_metadata",
      curve_from: curveFrom,
      curve_to: curveTo,
      dataset_id: currentDatasetId,
      filters: {
        regular: regularFilters,
        cp_filters: cpFilters,
        f_models: forceModels,
        e_models: elasticityModels,
      },
      elasticity_params: elasticityParams,
      elastic_model_params: elasticModelParams,
      force_model_params: forceModelParams,
      set_zero_force: setZeroForce,
      curve_id: selectedCurveId,
    };

    // Record the latest filters so future requests detect changes.
    prevFiltersRef.current = {
      regular: regularFilters,
      cp: cpFilters,
      f_models: forceModels,
      e_models: elasticityModels,
    };
    // Record the latest curve range so future requests detect changes.
    prevCurveRangeRef.current = { from: curveFrom, to: curveTo };
    // Clear the manual refresh flag now that the request is enqueued.
    setForceRequest(false);

    socketRef.current.send(JSON.stringify(requestData));
  }, [
    regularFilters,
    cpFilters,
    forceModels,
    elasticityModels,
    curveFrom,
    curveTo,
    elasticityParams,
    elasticModelParams,
    forceModelParams,
    setZeroForce,
    selectedCurveId,
    datasetId,
    setLoadingMulti,
    setIsLoadingCurves,
  ]);
  
  
  const sendModelStatsRequest = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
  
    // Mark stats operation as in progress
    statsInProgressRef.current = true;
    
    // Ensure loading is shown if stats computation starts
    setLoadingMulti({ curves: true });
    setIsLoadingCurves(true);

    // Reset the safety-net timeout so it starts counting from NOW, giving the
    // stats operation its own full 5-minute window on top of get_metadata.
    if (socketRef.current.loadingTimeout) {
      clearTimeout(socketRef.current.loadingTimeout);
    }
    socketRef.current.loadingTimeout = setTimeout(() => {
      metadataInProgressRef.current = false;
      statsInProgressRef.current = false;
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
    }, 300000); // 5 minutes from when stats request was sent
  
    // Get fresh datasetId from store to ensure we have the latest value
    const currentDatasetId = useDashboardStore.getState().datasetId;
    console.log("sendModelStatsRequest - datasetId from store:", currentDatasetId);
    const requestData = {
      action: "compute_stats",
      compute_scope: "model_stats",
      curve_from: curveFrom,
      curve_to: curveTo,
      dataset_id: currentDatasetId,
      filters: {
        regular: regularFilters,
        cp_filters: cpFilters,
        f_models: forceModels,
        e_models: elasticityModels,
      },
      elasticity_params: elasticityParams,
      elastic_model_params: elasticModelParams,
      force_model_params: forceModelParams,
      set_zero_force: setZeroForce,
      // IMPORTANT: DO NOT send curve_id
    };
  
    socketRef.current.send(JSON.stringify(requestData));
  }, [
    curveFrom,
    curveTo,
    datasetId,
    regularFilters,
    cpFilters,
    forceModels,
    elasticityModels,
    elasticityParams,
    elasticModelParams,
    forceModelParams,
    setZeroForce,
  ]);
  // Removed automatic model stats request - now triggered only by "Update Curves" button
  // Initializes the WebSocket connection and wires up lifecycle handlers.
  const initializeWebSocket = useCallback(() => {
    // Ensure any existing connection is gracefully closed first.
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (e) {
        console.warn("Error closing previous WebSocket:", e);
      }
    }

    // Derives the backend host from the environment configuration.
    const backend = process.env.REACT_APP_BACKEND_URL || "";
    let wsBase = backend;

    if (backend.startsWith("https://")) {
      wsBase = backend.replace(/^https/, "wss");
    } else if (backend.startsWith("http://")) {
      wsBase = backend.replace(/^http/, "ws");
    }

    // Include JWT token in WebSocket URL query parameter
    const wsUrl = token 
      ? `${wsBase}/ws/data?token=${encodeURIComponent(token)}`
      : `${wsBase}/ws/data`;
    console.log("Connecting WebSocket to:", wsUrl);

    // Update status before attempting the connection
    setConnectionStatus("connecting");
    setLastSocketError(null);

    // Constructs the new WebSocket instance and stores it in the ref.
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      console.log("WebSocket opened");
      setConnectionStatus("connected");

      // Sends the first request only once per connection.
      if (!initialRequestSent.current) {
        sendCurveRequest();
        initialRequestSent.current = true;
      }
    };

    socket.onmessage = (event) => {
      // Parses the incoming message payload for downstream handling.
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
        const forceGraph =
          (graphForcevsZSingle?.curves?.length > 0
            ? graphForcevsZSingle
            : graphForcevsZ) || { curves: [], domain: {} };

        const indentationGraph =
          (graphForceIndentationSingle?.curves?.curves_cp?.length > 0
            ? graphForceIndentationSingle
            : graphForceIndentation) || {
            curves: { curves_cp: [], curves_fparam: [] },
            domain: {},
          };

        const elspectraGraph =
          (graphElspectraSingle?.curves?.length > 0
            ? graphElspectraSingle
            : graphElspectra) || { curves: [], domain: {} };

        setForceData((prevData) => {
          if (graphForcevsZSingle?.curves?.length > 0) {
            return forceGraph.curves || [];
          }
          const newCurves = forceGraph.curves || [];
          return [...prevData, ...newCurves];
        });

        setIndentationData((prevData) => {
          if (graphForceIndentationSingle?.curves?.curves_cp?.length > 0) {
            return indentationGraph.curves || { curves_cp: [], curves_fparam: [] };
          }
          const newCurves =
            indentationGraph.curves || { curves_cp: [], curves_fparam: [] };
          // If incoming curves are empty, clear the data instead of appending
          const hasNewCurves = (newCurves.curves_cp?.length > 0) || (newCurves.curves_fparam?.length > 0);
          if (!hasNewCurves) {
            // Reset domain when clearing curves
            setIndentationDomain({ xMin: null, xMax: null, yMin: null, yMax: null });
            return { curves_cp: [], curves_fparam: [] };
          }
          return {
            curves_cp: [...(prevData.curves_cp || []), ...(newCurves.curves_cp || [])],
            curves_fparam: [
              ...(prevData.curves_fparam || []),
              ...(newCurves.curves_fparam || []),
            ],
          };
        });

        if (graphForceIndentationSingle?.curves?.curves_cp?.length === 1) {
          const singleCurveId = graphForceIndentationSingle.curves.curves_cp[0].curve_id;
          setSelectedCurveIds([singleCurveId]);
        }

        setElspectraData((prevData) => {
          if (graphElspectraSingle?.curves?.length > 0) {
            return {
              curves: elspectraGraph.curves || [],
              curves_elasticity_param:
                elspectraGraph.curves_elasticity_param || [],
            };
          }
          const newCurves = elspectraGraph.curves || [];
          const newElasticityParams =
            elspectraGraph.curves_elasticity_param || [];
          // If incoming curves are empty, clear the data instead of appending
          const hasNewCurves = (newCurves.length > 0) || (newElasticityParams.length > 0);
          if (!hasNewCurves) {
            // Reset domain when clearing curves
            setElspectraDomain({ xMin: null, xMax: null, yMin: null, yMax: null });
            return { curves: [], curves_elasticity_param: [] };
          }
          return {
            curves: [...(prevData.curves || []), ...newCurves],
            curves_elasticity_param: [
              ...(prevData.curves_elasticity_param || []),
              ...newElasticityParams,
            ],
          };
        });

        // Updates domain ranges for consistent chart scaling.
        if (indentationGraph.domain) {
          setIndentationDomain((prev) => ({
            xMin:
              prev.xMin === null
                ? indentationGraph.domain.xMin
                : Math.min(prev.xMin, indentationGraph.domain.xMin ?? prev.xMin),
            xMax:
              prev.xMax === null
                ? indentationGraph.domain.xMax
                : Math.max(prev.xMax, indentationGraph.domain.xMax ?? prev.xMax),
            yMin:
              prev.yMin === null
                ? indentationGraph.domain.yMin
                : Math.min(prev.yMin, indentationGraph.domain.yMin ?? prev.yMin),
            yMax:
              prev.yMax === null
                ? indentationGraph.domain.yMax
                : Math.max(prev.yMax, indentationGraph.domain.yMax ?? prev.yMax),
          }));
        }

        if (elspectraGraph.domain) {
          setElspectraDomain((prev) => ({
            xMin:
              prev.xMin === null
                ? elspectraGraph.domain.xMin
                : Math.min(prev.xMin, elspectraGraph.domain.xMin ?? prev.xMin),
            xMax:
              prev.xMax === null
                ? elspectraGraph.domain.xMax
                : Math.max(prev.xMax, elspectraGraph.domain.xMax ?? prev.xMax),
            yMin:
              prev.yMin === null
                ? elspectraGraph.domain.yMin
                : Math.min(prev.yMin, elspectraGraph.domain.yMin ?? prev.yMin),
            yMax:
              prev.yMax === null
                ? elspectraGraph.domain.yMax
                : Math.max(prev.yMax, elspectraGraph.domain.yMax ?? prev.yMax),
          }));
        }

        if (forceGraph.domain) {
          setDomainRange((prev) => ({
            xMin:
              prev.xMin === null
                ? forceGraph.domain.xMin
                : Math.min(prev.xMin, forceGraph.domain.xMin ?? prev.xMin),
            xMax:
              prev.xMax === null
                ? forceGraph.domain.xMax
                : Math.max(prev.xMax, forceGraph.domain.xMax ?? prev.xMax),
            yMin:
              prev.yMin === null
                ? forceGraph.domain.yMin
                : Math.min(prev.yMin, forceGraph.domain.yMin ?? prev.yMin),
            yMax:
              prev.yMax === null
                ? forceGraph.domain.yMax
                : Math.max(prev.yMax, forceGraph.domain.yMax ?? prev.yMax),
          }));
        }
      }
      if (response.status === "model_stats" && response.data.stats) {
        const liveFilters = useDashboardStore.getState().filters;
        // const liveElasticityModels = liveFilters.e_models;
        const stats = response.data.stats
        console.log("filters (LIVE)", liveFilters);
        // console.log("elasticityModel (LIVE)", liveElasticityModels);
        const normalizedForceStats = normalizeForceStats(stats, liveFilters);
        const normalizedElasticStats = normalizeElasticityStats(stats, liveFilters);
        
        useDashboardStore.getState().setModelStats("force", normalizedForceStats);
        useDashboardStore.getState().setModelStats("elasticity", normalizedElasticStats);
        
        // Note: Don't mark stats as complete here - wait for "complete" status
      }
      
      if (response.status === "metadata") {
        setMetadataObject(response.metadata);
      }    
      console.log("sendCurveReq5")

      // Handle filter defaults sent once on WebSocket handshake
      if (response.status === "filter_defaults" && response.data) {
        const {
          regular_filters = {},
          cp_filters = {},
          fmodels = {},
          emodels = {},
        } = response.data;

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
      }
      console.log("sendCurveReq8")

      if (response.status === "complete") {
        // Use the action field sent by the backend to identify which operation
        // finished. This is reliable regardless of message ordering.
        if (response.action === "compute_stats") {
          statsInProgressRef.current = false;
          console.log("compute_stats completed");
        } else if (response.action === "get_metadata") {
          metadataInProgressRef.current = false;
          console.log("get_metadata completed");
        } else {
          // Fallback for any other (or missing) action: mark both done to avoid
          // an infinite loading state.
          metadataInProgressRef.current = false;
          statsInProgressRef.current = false;
          console.log("unknown action completed – clearing all loading flags");
        }

        // Only hide the spinner once ALL in-flight operations have reported done.
        if (!metadataInProgressRef.current && !statsInProgressRef.current) {
          console.log("All operations completed, hiding spinner");
          setLoadingMulti({ curves: false });
          setIsLoadingCurves(false);
          if (socketRef.current && socketRef.current.loadingTimeout) {
            clearTimeout(socketRef.current.loadingTimeout);
            socketRef.current.loadingTimeout = null;
          }
        } else {
          console.log("Operations still in progress:", {
            metadata: metadataInProgressRef.current,
            stats: statsInProgressRef.current,
          });
        }
      }

      if (response.status === "error") {
        // On error, mark both operations as not in progress
        metadataInProgressRef.current = false;
        statsInProgressRef.current = false;
        
        setLoadingMulti({ curves: false });
        setIsLoadingCurves(false);
        if (socketRef.current && socketRef.current.loadingTimeout) {
          clearTimeout(socketRef.current.loadingTimeout);
          socketRef.current.loadingTimeout = null;
        }
      }

      if (
        response.status === "batch_empty" ||
        response.status === "batch_error"
      ) {
        console.log(`WebSocket ${response.status}:`, response.message);
      }
    };

    socket.onclose = (event) => {
      console.warn("WebSocket connection closed", event);
      setConnectionStatus("disconnected");
      // Reset both operation flags
      metadataInProgressRef.current = false;
      statsInProgressRef.current = false;
      
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
      if (socketRef.current && socketRef.current.loadingTimeout) {
        clearTimeout(socketRef.current.loadingTimeout);
        socketRef.current.loadingTimeout = null;
      }
      initialRequestSent.current = false;
    };
    console.log("sendCurveReq9")

    socket.onerror = (event) => {
      console.error("WebSocket error:", event);
      setConnectionStatus("error");
      setLastSocketError("WebSocket error");
      // Reset both operation flags
      metadataInProgressRef.current = false;
      statsInProgressRef.current = false;
      
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
      if (socketRef.current && socketRef.current.loadingTimeout) {
        clearTimeout(socketRef.current.loadingTimeout);
        socketRef.current.loadingTimeout = null;
      }
    };
  }, [
    sendCurveRequest,
    setLoadingMulti,
    setIsLoadingCurves,
    setConnectionStatus,
    setLastSocketError,
    setSelectedCurveIds,
    token,
  ]);

  // Auto-initializes the WebSocket connection and tears it down on unmount.
  useEffect(() => {
    if (!isAuthenticated || !token) {
      // 🔐 Ensure socket is closed when logged out
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {}
        socketRef.current = null;
      }
      return;
    }
    initializeWebSocket();
    return () => {
      const s = socketRef.current;
      // Only close an OPEN or CLOSING socket; leave CONNECTING ones alone.
      if (s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CLOSING)) {
        s.close();
      }
    };
    // socketRef.current = null;
    // We only want this to run once on mount/unmount,
    // not every time initializeWebSocket (and thus curveFrom/curveTo) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token]);

  // Forces a fresh WebSocket connection when the caller requests a hard reload.
  const resetAndReload = useCallback(() => {
    console.log("resetAndReload")
    setForceRequest(true);
    initialRequestSent.current = false;
    initializeWebSocket();
  }, [initializeWebSocket]);

  return {
    forceData,
    indentationData,
    elspectraData,
    loadingMulti,
    isLoadingCurves,
    connectionStatus,
    lastSocketError,
    selectedCurveId,
    setSelectedCurveId,
    curveFrom,
    curveTo,
    setCurveFrom,
    setCurveTo,
    domainRange,
    indentationDomain,
    elspectraDomain,
    metadataObject,
    setMetadataObject,
    sendCurveRequest,
    sendModelStatsRequest,
    resetAndReload,
    filterDefaults,
    cpDefaults,
    forceModelDefaults,
    elasticityModelDefaults,
  };
};