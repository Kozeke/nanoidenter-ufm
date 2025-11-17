// Coordinates dashboard state management so components share a single source of truth.
import { create } from 'zustand';

// Generates a clean filters payload so callers always receive fresh object references.
const createDefaultFilters = () => ({
  // Captures generic filter values coming from dashboard controls.
  regular: {},
  // Tracks contact point filter configuration keyed by filter identifiers.
  cp_filters: {},
  // Stores force model filters such as driftedhertz definitions.
  f_models: {},
  // Stores elastic model filters such as bilayer parameters.
  e_models: {},
});

// Provides baseline elasticity smoothing options aligned with backend defaults.
const createDefaultElasticityParams = () => ({
  // Enables interpolation of elasticity data before smoothing.
  interpolate: true,
  // Sets the polynomial order used by the elasticity smoother.
  order: 2,
  // Controls the moving window size employed during smoothing.
  window: 61,
});

// Supplies default elastic model index bounds to match backend expectations.
const createDefaultElasticModelParams = () => ({
  // Marks the maximum index used when trimming elastic model calculations.
  maxInd: 800,
  // Marks the minimum index used when trimming elastic model calculations.
  minInd: 0,
});

// Supplies default force model bounds and material properties required by backend jobs.
const createDefaultForceModelParams = () => ({
  // Marks the maximum index used when trimming force model calculations.
  maxInd: 800,
  // Marks the minimum index used when trimming force model calculations.
  minInd: 0,
  // Stores the Poisson ratio applied to force model computations.
  poisson: 0.5,
});

