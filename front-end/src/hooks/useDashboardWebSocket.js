// Drives dashboard WebSocket coordination so chart components can stay declarative.
import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardStore } from "../state/useDashboardStore";

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
  // Tracks the previous number of curves to detect request changes.
  const prevNumCurvesRef = useRef(10);
  // Flags when the caller explicitly wants to re-request curves.
  const [forceRequest, setForceRequest] = useState(false);

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
  // Provides the total number of curves requested for rendering.
  const { numCurves } = dashboardStore;
  // Provides the identifier of the currently selected curve.
  const { selectedCurveId } = dashboardStore;
  // Reports whether zero-force correction should be applied server-side.
  const { setZeroForce } = dashboardStore;
  // Exposes the multi-loading indicator dispatcher.
  const { setLoadingMulti } = dashboardStore;
  // Exposes the flag that toggles curve-level loading indicators.
  const { setIsLoadingCurves } = dashboardStore;
  // Exposes the setter for maintaining highlighted curve identifiers.
  const { setSelectedCurveIds } = dashboardStore;
  // Updates connection status used for UX.
  const { setConnectionStatus, setLastSocketError } = dashboardStore;

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
    // Avoid sending requests when the socket is unavailable.
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    // Flag loading so UI elements stay responsive.
    setLoadingMulti({ curves: true });
    // Flag curve-specific loading while waiting for batches.
    setIsLoadingCurves(true);

    // Prevent infinite loading states by timing out stale requests.
    const loadingTimeout = setTimeout(() => {
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
    }, 30000);
    socketRef.current.loadingTimeout = loadingTimeout;

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

    // Determines whether the requested curve count changed.
    const numCurvesChanged = prevNumCurvesRef.current !== numCurves;

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
    const requestData = {
      action: "get_metadata",
      num_curves: numCurves,
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
    // Record the latest curve count so future requests detect changes.
    prevNumCurvesRef.current = numCurves;
    // Clear the manual refresh flag now that the request is enqueued.
    setForceRequest(false);

    socketRef.current.send(JSON.stringify(requestData));
  }, [
    regularFilters,
    cpFilters,
    forceModels,
    elasticityModels,
    numCurves,
    elasticityParams,
    elasticModelParams,
    forceModelParams,
    setZeroForce,
    selectedCurveId,
    setLoadingMulti,
    setIsLoadingCurves,
  ]);

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

    const wsUrl = `${wsBase}/ws/data`;
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

      if (response.status === "metadata") {
        setMetadataObject(response.metadata);
      }

      if (response.status === "complete") {
        setLoadingMulti({ curves: false });
        setIsLoadingCurves(false);
        if (socketRef.current && socketRef.current.loadingTimeout) {
          clearTimeout(socketRef.current.loadingTimeout);
          socketRef.current.loadingTimeout = null;
        }
      }

      if (response.status === "error") {
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
      setLoadingMulti({ curves: false });
      setIsLoadingCurves(false);
      if (socketRef.current && socketRef.current.loadingTimeout) {
        clearTimeout(socketRef.current.loadingTimeout);
        socketRef.current.loadingTimeout = null;
      }
      initialRequestSent.current = false;
    };

    socket.onerror = (event) => {
      console.error("WebSocket error:", event);
      setConnectionStatus("error");
      setLastSocketError("WebSocket error");
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
  ]);

  // Auto-initializes the WebSocket connection and tears it down on unmount.
  useEffect(() => {
    initializeWebSocket();
    return () => {
      const s = socketRef.current;
      // Only close an OPEN or CLOSING socket; leave CONNECTING ones alone.
      if (s && (s.readyState === WebSocket.OPEN || s.readyState === WebSocket.CLOSING)) {
        s.close();
      }
    };
  }, [initializeWebSocket]);

  // Sends a curve request when the selected curve ID changes.
  useEffect(() => {
    if (selectedCurveId) {
      sendCurveRequest();
    }
  }, [selectedCurveId, sendCurveRequest]);

  // Forces a fresh WebSocket connection when the caller requests a hard reload.
  const resetAndReload = useCallback(() => {
    setForceRequest(true);
    initialRequestSent.current = false;
    initializeWebSocket();
  }, [initializeWebSocket]);

  return {
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
  };
};


