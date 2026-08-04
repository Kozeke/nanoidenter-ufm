// Drives dashboard WebSocket coordination so chart components can stay declarative.
import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardStore } from "../state/useDashboardStore";
import { useAuthStore } from "../state/useAuthStore";
import { normalizeForceStats, normalizeElasticityStats  } from "../utils/elasticityMapper"

// Formats mean ± std in plain decimal notation, sized to the std's precision.
// Unlike the backend's format_stat() (tuned for values spanning many orders of
// magnitude, e.g. Young's modulus in Pa), this stays readable for human-scale
// values like K (~O(1) N/m): "1.2530 ± 0.0050 N/m" instead of "(1258 ± 5) × 10^-3".
const formatMeanStd = (mean, std, unit) => {
  if (!Number.isFinite(mean)) return "—";
  if (!Number.isFinite(std) || std <= 0) {
    return `${mean.toPrecision(4)} ${unit}`;
  }
  // Show one extra digit of precision beyond where std first becomes significant.
  const decimals = Math.max(0, -Math.floor(Math.log10(std)) + 1);
  return `${mean.toFixed(decimals)} ± ${std.toFixed(decimals)} ${unit}`;
};

// Exposes dashboard curve data and WebSocket helpers to the presentation layer.
export const useDashboardWebSocket = () => {
  // Stores Force–Z curve batches received from the backend.
  const [forceData, setForceData] = useState([]);
  // Mirrors forceData synchronously so the "complete" handler (see onmessage
  // below) can read the fully-merged curve list without depending on the
  // `forceData` closure variable, which is stale inside onmessage since
  // initializeWebSocket isn't re-created on every forceData change.
  const forceDataRef = useRef([]);
  // Real ("curve{N}") ids that have been delivered at least once for the
  // current dataset. Lets the selection sync distinguish "the user unchecked
  // this" from "this curve is new" — see syncCurveSelectionsOnLoadComplete.
  const knownCurveIdsRef = useRef(new Set());
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
  // Tracks the previous segment selection to detect request changes.
  const prevSegmentTypeRef = useRef("segment0");
  // Flags when the caller explicitly wants to re-request curves.
  const [forceRequest, setForceRequest] = useState(false);
  // Ref mirror of forceRequest so sendCurveRequest always reads the current value
  // even when called from a stale WebSocket onopen closure.
  const forceRequestRef = useRef(false);
  // Tracks whether get_metadata operation is in progress
  const metadataInProgressRef = useRef(false);
  // Tracks whether compute_stats operation is in progress
  const statsInProgressRef = useRef(false);

  // Exposes the centralized dashboard store for shared state access.
  const dashboardStore = useDashboardStore();
  // Provides the start index of the curve range requested for rendering.
  // Still subscribed here so the return value stays reactive for consumers.
  const { curveFrom } = dashboardStore;
  // Provides the end index of the curve range requested for rendering.
  const { curveTo } = dashboardStore;
  // Provides the identifier of the currently selected curve.
  const { selectedCurveId } = dashboardStore;
  // Exposes the multi-loading indicator dispatcher.
  const { setLoadingMulti, loadingMulti } = dashboardStore;
  // Exposes the flag that toggles curve-level loading indicators.
  const { setIsLoadingCurves, isLoadingCurves } = dashboardStore;
  // Exposes the setter for maintaining highlighted curve identifiers.
  const { setSelectedCurveIds } = dashboardStore;
  // Exposes the setter for maintaining the export curve selection.
  const { setSelectedExportCurveIds } = dashboardStore;
  // Exposes the setter for the flag that says whether Display/Export
  // selections should be defaulted to "all curves" once the in-flight load
  // completes. The current value is always read fresh via
  // useDashboardStore.getState() inside onmessage to avoid stale closures.
  const { setNeedsCurveIdInit } = dashboardStore;
  // Updates connection status used for UX.
  const { setConnectionStatus, setLastSocketError, connectionStatus, lastSocketError } = dashboardStore;
  // Provides setters for selected curve ID and curve range.
  const { setSelectedCurveId, setCurveFrom, setCurveTo } = dashboardStore;

  // Builds a websocket-safe force-model payload that omits Hertz tip_radius overrides.
  const buildSocketForceModels = useCallback((rawForceModels) => {
    // Stores a shallow copy so payload sanitation never mutates shared store state.
    const sanitizedForceModels = { ...(rawForceModels || {}) };
    // Stores Hertz parameters only when Hertz is selected in the outgoing payload.
    const hertzModelParams = sanitizedForceModels.hertz;

    if (hertzModelParams && typeof hertzModelParams === "object") {
      // Excludes tip_radius so backend runtime metadata remains the single source of truth.
      const { tip_radius, ...hertzParamsWithoutTipRadius } = hertzModelParams;
      sanitizedForceModels.hertz = hertzParamsWithoutTipRadius;
    }

    return sanitizedForceModels;
  }, []);

  // Reconciles the Display/Export curve selections once a curve-data load has
  // fully finished (all "batch" messages merged). Doing this on the terminal
  // "complete" message rather than on each incremental batch is essential:
  // forceData arrives in chunks, so deriving "all curves" from a partial
  // update would both miss curves that hadn't streamed in yet and clobber
  // curves the user had deliberately unchecked.
  //
  // Only real "curve{N}" ids ever enter the selections. Synthetic diagnostic
  // overlays that filters add to the same curve list ("0_linfit",
  // "avg_linfit", "0_hertz", …) are deliberately excluded: they aren't rows in
  // the curve picker, the export endpoint rejects them, and their on-screen
  // visibility is derived from the real curve they annotate (see
  // ForceDisplacementDataSet.jsx).
  const syncCurveSelectionsOnLoadComplete = useCallback(() => {
    const finalCurveIds = forceDataRef.current
      .map((c) => c.curve_id)
      .filter((id) => /^curve\d+$/.test(String(id)));

    if (finalCurveIds.length === 0) {
      // Nothing loaded (empty/failed batch) — leave the selections untouched
      // rather than wiping them.
      return;
    }

    const finalCurveIdsSet = new Set(finalCurveIds);

    if (useDashboardStore.getState().needsCurveIdInit) {
      // Freshly loaded dataset (flagged by Dashboard.jsx's handleProcessSuccess):
      // default both selections to every curve.
      setNeedsCurveIdInit(false);
      knownCurveIdsRef.current = finalCurveIdsSet;
      setSelectedCurveIds(finalCurveIds);
      setSelectedExportCurveIds(finalCurveIds);
      return;
    }

    // Otherwise: "Update Curves", or a range/segment/filter change on an
    // already-loaded dataset. Two things must hold at once here:
    //   • a curve the user explicitly unchecked stays unchecked, and
    //   • a curve fetched for the first time (e.g. the range grew from 0–5 to
    //     0–10) arrives checked rather than silently hidden.
    // Telling the two apart requires knowing which ids have been seen before:
    // an id missing from the selection that was already known was deliberately
    // unchecked, whereas an id missing and previously unknown is simply new.
    const newlyArrivedIds = new Set(
      finalCurveIds.filter((id) => !knownCurveIdsRef.current.has(id))
    );
    knownCurveIdsRef.current = finalCurveIdsSet;

    // Rebuilds a selection: drops ids that no longer exist, keeps existing
    // choices, adds newly-arrived curves — all in canonical curve order.
    const reconcile = (prev) => {
      const prevSet = new Set(prev);
      const next = finalCurveIds.filter(
        (id) => prevSet.has(id) || newlyArrivedIds.has(id)
      );
      const unchanged =
        next.length === prev.length && next.every((id, i) => id === prev[i]);
      return unchanged ? prev : next;
    };
    setSelectedCurveIds(reconcile);
    setSelectedExportCurveIds(reconcile);
  }, [setSelectedCurveIds, setSelectedExportCurveIds, setNeedsCurveIdInit]);

  // Sends a curve metadata request through the active WebSocket channel.
  // All filter/param values are read directly from the Zustand store snapshot so
  // that calls originating from stale onopen closures (e.g. after resetAndReload)
  // always use the freshest state – including resets applied just before the call.
  const sendCurveRequest = useCallback(() => {
    console.log("sendCurveReq")
    // Avoid sending requests when the socket is unavailable.
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    console.log("sendCurveReq2")

    // Read all values fresh from the store so stale closures (e.g. socket.onopen
    // captured before the latest React render) never send outdated filter state.
    const liveState = useDashboardStore.getState();
    const liveFilters = liveState.filters;
    const liveRegularFilters = liveFilters.regular;
    const liveCpFilters = liveFilters.cp_filters;
    const liveForceModels = liveFilters.f_models;
    const liveElasticityModels = liveFilters.e_models;
    const liveElasticityParams = liveState.elasticityParams;
    const liveElasticModelParams = liveState.elasticModelParams;
    const liveForceModelParams = liveState.forceModelParams;
    const liveSetZeroForce = liveState.setZeroForce;
    const liveSelectedCurveId = liveState.selectedCurveId;
    const liveCurveFrom = liveState.curveFrom;
    const liveCurveTo = liveState.curveTo;
    const liveDatasetId = liveState.datasetId;
    const liveSegmentType = liveState.selectedSegmentType || "segment0";

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

    // Stores force-model filters after websocket sanitation (e.g., Hertz tip_radius removal).
    const socketSafeForceModels = buildSocketForceModels(liveForceModels);

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
        regular: liveRegularFilters,
        cp: liveCpFilters,
        f_models: socketSafeForceModels,
        e_models: liveElasticityModels,
      }
    );

    // Determines whether the requested curve range changed.
    const numCurvesChanged =
      prevCurveRangeRef.current.from !== liveCurveFrom ||
      prevCurveRangeRef.current.to !== liveCurveTo;

    // Determines whether the selected segment changed.
    const segmentTypeChanged = prevSegmentTypeRef.current !== liveSegmentType;

    if (segmentTypeChanged) {
      console.log(
        `Segment changed: ${prevSegmentTypeRef.current} -> ${liveSegmentType}`
      );
    }

    // Resets chart domains to trigger automatic scaling.
    const resetState = {
      xMin: null,
      xMax: null,
      yMin: null,
      yMax: null,
    };

    // forceRequestRef.current is always up-to-date even inside a stale closure,
    // unlike forceRequest state which may be stale when called from socket.onopen.
    const shouldReset = filtersChanged || numCurvesChanged || segmentTypeChanged || forceRequest || forceRequestRef.current;
    if (shouldReset) {
      // Clear the ref immediately so subsequent calls don't re-clear unnecessarily.
      forceRequestRef.current = false;
      setForceData([]);
      forceDataRef.current = [];
      setIndentationData({ curves_cp: [], curves_fparam: [] });
      setElspectraData({ curves: [], curves_elasticity_param: [] });
      setDomainRange(resetState);
      setIndentationDomain(resetState);
      setElspectraDomain(resetState);
    }

    // Builds the payload describing which curves and metadata to retrieve.
    console.log("sendCurveRequest - datasetId from store:", liveDatasetId);
    const requestData = {
      action: "get_metadata",
      curve_from: liveCurveFrom,
      curve_to: liveCurveTo,
      dataset_id: liveDatasetId,
      segment_type: liveSegmentType,
      filters: {
        regular: liveRegularFilters,
        cp_filters: liveCpFilters,
        f_models: socketSafeForceModels,
        e_models: liveElasticityModels,
      },
      elasticity_params: liveElasticityParams,
      elastic_model_params: liveElasticModelParams,
      force_model_params: liveForceModelParams,
      set_zero_force: liveSetZeroForce,
      curve_id: liveSelectedCurveId,
    };

    // Record the latest filters so future requests detect changes.
    prevFiltersRef.current = {
      regular: liveRegularFilters,
      cp: liveCpFilters,
      f_models: socketSafeForceModels,
      e_models: liveElasticityModels,
    };
    // Record the latest curve range so future requests detect changes.
    prevCurveRangeRef.current = { from: liveCurveFrom, to: liveCurveTo };
    prevSegmentTypeRef.current = liveSegmentType;
    // Clear the manual refresh flag now that the request is enqueued.
    setForceRequest(false);

    socketRef.current.send(JSON.stringify(requestData));
  }, [
    forceRequest,
    setLoadingMulti,
    setIsLoadingCurves,
    buildSocketForceModels,
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

    // Read all values fresh from the store snapshot so this function is never
    // affected by stale closure state (mirrors the pattern used in sendCurveRequest).
    const liveState = useDashboardStore.getState();
    const liveFilters = liveState.filters;
    const liveDatasetId = liveState.datasetId;
    // Stores force-model filters after websocket sanitation (e.g., Hertz tip_radius removal).
    const socketSafeForceModels = buildSocketForceModels(liveFilters.f_models);
    console.log("sendModelStatsRequest - datasetId from store:", liveDatasetId);
    // Real curve IDs only ("curve0", "curve12", …) — skip synthetic overlays
    // like "0_linfit" / "avg_linfit" that LinearWindowFit adds for display.
    const chosenCurveIds = (liveState.selectedCurveIds || []).filter((id) =>
      /^curve\d+$/.test(String(id))
    );
    const requestData = {
      action: "compute_stats",
      compute_scope: "model_stats",
      curve_from: liveState.curveFrom,
      curve_to: liveState.curveTo,
      dataset_id: liveDatasetId,
      segment_type: liveState.selectedSegmentType || "segment0",
      filters: {
        regular: liveFilters.regular,
        cp_filters: liveFilters.cp_filters,
        f_models: socketSafeForceModels,
        e_models: liveFilters.e_models,
      },
      elasticity_params: liveState.elasticityParams,
      elastic_model_params: liveState.elasticModelParams,
      force_model_params: liveState.forceModelParams,
      set_zero_force: liveState.setZeroForce,
      // Scopes K_raw / K_contact / E (and other model_stats) to the curves the
      // user currently has chosen in the curve picker — one or many.
      curve_ids: chosenCurveIds,
    };
  
    socketRef.current.send(JSON.stringify(requestData));
  }, [
    setLoadingMulti,
    setIsLoadingCurves,
    buildSocketForceModels,
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
          const next = graphForcevsZSingle?.curves?.length > 0
            ? (forceGraph.curves || [])
            : [...prevData, ...(forceGraph.curves || [])];
          forceDataRef.current = next;
          return next;
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
        console.log("MODEL_STATS received:", stats);
        console.log("filters (LIVE)", liveFilters);
        // console.log("elasticityModel (LIVE)", liveElasticityModels);
        const normalizedForceStats = normalizeForceStats(stats, liveFilters);
        const normalizedElasticStats = normalizeElasticityStats(stats, liveFilters);

        useDashboardStore.getState().setModelStats("force", normalizedForceStats);
        useDashboardStore.getState().setModelStats("elasticity", normalizedElasticStats);

        // K-stiffness comes back as a single format_stat() dict {mean, std, formatted}.
        // format_stat()'s "formatted" string is tuned for values spanning many orders
        // of magnitude (e.g. Young's modulus in Pa) and switches to "(1258 ± 5) × 10^-3"
        // style notation whenever std's exponent is small — which is exactly the case
        // for K (~O(1) N/m), producing an unreadable result. So K gets its own plain
        // decimal formatting from the raw mean/std instead of using .formatted.
        // K-stiffness, compliance-corrected k_contact, and Young's modulus E
        // all come from the LinearWindowFit pipeline. k_raw is always present;
        // k_contact and E only appear when the dataset's spring_constant
        // (k_spring) is large enough for the compliance correction to be valid.
        // Each entry keeps a stable "key" plus the raw (unformatted) mean/std alongside
        // the display-ready "value" string, so consumers like the export dialog and the
        // Save Experiment button can persist/show the numeric values, not just the label.
        // Values are aggregated only over the chosen curve_ids sent with the request
        // (one or many); stats.kfit_by_curve holds the per-id breakdown.
        const stiffnessStats = stats.k_stiffness
          ? [
              {
                key: "k_raw",
                label: "K_raw =",
                value: formatMeanStd(stats.k_stiffness.mean, stats.k_stiffness.std, "N/m"),
                mean: stats.k_stiffness.mean,
                std: stats.k_stiffness.std,
              },
              ...(stats.k_contact
                ? [{
                    key: "k_contact",
                    label: "K_contact =",
                    value: formatMeanStd(stats.k_contact.mean, stats.k_contact.std, "N/m"),
                    mean: stats.k_contact.mean,
                    std: stats.k_contact.std,
                  }]
                : []),
              ...(stats.youngs_modulus
                ? [{
                    key: "youngs_modulus",
                    label: "E =",
                    value: formatMeanStd(stats.youngs_modulus.mean, stats.youngs_modulus.std, "Pa"),
                    mean: stats.youngs_modulus.mean,
                    std: stats.youngs_modulus.std,
                  }]
                : []),
            ]
          : [];
        useDashboardStore.getState().setModelStats("stiffness", stiffnessStats);
        // Persist per-curve LinearWindowFit rows keyed by curve_id for the sidebar /
        // export consumers that need the chosen-id breakdown, not only mean±std.
        useDashboardStore.getState().setModelStats(
          "stiffnessByCurve",
          Array.isArray(stats.kfit_by_curve) ? stats.kfit_by_curve : []
        );

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
          syncCurveSelectionsOnLoadComplete();
        } else {
          // Fallback for any other (or missing) action: mark both done to avoid
          // an infinite loading state. Curve data may have streamed in under
          // this branch too (e.g. an older backend that omits "action"), so run
          // the same selection sync rather than leaving the picker unchecked.
          metadataInProgressRef.current = false;
          statsInProgressRef.current = false;
          console.log("unknown action completed – clearing all loading flags");
          syncCurveSelectionsOnLoadComplete();
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
      // Ignore close events from superseded sockets after resetAndReload().
      if (socketRef.current !== socket) {
        return;
      }
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
      // Ignore errors from superseded sockets after resetAndReload().
      if (socketRef.current !== socket) {
        return;
      }
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
    setSelectedExportCurveIds,
    setNeedsCurveIdInit,
    syncCurveSelectionsOnLoadComplete,
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
    // Set the ref synchronously so the new socket's onopen closure always sees
    // the reset signal, regardless of React's async state batching.
    forceRequestRef.current = true;
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