// Exposes the Zustand store hook that centralizes dashboard UI and pipeline state.
export const useDashboardStore = create((set) => ({
  // Tracks whether the dashboard sidebar is currently visible.
  sidebarOpen: false,
  // Indicates whether a dashboard operation is currently processing.
  loading: false,
  // Captures the latest error message to display in dashboard notifications.
  error: null,
  // Tracks current WebSocket connection status for UX.
  connectionStatus: 'disconnected',
  // Updates connection status when WebSocket lifecycle changes.
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  // ---- WebSocket connection status (for header UX) ----
  // Stores the last WebSocket error message for debugging.
  lastSocketError: null,
  // Updates the last socket error when connection issues occur.
  setLastSocketError: (error) => set({ lastSocketError: error }),
  // Tracks the identifier of the curve currently selected for analysis.
  selectedCurveId: null,
  // Controls which segments of the compute pipeline should run on execute.
  computeScope: 'full',
  // Captures the active filter configuration supplied to backend pipelines.
  filters: createDefaultFilters(),
  // Indicates whether zero force correction should be applied before analysis.
  setZeroForce: true,
  // Stores the active elasticity smoothing parameters shared with the backend.
  elasticityParams: createDefaultElasticityParams(),
  // Stores the active elastic model parameters shared with the backend.
  elasticModelParams: createDefaultElasticModelParams(),
  // Stores the active force model parameters shared with the backend.
  forceModelParams: createDefaultForceModelParams(),
  // Default value for the number of curves requested from the backend.
  numCurves: 10,
  // Updates the stored curve count while defaulting invalid input to 10.
  setNumCurves: (value) =>
    set({
      numCurves: Number.isNaN(+value) ? 10 : parseInt(value, 10),
    }),
  // Records which main dashboard tab is currently active.
  activeTab: 'forceDisplacement',
  // Updates the active tab selection shared across components.
  setActiveTab: (tab) => set({ activeTab: tab }),
  // Tracks the curve identifiers currently highlighted in graphs.
  selectedCurveIds: [],
  // Updates the highlighted curve identifiers so charts stay in sync.
  setSelectedCurveIds: (updater) =>
    set((state) => ({
      selectedCurveIds:
        typeof updater === 'function'
          ? updater(state.selectedCurveIds)
          : updater,
    })),
  // Tracks the curve identifiers chosen for export operations.
  selectedExportCurveIds: [],
  // Updates the export curve selection shared across UI elements.
  setSelectedExportCurveIds: (updater) =>
    set((state) => ({
      selectedExportCurveIds:
        typeof updater === 'function'
          ? updater(state.selectedExportCurveIds)
          : updater,
    })),
  // Stores the graph visualization style used by the dashboard charts.
  graphType: 'line',
  // Updates the shared graph visualization style.
  setGraphType: (type) => set({ graphType: type }),
  // Indicates whether any generic loading indicator should be shown.
  isLoading: false,
  // Toggles the generic loading indicator.
  setIsLoading: (v) => set({ isLoading: v }),
  // Indicates when curve data is being fetched from the backend.
  isLoadingCurves: false,
  // Toggles the curve loading indicator.
  setIsLoadingCurves: (v) => set({ isLoadingCurves: v }),
  // Indicates when an import workflow is in progress.
  isLoadingImport: false,
  // Toggles the import loading indicator.
  setIsLoadingImport: (v) => set({ isLoadingImport: v }),
  // Indicates when an export workflow is in progress.
  isLoadingExport: false,
  // Toggles the export loading indicator.
  setIsLoadingExport: (v) => set({ isLoadingExport: v }),
  // Aggregates loading indicators for the major dashboard workflows.
  loadingMulti: { curves: false, import: false, export: false },
  // Merges loading indicator patches so concurrent operations stay in sync.
  setLoadingMulti: (patch) =>
    set((state) => {
      const nextPatch =
        typeof patch === 'function' ? patch(state.loadingMulti) : patch;
      return {
        loadingMulti: {
          ...state.loadingMulti,
          ...(nextPatch || {}),
        },
      };
    }),
  // Updates the zero force correction toggle whenever the UI switch changes.
  updateZeroForce: (value) => set({ setZeroForce: value }),
  // Flips the sidebar state to open or close the dashboard filter drawer.
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  // Updates the loading indicator to reflect asynchronous progress.
  setLoading: (v) => set({ loading: v }),
  // Persists the most recent error message so UI components can display alerts.
  setError: (msg) => set({ error: msg }),
  // Sets the active curve identifier that downstream graphs should render.
  setSelectedCurveId: (id) => set({ selectedCurveId: id }),
  // Selects which compute scope future backend requests should run under.
  setComputeScope: (scope) => set({ computeScope: scope }),
  // Merges incoming filter updates while preserving untouched filter groups.
  setFilters: (updater) =>
    set((s) => ({ filters: { ...s.filters, ...updater } })),
  // Partially updates elasticity parameters without losing existing settings.
  setElasticityParams: (updater) =>
    set((s) => ({
      elasticityParams: { ...s.elasticityParams, ...updater },
    })),
  // Partially updates elastic model parameters while preserving prior values.
  setElasticModelParams: (updater) =>
    set((s) => ({
      elasticModelParams: { ...s.elasticModelParams, ...updater },
    })),
  // Partially updates force model parameters while preserving prior values.
  setForceModelParams: (updater) =>
    set((s) => ({
      forceModelParams: { ...s.forceModelParams, ...updater },
    })),
  // Restores all dashboard state to defaults so components can reset their view.
  reset: () =>
    set({
      sidebarOpen: false,
      loading: false,
      error: null,
      connectionStatus: 'disconnected',
      lastSocketError: null,
      selectedCurveId: null,
      computeScope: 'full',
      filters: createDefaultFilters(),
      setZeroForce: true,
      elasticityParams: createDefaultElasticityParams(),
      elasticModelParams: createDefaultElasticModelParams(),
      forceModelParams: createDefaultForceModelParams(),
      numCurves: 10,
      activeTab: 'forceDisplacement',
      graphType: 'line',
      selectedCurveIds: [],
      selectedExportCurveIds: [],
      isLoading: false,
      isLoadingCurves: false,
      isLoadingImport: false,
      isLoadingExport: false,
      loadingMulti: { curves: false, import: false, export: false },
    }),
}));

