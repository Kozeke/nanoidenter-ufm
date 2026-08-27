// Sidebar that displays applied filters and editable filter parameters for the active dataset view.
import React, { useCallback, useEffect, useState } from "react";
import {
  Drawer,
  Typography,
  Card,
  CardContent,
  IconButton,
  Stack,
  Tooltip,
  TextField,
  Slider,
  Fade,
  Box,
  Checkbox,
  FormControlLabel,
  LinearProgress,
  CircularProgress,
  useTheme,
  useMediaQuery
} from "@mui/material";
import { Delete, Close, InfoOutlined } from "@mui/icons-material";
import { useDashboardStore } from "../state/useDashboardStore";
// Drawer width constant for consistent spacing across components
const DRAWER_WIDTH = 300;

// --- Unified UI tokens (match Dashboard/Filters) ---
const sidebarPaperSx = {
  width: DRAWER_WIDTH,
  height: "100vh",
  bgcolor: "#fafbff",
  borderLeft: "1px solid #e9ecf5",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  fontFamily: "'Roboto', sans-serif",
};

const headerBarSx = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 1,
  px: 1.25,
  py: 1,
  mb: 1,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderBottom: "1px solid #e9ecf5",
  boxShadow: "0 6px 14px rgba(20, 20, 43, 0.06)",
};

const titleSx = { fontSize: 16, fontWeight: 700, color: "#1d1e2c", whiteSpace: "nowrap" };

const cardSx = {
  bgcolor: "#ffffff",
  border: "1px solid #e9ecf5",
  borderRadius: "10px",
  boxShadow: "0 6px 14px rgba(20, 20, 43, 0.06)",
  transition: "transform .15s ease, box-shadow .15s ease",
  "&:hover": { transform: "translateY(-1px)", boxShadow: "0 10px 22px rgba(20,20,43,.08)" },
  mb: 1,
};

const sectionLabelSx = (color = "#3DA58A") => ({
  fontSize: 14,
  fontWeight: 700,
  color,
  whiteSpace: "nowrap",
});

const captionSx = { display: "block", fontSize: 12, mb: 0.25, whiteSpace: "nowrap" };

const inputCompactSx = {
  "& .MuiInputBase-input": { fontSize: 13, py: 0.75 },
  "& .MuiOutlinedInput-root": { height: 34 },
};

const sliderSx = {
  color: "#3DA58A",
  "& .MuiSlider-thumb": { width: 16, height: 16 },
  "& .MuiSlider-track": { height: 4 },
  "& .MuiSlider-rail": { height: 4 },
};

const closeBtnHandlers = {
  onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
  onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
  onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
};
// Converts a numeric value to mantissa/exponent pair for scientific-notation style inputs.
const normalizeToMantissaExp = (value) => {
  if (value == null || value === 0) return { mantissa: "0", exponent: 0 };
  const exponent = Math.floor(Math.log10(Math.abs(value))) + 1;
  const mantissa = value / Math.pow(10, exponent);
  const roundedMantissa = parseFloat(mantissa.toPrecision(10));
  return { mantissa: String(roundedMantissa), exponent };
};
// Stores contextual parameter tooltip descriptions keyed by filter and parameter names.
const parameterTooltipByFilter = {
  autothresh: {
    zeroRange: "Zero range offset in nanometers; used to choose the baseline region before contact detection.",
  },
  threshold: {
    starting_threshold: "Initial force threshold in nN used to locate the first threshold neighborhood.",
    min_x: "Minimum and maximum x-range percentages used to compute the baseline window for thresholding.",
    max_x: "Minimum and maximum x-range percentages used to compute the baseline window for thresholding.",
    force_offset: "Force offset in pN added to the baseline to define the final crossing threshold.",
  },
  gof: {
    fitwindow: "Indentation fit window length in nanometers used in R-squared goodness-of-fit scans.",
    minx: "Minimum x-range percentage where goodness-of-fit scanning starts.",
    maxf: "Maximum force-range percentage where goodness-of-fit scanning ends.",
  },
  gofsphere: {
    fit_window: "Fit window size in nanometers used for local spherical goodness-of-fit evaluation.",
    x_range: "X-range span in nanometers used to define the search interval before the force threshold point.",
    force_threshold: "Force threshold in nN used to set the upper bound of candidate contact points.",
  },
  rov: {
    safe_threshold: "Safe force threshold in nN used to define the upper boundary of the RoV search interval.",
    x_range: "X-range span in nanometers used to set the left boundary for RoV contact-point scanning.",
    windowRov: "Window size in nanometers used to compute the ratio-of-variances metric.",
  },
  stepdrift: {
    Fthreshold: "Safe threshold in nN used to define the upper boundary for StepDrift RoV scanning.",
    Xrange: "X-range span in nanometers used to define the search interval left of the threshold point.",
    windowr: "Window size in nanometers used to compute StepDrift ratio-of-variances.",
  },
};

// Maps filter parameters to measurement units shown in the applied-filters sidebar.
const parameterUnitByFilter = {
  savgolsmooth: {
    window_size: "nm",
  },
  fixedbaseline: {
    baseline_start_nm: "nm",
    baseline_dz_nm: "nm",
  },
  linearwindowfit: {
    t1_nm: "nm",
    t2_nm: "nm",
  },
  notch: {
    period_nm: "nm",
  },
  lineardetrend: {
    smoothing_window: "pts",
    threshold: "N",
  },
  customfilter: {
    smoothing_window: "pts",
    threshold: "N",
    threswindow: "N",
  },
  polytrend: {
    percentile: "%",
  },
  prominence: {
    band: "%",
  },
  median: {
    window_size: "pts",
  },
  hertz: {
    maxInd: "nm",
    minInd: "nm",
    tip_radius: "m",
  },
  hertzeffective: {
    maxInd: "nm",
    minInd: "nm",
  },
  driftedhertz: {
    maxInd: "nm",
    minInd: "nm",
  },
  hertzline: {
    tip_radius: "m",
  },
  bilayer: {
    maxInd: "nm",
    minInd: "nm",
    tip_radius: "m",
  },
  sigmoid: {
    Smooth: "%",
    Lower: "%",
  },
  sigmoid_new: {
    maxInd: "nm",
    minInd: "nm",
  },
  cmax: {
    Smooth: "%",
    Lower: "%",
  },
};

// Resolves the measurement unit displayed beside an applied filter parameter.
const getParameterUnit = (filterName, param) => {
  const filterKey = filterName?.toLowerCase() ?? "";
  const paramKey = param ?? "";
  const filterUnits = parameterUnitByFilter[filterKey];

  if (filterUnits) {
    if (paramKey in filterUnits) return filterUnits[paramKey];
    const matchedKey = Object.keys(filterUnits).find(
      (key) => key.toLowerCase() === paramKey.toLowerCase()
    );
    if (matchedKey) return filterUnits[matchedKey];
  }

  const normalizedParam = paramKey.toLowerCase();
  if (
    normalizedParam.endsWith("_nm") ||
    normalizedParam === "fitwindow" ||
    normalizedParam === "zerorange" ||
    normalizedParam === "windowrov" ||
    normalizedParam === "windowr" ||
    normalizedParam === "xrange" ||
    normalizedParam === "x_range" ||
    normalizedParam === "fit_window"
  ) {
    return "nm";
  }
  if (normalizedParam === "maxind" || normalizedParam === "minind") return "nm";
  if (normalizedParam === "tip_radius") return "m";
  if (
    normalizedParam === "starting_threshold" ||
    normalizedParam === "fthreshold" ||
    normalizedParam === "force_threshold" ||
    normalizedParam === "safe_threshold"
  ) {
    return "nN";
  }
  if (normalizedParam === "force_offset") return "pN";
  if (
    normalizedParam === "min_x" ||
    normalizedParam === "max_x" ||
    normalizedParam === "minx" ||
    normalizedParam === "maxf" ||
    normalizedParam === "percentile" ||
    normalizedParam === "band" ||
    normalizedParam === "smooth" ||
    normalizedParam === "lower"
  ) {
    return "%";
  }
  if (normalizedParam === "smoothing_window") return "pts";
  if (normalizedParam === "window_size" && filterKey === "median") return "pts";
  if (normalizedParam === "window_size") return "nm";

  return "";
};

// Appends a unit suffix to a parameter label when a unit is known.
const formatParameterLabel = (label, unit) => (unit ? `${label} (${unit})` : label);

const ComputedResults = ({ title, stats, emphasizeLabel = false }) => {
  // Drops placeholder/empty entries so we never render a blank stat box.
  const validStats = (Array.isArray(stats) ? stats : []).filter(
    (item) => item?.value != null && item.value !== "" && item.value !== "—"
  );

  if (validStats.length === 0) return null;

  // Stiffness (emphasizeLabel) stacks K_raw / K_contact / E on separate rows so
  // long "mean ± std" values stay readable; other result cards keep a 2-col grid.
  const columnCount = emphasizeLabel ? 1 : Math.min(validStats.length, 2);

  return (
    <Box sx={{ mt: 1, width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
      <Typography
        variant="caption"
        sx={{
          fontSize: 12,
          fontWeight: 700,
          color: "#6b7280",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          mb: 0.75,
          display: "block",
        }}
      >
        {title}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gap: 1,
          // Keeps long stiffness mean±std strings inside the 300px drawer.
          width: "100%",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {validStats.map((item, idx) => (
          <Box
            key={idx}
            sx={{
              border: emphasizeLabel ? "2px solid #3DA58A" : "1px dashed #dbe2ff",
              borderRadius: "8px",
              px: emphasizeLabel ? 1 : 1,
              py: emphasizeLabel ? 0.75 : 0.75,
              backgroundColor: emphasizeLabel ? "#ffffff" : "#f9faff",
              boxShadow: emphasizeLabel ? "0 1px 4px rgba(0, 0, 0, 0.08)" : "none",
              display: "flex",
              flexDirection: "row",
              alignItems: "baseline",
              gap: 0.5,
              flexWrap: "nowrap",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              boxSizing: "border-box",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                // Slightly smaller than before so label + value fit on one line within the drawer.
                fontSize: emphasizeLabel ? 11 : 11,
                fontWeight: emphasizeLabel ? 800 : 400,
                color: emphasizeLabel ? "#111827" : "#6b7280",
                flexShrink: 0,
              }}
            >
              {item.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                fontSize: emphasizeLabel ? 12 : 13,
                color: emphasizeLabel ? "#111827" : "inherit",
                fontFamily: "monospace",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const FilterCard = ({
  filterName,
  filterData,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
  type,
  color = "#3DA58A"
}) => {
  // Holds the mantissa text for autothresh zeroRange so users can type freely.
  const [zeroRangeMantissaInput, setZeroRangeMantissaInput] = useState("0");
  // Holds the exponent text for autothresh zeroRange to support live scientific editing.
  const [zeroRangeExponentInput, setZeroRangeExponentInput] = useState("0");
  // Holds the mantissa text for Hertz max indentation so users can type freely.
  const [hertzMaxIndMantissaInput, setHertzMaxIndMantissaInput] = useState("0");
  // Holds the exponent text for Hertz max indentation scientific input.
  const [hertzMaxIndExponentInput, setHertzMaxIndExponentInput] = useState("0");
  // Holds the mantissa text for Hertz min indentation so users can type freely.
  const [hertzMinIndMantissaInput, setHertzMinIndMantissaInput] = useState("0");
  // Holds the exponent text for Hertz min indentation scientific input.
  const [hertzMinIndExponentInput, setHertzMinIndExponentInput] = useState("0");
  // Holds the mantissa text for Threshold starting threshold scientific input.
  const [thresholdStartMantissaInput, setThresholdStartMantissaInput] = useState("0");
  // Holds the exponent text for Threshold starting threshold scientific input.
  const [thresholdStartExponentInput, setThresholdStartExponentInput] = useState("0");
  // Holds the mantissa text for Threshold force offset scientific input.
  const [thresholdForceOffsetMantissaInput, setThresholdForceOffsetMantissaInput] = useState("0");
  // Holds the exponent text for Threshold force offset scientific input.
  const [thresholdForceOffsetExponentInput, setThresholdForceOffsetExponentInput] = useState("0");
  // Holds the mantissa text for Gof fitwindow scientific input.
  const [gofFitWindowMantissaInput, setGofFitWindowMantissaInput] = useState("0");
  // Holds the exponent text for Gof fitwindow scientific input.
  const [gofFitWindowExponentInput, setGofFitWindowExponentInput] = useState("0");
  // Holds the mantissa text for GofSphere fit_window scientific input.
  const [gofSphereFitWindowMantissaInput, setGofSphereFitWindowMantissaInput] = useState("0");
  // Holds the exponent text for GofSphere fit_window scientific input.
  const [gofSphereFitWindowExponentInput, setGofSphereFitWindowExponentInput] = useState("0");
  // Holds the mantissa text for Rov windowRov scientific input.
  const [rovWindowMantissaInput, setRovWindowMantissaInput] = useState("0");
  // Holds the exponent text for Rov windowRov scientific input.
  const [rovWindowExponentInput, setRovWindowExponentInput] = useState("0");
  // Holds the mantissa text for Rov safe_threshold scientific input.
  const [rovSafeThresholdMantissaInput, setRovSafeThresholdMantissaInput] = useState("0");
  // Holds the exponent text for Rov safe_threshold scientific input.
  const [rovSafeThresholdExponentInput, setRovSafeThresholdExponentInput] = useState("0");
  // Holds the mantissa text for Rov x_range scientific input.
  const [rovXRangeMantissaInput, setRovXRangeMantissaInput] = useState("0");
  // Holds the exponent text for Rov x_range scientific input.
  const [rovXRangeExponentInput, setRovXRangeExponentInput] = useState("0");
  // Holds the mantissa text for StepDrift windowr scientific input.
  const [stepDriftWindowMantissaInput, setStepDriftWindowMantissaInput] = useState("0");
  // Holds the exponent text for StepDrift windowr scientific input.
  const [stepDriftWindowExponentInput, setStepDriftWindowExponentInput] = useState("0");
  // Holds the mantissa text for StepDrift Fthreshold scientific input.
  const [stepDriftThresholdMantissaInput, setStepDriftThresholdMantissaInput] = useState("0");
  // Holds the exponent text for StepDrift Fthreshold scientific input.
  const [stepDriftThresholdExponentInput, setStepDriftThresholdExponentInput] = useState("0");
  // Holds the mantissa text for StepDrift Xrange scientific input.
  const [stepDriftXRangeMantissaInput, setStepDriftXRangeMantissaInput] = useState("0");
  // Holds the exponent text for StepDrift Xrange scientific input.
  const [stepDriftXRangeExponentInput, setStepDriftXRangeExponentInput] = useState("0");
  // Decides whether parameter fields should be rendered inside this card.
  const shouldRenderInlineParameters = type !== "force";

  // Initializes the scientific-notation inputs once when the filter card first mounts
  // (filterName change). Intentionally excludes filterData?.zeroRange so that live
  // user typing never gets overwritten by a circular state update.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "autothresh") return;
    const parsedZeroRange = parseFloat(filterData?.zeroRange);
    const { mantissa, exponent } = normalizeToMantissaExp(
      Number.isFinite(parsedZeroRange) ? parsedZeroRange : 0
    );
    setZeroRangeMantissaInput(mantissa);
    setZeroRangeExponentInput(String(exponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes Threshold scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent live typing overwrite loops.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "threshold") return;
    const parsedStartThreshold = parseFloat(filterData?.starting_threshold);
    const parsedForceOffset = parseFloat(filterData?.force_offset);
    const { mantissa: startMantissa, exponent: startExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedStartThreshold) ? parsedStartThreshold : 0
    );
    const { mantissa: offsetMantissa, exponent: offsetExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedForceOffset) ? parsedForceOffset : 0
    );
    setThresholdStartMantissaInput(startMantissa);
    setThresholdStartExponentInput(String(startExponent));
    setThresholdForceOffsetMantissaInput(offsetMantissa);
    setThresholdForceOffsetExponentInput(String(offsetExponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes Gof fitwindow scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent live typing overwrite loops.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "gof") return;
    const parsedFitWindow = parseFloat(filterData?.fitwindow);
    const { mantissa, exponent } = normalizeToMantissaExp(
      Number.isFinite(parsedFitWindow) ? parsedFitWindow : 0
    );
    setGofFitWindowMantissaInput(mantissa);
    setGofFitWindowExponentInput(String(exponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes GofSphere fit_window scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent live typing overwrite loops.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "gofsphere") return;
    const parsedFitWindow = parseFloat(filterData?.fit_window);
    const { mantissa, exponent } = normalizeToMantissaExp(
      Number.isFinite(parsedFitWindow) ? parsedFitWindow : 0
    );
    setGofSphereFitWindowMantissaInput(mantissa);
    setGofSphereFitWindowExponentInput(String(exponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes Rov scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent live typing overwrite loops.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "rov") return;
    const parsedWindow = parseFloat(filterData?.windowRov);
    const parsedSafeThreshold = parseFloat(filterData?.safe_threshold);
    const parsedXRange = parseFloat(filterData?.x_range);
    const { mantissa: windowMantissa, exponent: windowExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedWindow) ? parsedWindow : 0
    );
    const { mantissa: safeThresholdMantissa, exponent: safeThresholdExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedSafeThreshold) ? parsedSafeThreshold : 0
    );
    const { mantissa: xRangeMantissa, exponent: xRangeExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedXRange) ? parsedXRange : 0
    );
    setRovWindowMantissaInput(windowMantissa);
    setRovWindowExponentInput(String(windowExponent));
    setRovSafeThresholdMantissaInput(safeThresholdMantissa);
    setRovSafeThresholdExponentInput(String(safeThresholdExponent));
    setRovXRangeMantissaInput(xRangeMantissa);
    setRovXRangeExponentInput(String(xRangeExponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes StepDrift scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent live typing overwrite loops.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "stepdrift") return;
    const parsedWindow = parseFloat(filterData?.windowr);
    const parsedThreshold = parseFloat(filterData?.Fthreshold);
    const parsedXRange = parseFloat(filterData?.Xrange);
    const { mantissa: windowMantissa, exponent: windowExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedWindow) ? parsedWindow : 0
    );
    const { mantissa: thresholdMantissa, exponent: thresholdExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedThreshold) ? parsedThreshold : 0
    );
    const { mantissa: xRangeMantissa, exponent: xRangeExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedXRange) ? parsedXRange : 0
    );
    setStepDriftWindowMantissaInput(windowMantissa);
    setStepDriftWindowExponentInput(String(windowExponent));
    setStepDriftThresholdMantissaInput(thresholdMantissa);
    setStepDriftThresholdExponentInput(String(thresholdExponent));
    setStepDriftXRangeMantissaInput(xRangeMantissa);
    setStepDriftXRangeExponentInput(String(xRangeExponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Initializes Hertz max/min scientific inputs once when the card is mounted.
  // Intentionally excludes filterData dependencies to prevent keystroke overwrites.
  useEffect(() => {
    if (filterName?.toLowerCase() !== "hertz") return;
    const parsedMaxInd = parseFloat(filterData?.maxInd);
    const parsedMinInd = parseFloat(filterData?.minInd);
    const { mantissa: maxMantissa, exponent: maxExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedMaxInd) ? parsedMaxInd : 0
    );
    const { mantissa: minMantissa, exponent: minExponent } = normalizeToMantissaExp(
      Number.isFinite(parsedMinInd) ? parsedMinInd : 0
    );
    setHertzMaxIndMantissaInput(maxMantissa);
    setHertzMaxIndExponentInput(String(maxExponent));
    setHertzMinIndMantissaInput(minMantissa);
    setHertzMinIndExponentInput(String(minExponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterName]);

  // Reconstructs zeroRange from mantissa/exponent and forwards it to the shared filter handler.
  const pushAutothreshZeroRangeChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "zeroRange",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Hertz maxInd from mantissa/exponent and forwards it to shared filter handler.
  const pushHertzMaxIndChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "maxInd",
      Math.max(1, Math.round(parsedMantissa * Math.pow(10, parsedExponent))),
      type
    );
  };

  // Reconstructs Hertz minInd from mantissa/exponent and forwards it to shared filter handler.
  const pushHertzMinIndChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "minInd",
      Math.max(0, Math.round(parsedMantissa * Math.pow(10, parsedExponent))),
      type
    );
  };

  // Reconstructs Threshold starting threshold from mantissa/exponent and forwards it to shared handler.
  const pushThresholdStartingThresholdChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "starting_threshold",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Threshold force offset from mantissa/exponent and forwards it to shared handler.
  const pushThresholdForceOffsetChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "force_offset",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Gof fitwindow from mantissa/exponent and forwards it to shared handler.
  const pushGofFitWindowChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "fitwindow",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs GofSphere fit_window from mantissa/exponent and forwards it to shared handler.
  const pushGofSphereFitWindowChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "fit_window",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Rov windowRov from mantissa/exponent and forwards it to shared handler.
  const pushRovWindowChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "windowRov",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Rov safe_threshold from mantissa/exponent and forwards it to shared handler.
  const pushRovSafeThresholdChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "safe_threshold",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs Rov x_range from mantissa/exponent and forwards it to shared handler.
  const pushRovXRangeChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "x_range",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs StepDrift windowr from mantissa/exponent and forwards it to shared handler.
  const pushStepDriftWindowChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "windowr",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs StepDrift Fthreshold from mantissa/exponent and forwards it to shared handler.
  const pushStepDriftThresholdChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "Fthreshold",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  // Reconstructs StepDrift Xrange from mantissa/exponent and forwards it to shared handler.
  const pushStepDriftXRangeChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;

    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) {
      return;
    }

    handleFilterChange(
      filterName,
      "Xrange",
      parsedMantissa * Math.pow(10, parsedExponent),
      type
    );
  };

  return (
    <Card sx={cardSx}>
      <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
          <Typography variant="subtitle2" sx={sectionLabelSx(color)}>
            {capitalizeFilterName(filterName)}
          </Typography>
          <Tooltip title="Remove Filter">
            <IconButton
              size="small"
              color="error"
              onClick={() => handleRemoveFilter(filterName, type)}
              aria-label={`Remove ${capitalizeFilterName(filterName)} filter`}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        {shouldRenderInlineParameters &&
          Object.keys(filterData || {}).map((param) => {
          // Flags the autothresh zeroRange parameter so it uses split scientific notation inputs.
          const isAutothreshZeroRange =
            filterName?.toLowerCase() === "autothresh" && param === "zeroRange";
          // Flags Hertz max/min indentation parameters so they use split scientific notation inputs.
          const isHertzMaxInd =
            filterName?.toLowerCase() === "hertz" && param?.toLowerCase() === "maxind";
          // Flags Hertz max/min indentation parameters so they use split scientific notation inputs.
          const isHertzMinInd =
            filterName?.toLowerCase() === "hertz" && param?.toLowerCase() === "minind";
          // Hides tip_radius input for Hertz because runtime metadata provides tip radius per curve.
          const isHiddenHertzTipRadius =
            filterName?.toLowerCase() === "hertz" && param?.toLowerCase() === "tip_radius";
          // Flags Threshold starting threshold parameter so it uses split scientific notation inputs.
          const isThresholdStartingThreshold =
            filterName?.toLowerCase() === "threshold" && param === "starting_threshold";
          // Flags Threshold force offset parameter so it uses split scientific notation inputs.
          const isThresholdForceOffset =
            filterName?.toLowerCase() === "threshold" && param === "force_offset";
          // Flags Threshold min_x so min/max are edited in one combined percent range row.
          const isThresholdRange =
            filterName?.toLowerCase() === "threshold" && param === "min_x";
          // Hides Threshold max_x because it is edited in the min_x combined range row.
          const isHiddenThresholdMaxX =
            filterName?.toLowerCase() === "threshold" && param === "max_x";
          // Flags Gof fitwindow parameter so it uses split scientific notation inputs.
          const isGofFitWindow =
            filterName?.toLowerCase() === "gof" && param === "fitwindow";
          // Flags Gof minx parameter so it renders with explicit percent unit.
          const isGofMinX =
            filterName?.toLowerCase() === "gof" && param === "minx";
          // Flags Gof maxf parameter so it renders with explicit percent unit.
          const isGofMaxF =
            filterName?.toLowerCase() === "gof" && param === "maxf";
          // Flags GofSphere fit_window parameter so it uses split scientific notation inputs.
          const isGofSphereFitWindow =
            filterName?.toLowerCase() === "gofsphere" && param === "fit_window";
          // Flags GofSphere x_range parameter so it renders with explicit nm unit.
          const isGofSphereXRange =
            filterName?.toLowerCase() === "gofsphere" && param === "x_range";
          // Flags GofSphere force_threshold parameter so it renders with explicit nN unit.
          const isGofSphereForceThreshold =
            filterName?.toLowerCase() === "gofsphere" && param === "force_threshold";
          // Flags Rov windowRov parameter so it uses split scientific notation inputs.
          const isRovWindow =
            filterName?.toLowerCase() === "rov" && param === "windowRov";
          // Flags Rov safe_threshold parameter so it renders with explicit nN unit.
          const isRovSafeThreshold =
            filterName?.toLowerCase() === "rov" && param === "safe_threshold";
          // Flags Rov x_range parameter so it renders with explicit nm unit.
          const isRovXRange =
            filterName?.toLowerCase() === "rov" && param === "x_range";
          // Flags StepDrift windowr parameter so it uses split scientific notation inputs.
          const isStepDriftWindow =
            filterName?.toLowerCase() === "stepdrift" && param === "windowr";
          // Flags StepDrift Fthreshold parameter so it renders with explicit nN unit.
          const isStepDriftThreshold =
            filterName?.toLowerCase() === "stepdrift" && param === "Fthreshold";
          // Flags StepDrift Xrange parameter so it renders with explicit nm unit.
          const isStepDriftXRange =
            filterName?.toLowerCase() === "stepdrift" && param === "Xrange";
          // Stores the tooltip text for the current parameter label.
          const paramTooltip =
            isThresholdRange
              ? parameterTooltipByFilter?.threshold?.min_x
              : parameterTooltipByFilter?.[filterName?.toLowerCase()]?.[param];
          // Resolves the measurement unit for this parameter (nm, N, %, etc.).
          const paramUnit = isThresholdRange
            ? "%"
            : getParameterUnit(filterName, param);
          // Stores the displayed parameter label, including combined range row labels.
          const baseParamLabel = isThresholdRange
            ? "min_x / max_x"
            : param.replace(/_/g, " ");
          const displayedParamLabel = formatParameterLabel(baseParamLabel, paramUnit);

          if (isHiddenHertzTipRadius || isHiddenThresholdMaxX) {
            return null;
          }

          return (
            <Box key={param} sx={{ mt: 0.5 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="caption" sx={captionSx}>
                  {displayedParamLabel}
                </Typography>
                {paramTooltip ? (
                  <Tooltip title={paramTooltip}>
                    <InfoOutlined
                      sx={{ fontSize: 14, color: "text.secondary", cursor: "help", mb: 0.2 }}
                    />
                  </Tooltip>
                ) : null}
              </Box>
              {isAutothreshZeroRange ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={zeroRangeMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setZeroRangeMantissaInput(nextMantissa);
                      pushAutothreshZeroRangeChange(nextMantissa, zeroRangeExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={zeroRangeExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setZeroRangeExponentInput(nextExponent);
                      pushAutothreshZeroRangeChange(zeroRangeMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isHertzMaxInd ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={hertzMaxIndMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setHertzMaxIndMantissaInput(nextMantissa);
                      pushHertzMaxIndChange(nextMantissa, hertzMaxIndExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={hertzMaxIndExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setHertzMaxIndExponentInput(nextExponent);
                      pushHertzMaxIndChange(hertzMaxIndMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isHertzMinInd ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={hertzMinIndMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setHertzMinIndMantissaInput(nextMantissa);
                      pushHertzMinIndChange(nextMantissa, hertzMinIndExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={hertzMinIndExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setHertzMinIndExponentInput(nextExponent);
                      pushHertzMinIndChange(hertzMinIndMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isThresholdStartingThreshold ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={thresholdStartMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setThresholdStartMantissaInput(nextMantissa);
                      pushThresholdStartingThresholdChange(nextMantissa, thresholdStartExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={thresholdStartExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setThresholdStartExponentInput(nextExponent);
                      pushThresholdStartingThresholdChange(thresholdStartMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nN
                  </Typography>
                </Box>
              ) : isThresholdRange ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={filterData?.min_x ?? ""}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        "min_x",
                        parseFloat(e.target.value),
                        type
                      )
                    }
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 90, mt: 0 }}
                  />
                  <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "nowrap" }}>
                    to
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={filterData?.max_x ?? ""}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        "max_x",
                        parseFloat(e.target.value),
                        type
                      )
                    }
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 90, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    %
                  </Typography>
                </Box>
              ) : isThresholdForceOffset ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={thresholdForceOffsetMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setThresholdForceOffsetMantissaInput(nextMantissa);
                      pushThresholdForceOffsetChange(nextMantissa, thresholdForceOffsetExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={thresholdForceOffsetExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setThresholdForceOffsetExponentInput(nextExponent);
                      pushThresholdForceOffsetChange(thresholdForceOffsetMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    pN
                  </Typography>
                </Box>
              ) : isGofFitWindow ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={gofFitWindowMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setGofFitWindowMantissaInput(nextMantissa);
                      pushGofFitWindowChange(nextMantissa, gofFitWindowExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={gofFitWindowExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setGofFitWindowExponentInput(nextExponent);
                      pushGofFitWindowChange(gofFitWindowMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isGofMinX || isGofMaxF ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={filterData[param] ?? ""}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        param,
                        parseFloat(e.target.value),
                        type
                      )
                    }
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 110 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    %
                  </Typography>
                </Box>
              ) : isGofSphereFitWindow ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={gofSphereFitWindowMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setGofSphereFitWindowMantissaInput(nextMantissa);
                      pushGofSphereFitWindowChange(nextMantissa, gofSphereFitWindowExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={gofSphereFitWindowExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setGofSphereFitWindowExponentInput(nextExponent);
                      pushGofSphereFitWindowChange(gofSphereFitWindowMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isGofSphereXRange || isGofSphereForceThreshold ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={filterData[param] ?? ""}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        param,
                        parseFloat(e.target.value),
                        type
                      )
                    }
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 110 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    {isGofSphereXRange ? "nm" : "nN"}
                  </Typography>
                </Box>
              ) : isRovWindow ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovWindowMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setRovWindowMantissaInput(nextMantissa);
                      pushRovWindowChange(nextMantissa, rovWindowExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovWindowExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setRovWindowExponentInput(nextExponent);
                      pushRovWindowChange(rovWindowMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isRovSafeThreshold ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovSafeThresholdMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setRovSafeThresholdMantissaInput(nextMantissa);
                      pushRovSafeThresholdChange(nextMantissa, rovSafeThresholdExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovSafeThresholdExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setRovSafeThresholdExponentInput(nextExponent);
                      pushRovSafeThresholdChange(rovSafeThresholdMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nN
                  </Typography>
                </Box>
              ) : isRovXRange ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovXRangeMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setRovXRangeMantissaInput(nextMantissa);
                      pushRovXRangeChange(nextMantissa, rovXRangeExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={rovXRangeExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setRovXRangeExponentInput(nextExponent);
                      pushRovXRangeChange(rovXRangeMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isStepDriftWindow ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftWindowMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setStepDriftWindowMantissaInput(nextMantissa);
                      pushStepDriftWindowChange(nextMantissa, stepDriftWindowExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftWindowExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setStepDriftWindowExponentInput(nextExponent);
                      pushStepDriftWindowChange(stepDriftWindowMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : isStepDriftThreshold ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftThresholdMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setStepDriftThresholdMantissaInput(nextMantissa);
                      pushStepDriftThresholdChange(nextMantissa, stepDriftThresholdExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftThresholdExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setStepDriftThresholdExponentInput(nextExponent);
                      pushStepDriftThresholdChange(stepDriftThresholdMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nN
                  </Typography>
                </Box>
              ) : isStepDriftXRange ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftXRangeMantissaInput}
                    onChange={(e) => {
                      const nextMantissa = e.target.value;
                      setStepDriftXRangeMantissaInput(nextMantissa);
                      pushStepDriftXRangeChange(nextMantissa, stepDriftXRangeExponentInput);
                    }}
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    x 10
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={stepDriftXRangeExponentInput}
                    onChange={(e) => {
                      const nextExponent = e.target.value;
                      setStepDriftXRangeExponentInput(nextExponent);
                      pushStepDriftXRangeChange(stepDriftXRangeMantissaInput, nextExponent);
                    }}
                    inputProps={{ step: 1 }}
                    sx={{
                      ...inputCompactSx,
                      width: 56,
                      mt: 0,
                      alignSelf: "flex-start",
                      "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                    }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    nm
                  </Typography>
                </Box>
              ) : paramUnit ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={filterData[param] ?? ""}
                    onChange={(e) =>
                      handleFilterChange(
                        filterName,
                        param,
                        parseFloat(e.target.value),
                        type
                      )
                    }
                    inputProps={{ step: "any" }}
                    sx={{ ...inputCompactSx, flex: 1 }}
                  />
                  <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                    {paramUnit}
                  </Typography>
                </Box>
              ) : (
                <TextField
                  type="number"
                  size="small"
                  margin="dense"
                  value={filterData[param] ?? ""}
                  onChange={(e) =>
                    handleFilterChange(
                      filterName,
                      param,
                      parseFloat(e.target.value),
                      type
                    )
                  }
                  fullWidth
                  sx={inputCompactSx}
                />
              )}
            </Box>
          );
          })}
      </CardContent>
    </Card>
  );
};

const FilterStatusSidebar = ({
  regularFilters,
  cpFilters,
  forceModels,
  elasticityModels,
  capitalizeFilterName,
  handleRemoveFilter,
  handleFilterChange,
  selectedForceModel,
  selectedParameters,
  onParameterChange,
  showParameters,
  setShowParameters,
  selectedElasticityModel,
  selectedElasticityParameters,
  onElasticityParameterChange,
  showElasticityParameters,
  setShowElasticityParameters,
  setZeroForce,
  onSetZeroForceChange,
  activeTab,
  canUseModels,
  elasticityParams,
  onElasticityParamsChange,
  forceModelParams,
  onForceModelParamsChange,
  elasticModelParams,
  onElasticModelParamsChange,
  open,
  onToggle,
  fparamsProgress,
  eparamsProgress,
  onApplyChangesShortcut
}) => {
  // Define parameter options for each force model
  const getParameterOptions = (forceModel) => {
    switch (forceModel) {
      case "hertz":
        return ["E[Pa]"];
      case "hertzeffective":
        return ["E[Pa]"];
      case "driftedhertz":
        return ["E[Pa]", "m[N/m]"];
      default:
        return [];
    }
  };

  // Define parameter options for each elasticity model
  const getElasticityParameterOptions = (elasticityModel) => {
    switch (elasticityModel) {
      case "linemax":
        return ["E[Pa]", "M<E>[Pa]", "Emax[Pa]", "Emin"];
      case "bilayer":
        return ["E0[Pa]", "Eb[Pa]", "d[nm]"];
      case "constant":
        return ["E[Pa]"];
      case "sigmoid":
        return ["EH[Pa]", "EL[Pa]", "T[nm]", "k[Pa/nm]"];
      default:
        return [];
    }
  };

  const parameterOptions = getParameterOptions(selectedForceModel);
  const elasticityParameterOptions = getElasticityParameterOptions(selectedElasticityModel);

  // Theme and media query to determine drawer variant based on screen size
  const theme = useTheme();
  const isMdUp = useMediaQuery(theme.breakpoints.up("md"));
  // Use persistent variant on desktop (md+) to push content, temporary on mobile for overlay
  const variant = isMdUp ? "persistent" : "temporary";

  // Debug logging
  // console.log("selectedElasticityModel:", selectedElasticityModel);
  // console.log("elasticityParameterOptions:", elasticityParameterOptions);
  const modelStats = useDashboardStore((s) => s.modelStats);
  // Stores the mantissa text for Hertz max indentation scientific-notation input.
  const [hertzMaxIndMantissaInput, setHertzMaxIndMantissaInput] = useState("0");
  // Stores the exponent text for Hertz max indentation scientific-notation input.
  const [hertzMaxIndExponentInput, setHertzMaxIndExponentInput] = useState("0");
  // Stores the mantissa text for Hertz min indentation scientific-notation input.
  const [hertzMinIndMantissaInput, setHertzMinIndMantissaInput] = useState("0");
  // Stores the exponent text for Hertz min indentation scientific-notation input.
  const [hertzMinIndExponentInput, setHertzMinIndExponentInput] = useState("0");

  // Initializes Hertz max/min scientific-notation fields when the Hertz model is selected.
  // Intentionally avoids forceModelParams dependencies so live user typing is not overwritten
  // by the normalization effect during each keystroke.
  useEffect(() => {
    if (selectedForceModel !== "hertz") return;
    const { mantissa: maxMantissa, exponent: maxExponent } = normalizeToMantissaExp(
      Number(forceModelParams?.maxInd ?? 0)
    );
    const { mantissa: minMantissa, exponent: minExponent } = normalizeToMantissaExp(
      Number(forceModelParams?.minInd ?? 0)
    );
    setHertzMaxIndMantissaInput(maxMantissa);
    setHertzMaxIndExponentInput(String(maxExponent));
    setHertzMinIndMantissaInput(minMantissa);
    setHertzMinIndExponentInput(String(minExponent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedForceModel]);

  // Reconstructs Hertz max indentation from mantissa and exponent and persists it as integer nanometers.
  const pushHertzMaxIndChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;
    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) return;
    const resolvedValue = Math.max(
      1,
      Math.round(parsedMantissa * Math.pow(10, parsedExponent))
    );
    onForceModelParamsChange({ ...forceModelParams, maxInd: resolvedValue });
  };

  // Reconstructs Hertz min indentation from mantissa and exponent and persists it as integer nanometers.
  const pushHertzMinIndChange = (nextMantissa, nextExponent) => {
    const parsedMantissa = parseFloat(nextMantissa);
    const parsedExponent =
      nextExponent.trim() !== "" ? parseInt(nextExponent, 10) : 0;
    if (!Number.isFinite(parsedMantissa) || !Number.isFinite(parsedExponent)) return;
    const resolvedValue = Math.max(
      0,
      Math.round(parsedMantissa * Math.pow(10, parsedExponent))
    );
    onForceModelParamsChange({ ...forceModelParams, minInd: resolvedValue });
  };

  const handleParameterChange = (parameter) => {
    const newSelectedParams = selectedParameters.includes(parameter)
      ? selectedParameters.filter(p => p !== parameter)
      : [...selectedParameters, parameter];
    
    onParameterChange(newSelectedParams);
  };

  const handleElasticityParameterChange = (parameter) => {
    // For elasticity models, allow multiple parameter selection like force models
    const newSelectedParams = selectedElasticityParameters.includes(parameter)
      ? selectedElasticityParameters.filter(p => p !== parameter)
      : [...selectedElasticityParameters, parameter];
    
    onElasticityParameterChange(newSelectedParams);
  };

  // Check if any filters are applied or if view parameters should be shown
  const hasFilters =
    Object.keys(regularFilters || {}).length > 0 ||
    Object.keys(cpFilters || {}).length > 0 ||
    Object.keys(forceModels || {}).length > 0 ||
    Object.keys(elasticityModels || {}).length > 0 ||
    selectedForceModel ||
    selectedElasticityModel;

  // Detects Enter on sidebar input fields and applies updates like the main update button.
  const handleSidebarInputEnter = useCallback(
    (event) => {
      // Skips hotkey handling while an IME composition is still in progress.
      if (event?.nativeEvent?.isComposing) {
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      // Restricts the shortcut to direct input editing interactions.
      const targetTagName = event?.target?.tagName?.toUpperCase?.() || "";
      const isInputField = targetTagName === "INPUT" || targetTagName === "TEXTAREA";
      if (!isInputField) {
        return;
      }
      // Ignores modifier key combos so only plain Enter triggers the update action.
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      event.preventDefault();
      if (typeof onApplyChangesShortcut === "function") {
        onApplyChangesShortcut();
      }
    },
    [onApplyChangesShortcut]
  );

  return (
    <Fade in={open}>
      <Drawer
        anchor="right"
        variant={variant}
        open={open}
        onClose={onToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": sidebarPaperSx,
          // Keep drawer below app bar on desktop, use default drawer z-index on mobile
          zIndex: (t) => (isMdUp ? t.zIndex.appBar - 1 : t.zIndex.drawer),
        }}
      >
        {/* Header */}
        <Box sx={headerBarSx}>
          <Typography variant="h6" sx={titleSx}>
            Applied Filters & Parameters
          </Typography>
          <Tooltip title="Close">
            <IconButton size="small" color="error" onClick={onToggle} {...closeBtnHandlers}>
              <Close fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Scrollable content */}
        <Box
          sx={{ flex: 1, overflowY: "auto", px: 1.25, pb: 1.25 }}
          onKeyDownCapture={handleSidebarInputEnter}
        >
        
      {/* Elasticity Spectra Tab - Show elastic model params and elasticity params */}
      {activeTab === "elasticitySpectra" && (
        <>
          {/* Elastic Model Parameters - Show when elastic model is chosen AND in single-curve mode */}
          {canUseModels && selectedElasticityModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
                <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                  Elastic Model Parameters
                </Typography>

                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 0.5 }}>
                  <Box>
                    <Typography variant="caption" sx={captionSx}>Max Ind [nm]</Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={elasticModelParams.maxInd}
                      onChange={(e) => onElasticModelParamsChange({ ...elasticModelParams, maxInd: parseInt(e.target.value) || 800 })}
                      inputProps={{ min: 1, max: 2000 }}
                      fullWidth
                      sx={inputCompactSx}
                    />
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={captionSx}>Min Ind [nm]</Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={elasticModelParams.minInd}
                      onChange={(e) => onElasticModelParamsChange({ ...elasticModelParams, minInd: parseInt(e.target.value) || 0 })}
                      inputProps={{ min: 0, max: 1000 }}
                      fullWidth
                      sx={inputCompactSx}
                    />
                  </Box>
                  
                </Box>
                <ComputedResults
                  title="Elastic Model Results"
                  stats={modelStats.elasticity}
                />

              </CardContent>
            </Card>
          )}
          
          {/* Elasticity Parameters - Always show on elasticity spectra tab */}
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Elasticity Parameters
              </Typography>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={elasticityParams.interpolate}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, interpolate: e.target.checked })}
                    size="small"
                  />
                }
                label={<Typography variant="caption" sx={{ fontSize: 12, whiteSpace: "nowrap" }}>Interpolate</Typography>}
                sx={{ mb: 0.5 }}
              />

              {/* 2-column grid: Order/Window */}
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mt: 0.5 }}>
                <Box>
                  <Typography variant="caption" sx={captionSx}>Order</Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={elasticityParams.order}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, order: parseInt(e.target.value) || 2 })}
                    inputProps={{ min: 1, max: 9 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                </Box>

                <Box>
                  <Typography variant="caption" sx={captionSx}>Window</Typography>
                  <TextField
                    type="number"
                    size="small"
                    margin="dense"
                    value={elasticityParams.window}
                    onChange={(e) => onElasticityParamsChange({ ...elasticityParams, window: parseInt(e.target.value) || 61 })}
                    inputProps={{ min: 11, max: 201, step: 2 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
        
        {/* Force Model Parameters - Show when force model is chosen (not on elasticity spectra tab) AND in single-curve mode */}
        {activeTab !== "elasticitySpectra" && canUseModels && selectedForceModel && (
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Force Model Parameters
              </Typography>
              
              {/* Max Indentation Input */}
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={captionSx}>Max Ind</Typography>
                {selectedForceModel === "hertz" ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={hertzMaxIndMantissaInput}
                      onChange={(e) => {
                        const nextMantissa = e.target.value;
                        setHertzMaxIndMantissaInput(nextMantissa);
                        pushHertzMaxIndChange(nextMantissa, hertzMaxIndExponentInput);
                      }}
                      inputProps={{ step: "any" }}
                      sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                    />
                    <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      x 10
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={hertzMaxIndExponentInput}
                      onChange={(e) => {
                        const nextExponent = e.target.value;
                        setHertzMaxIndExponentInput(nextExponent);
                        pushHertzMaxIndChange(hertzMaxIndMantissaInput, nextExponent);
                      }}
                      inputProps={{ step: 1 }}
                      sx={{
                        ...inputCompactSx,
                        width: 56,
                        mt: 0,
                        alignSelf: "flex-start",
                        "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                      }}
                    />
                    <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      nm
                    </Typography>
                  </Box>
                ) : (
                  <TextField
                    type="number"
                    value={forceModelParams.maxInd}
                    onChange={(e) => onForceModelParamsChange({...forceModelParams, maxInd: parseInt(e.target.value) || 800})}
                    size="small"
                    margin="dense"
                    inputProps={{ min: 1, max: 2000 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                )}
              </Box>
              
              {/* Min Indentation Input */}
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={captionSx}>Min Ind</Typography>
                {selectedForceModel === "hertz" ? (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={hertzMinIndMantissaInput}
                      onChange={(e) => {
                        const nextMantissa = e.target.value;
                        setHertzMinIndMantissaInput(nextMantissa);
                        pushHertzMinIndChange(nextMantissa, hertzMinIndExponentInput);
                      }}
                      inputProps={{ step: "any" }}
                      sx={{ ...inputCompactSx, width: 96, mt: 0 }}
                    />
                    <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      x 10
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      margin="dense"
                      value={hertzMinIndExponentInput}
                      onChange={(e) => {
                        const nextExponent = e.target.value;
                        setHertzMinIndExponentInput(nextExponent);
                        pushHertzMinIndChange(hertzMinIndMantissaInput, nextExponent);
                      }}
                      inputProps={{ step: 1 }}
                      sx={{
                        ...inputCompactSx,
                        width: 56,
                        mt: 0,
                        alignSelf: "flex-start",
                        "& input": { textAlign: "center", fontSize: 12, padding: "4px 6px" },
                      }}
                    />
                    <Typography variant="body2" sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
                      nm
                    </Typography>
                  </Box>
                ) : (
                  <TextField
                    type="number"
                    value={forceModelParams.minInd}
                    onChange={(e) => onForceModelParamsChange({...forceModelParams, minInd: parseInt(e.target.value) || 0})}
                    size="small"
                    margin="dense"
                    inputProps={{ min: 0, max: 1000 }}
                    fullWidth
                    sx={inputCompactSx}
                  />
                )}
              </Box>
              
              {/* Young's Modulus Info - Show for any force model */}
              <ComputedResults
                title="Force Model Results"
                stats={modelStats.force}
              />

              {/* Poisson Ratio Slider - Only show for Hertz and DriftedHertz models */}
              {(selectedForceModel === "hertz" || selectedForceModel === "driftedhertz") && (
                <Box sx={{ mt: 0.75 }}>
                  <Typography variant="caption" sx={captionSx}>Poisson ratio</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Slider
                      value={forceModelParams.poisson}
                      onChange={(e, value) => onForceModelParamsChange({...forceModelParams, poisson: value})}
                      min={-1}
                      max={0.5}
                      step={0.01}
                      size="small"
                      sx={sliderSx}
                    />
                    <Typography variant="caption" sx={{ fontSize: 11, color: "#3DA58A", fontWeight: 700, minWidth: 44, textAlign: "right" }}>
                      {forceModelParams.poisson.toFixed(3)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        )}
        
        {/* Set Zero Force Checkbox - Show when contact point filters are chosen (not on elasticity spectra tab) */}
        {activeTab !== "elasticitySpectra" && Object.keys(cpFilters || {}).length > 0 && (
            <Card sx={cardSx}>
            <CardContent sx={{ p: 1, "&:last-child": { pb: 1 } }}>
              <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                Set Zero Force
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={setZeroForce}
                    onChange={(e) => onSetZeroForceChange(e.target.checked)}
                    size="small"
                  />
                }
                label={
                  <Typography variant="caption" sx={{ fontSize: 12 }}>
                    Zero force at contact point
                  </Typography>
                }
              />
            </CardContent>
          </Card>
        )}
        
        <Stack direction="column" spacing={1}>
          {/* Stiffness (K) Results — pinned to the top; only shown when LinearWindowFit is an active Regular filter */}
          {Object.prototype.hasOwnProperty.call(regularFilters || {}, "linearwindowfit") && (
            <>
              <ComputedResults
                title="Stiffness Results"
                stats={modelStats.stiffness}
                emphasizeLabel
              />
              {/* Individual curve breakdown (Young's modulus / K) — commented out;
                  aggregate mean ± std above is shown instead.
              {Array.isArray(modelStats.stiffnessByCurve) &&
                modelStats.stiffnessByCurve.length === 1 && (
                  <Box
                    sx={{
                      mt: 0.5,
                      px: 0.5,
                      maxHeight: 160,
                      overflowY: "auto",
                      minWidth: 0,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "#6b7280",
                        display: "block",
                        mb: 0.5,
                      }}
                    >
                      Per chosen curve ({modelStats.stiffnessByCurve.length})
                    </Typography>
                    {modelStats.stiffnessByCurve.map((row) => {
                      // Stores the display label for this LinearWindowFit row (e.g. "curve3").
                      const curveLabel = row?.curve_id ?? "—";
                      // Formats k_raw for the per-curve list; blank when the fit failed.
                      const kRaw =
                        row?.k_n_per_m != null && Number.isFinite(Number(row.k_n_per_m))
                          ? `${Number(row.k_n_per_m).toPrecision(4)} N/m`
                          : "—";
                      // Formats compliance-corrected k_contact when compute_derived succeeded.
                      const kContact =
                        row?.k_contact != null && Number.isFinite(Number(row.k_contact))
                          ? `${Number(row.k_contact).toPrecision(4)} N/m`
                          : null;
                      // Formats Young's modulus E when tip/spring metadata allowed the estimate.
                      const youngs =
                        row?.youngs_modulus_pa != null &&
                        Number.isFinite(Number(row.youngs_modulus_pa))
                          ? `${Number(row.youngs_modulus_pa).toPrecision(4)} Pa`
                          : null;
                      return (
                        <Box
                          key={String(curveLabel)}
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.15,
                            mb: 0.6,
                            pb: 0.4,
                            borderBottom: "1px dashed #e5e7eb",
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{ fontSize: 11, fontWeight: 700, color: "#111827" }}
                          >
                            {curveLabel}
                          </Typography>
                          <Typography variant="caption" sx={{ fontSize: 10, color: "#374151" }}>
                            K_raw {kRaw}
                            {kContact != null ? ` · K_c ${kContact}` : ""}
                            {youngs != null ? ` · E ${youngs}` : ""}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              */}
            </>
          )}

          {/* View Force Parameters - Only show on forceIndentation tab AND in single-curve mode */}
          {activeTab === "forceIndentation" && canUseModels && selectedForceModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionLabelSx("#3DA58A")}>
                    {selectedForceModel ? `View ${selectedForceModel.charAt(0).toUpperCase() + selectedForceModel.slice(1)} Parameters` : "View Force Parameters"}
                  </Typography>
                  <Checkbox
                    checked={showParameters}
                    onChange={(e) => setShowParameters(e.target.checked)}
                    size="small"
                  />
                </Box>
                {showParameters && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {parameterOptions.length > 0 ? (
                      parameterOptions.map((parameter) => (
                        <FormControlLabel
                          key={parameter}
                          control={
                            <Checkbox
                              checked={selectedParameters.includes(parameter)}
                              onChange={() => handleParameterChange(parameter)}
                              size="small"
                              sx={{ padding: "2px" }}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {parameter}
                            </Typography>
                          }
                          sx={{ margin: "0", padding: "2px" }}
                        />
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "12px",
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        No parameters available for this force model
                      </Typography>
                    )}
                  </Box>
                )}
                
                {/* Progress Indicator */}
                {showParameters && fparamsProgress && fparamsProgress.isLoading && (
                  <Box sx={{ mt: 1.5, px: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <CircularProgress size={16} sx={{ color: "#3DA58A" }} />
                      <Typography variant="caption" sx={{ fontSize: 11, color: "#3DA58A", fontWeight: 600 }}>
                        {fparamsProgress.phase || "Loading..."}
                      </Typography>
                    </Box>
                    {fparamsProgress.total > 0 && (
                      <>
                        <LinearProgress 
                          variant="determinate" 
                          value={(fparamsProgress.done / fparamsProgress.total) * 100}
                          sx={{ 
                            height: 6, 
                            borderRadius: 3,
                            backgroundColor: "#E0E0E0",
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: "#3DA58A"
                            }
                          }}
                        />
                        <Typography variant="caption" sx={{ fontSize: 10, color: "#666", mt: 0.5, display: "block" }}>
                          {fparamsProgress.done} / {fparamsProgress.total} curves
                          {fparamsProgress.totalBatches > 0 && ` • Batch ${fparamsProgress.currentBatch}/${fparamsProgress.totalBatches}`}
                        </Typography>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* View Elasticity Parameters - Only show on elasticitySpectra tab AND in single-curve mode */}
          {activeTab === "elasticitySpectra" && canUseModels && selectedElasticityModel && (
            <Card sx={cardSx}>
              <CardContent sx={{ p: 1 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={sectionLabelSx("#FF9800")}>
                    {selectedElasticityModel ? `View ${selectedElasticityModel.charAt(0).toUpperCase() + selectedElasticityModel.slice(1)} Parameters` : "View Elasticity Parameters"}
                  </Typography>
                  <Checkbox
                    checked={showElasticityParameters}
                    onChange={(e) => setShowElasticityParameters(e.target.checked)}
                    size="small"
                  />
                </Box>
                {showElasticityParameters && (
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {elasticityParameterOptions.length > 0 ? (
                      elasticityParameterOptions.map((parameter) => (
                        <FormControlLabel
                          key={parameter}
                          control={
                            <Checkbox
                              checked={selectedElasticityParameters.includes(parameter)}
                              onChange={() => handleElasticityParameterChange(parameter)}
                              size="small"
                              sx={{ padding: "2px" }}
                            />
                          }
                          label={
                            <Typography
                              variant="body2"
                              sx={{
                                fontSize: "12px",
                                color: "#555",
                              }}
                            >
                              {parameter}
                            </Typography>
                          }
                          sx={{ margin: "0", padding: "2px" }}
                        />
                      ))
                    ) : (
                      <Typography
                        variant="body2"
                        sx={{
                          fontSize: "12px",
                          color: "#999",
                          fontStyle: "italic",
                        }}
                      >
                        No parameters available for this elasticity model
                      </Typography>
                    )}
                  </Box>
                )}
                
                {/* Elasticity loading indicator (mirrors Force, now with determinate bar) */}
                {showElasticityParameters && eparamsProgress && eparamsProgress.isLoading && (
                  <Box sx={{ mt: 1.5, px: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                      <CircularProgress size={16} sx={{ color: "#FF9800" }} />
                      <Typography variant="caption" sx={{ fontSize: 11, color: "#FF9800", fontWeight: 600 }}>
                        {eparamsProgress.phase || "Loading..."}
                      </Typography>
                    </Box>
                    {eparamsProgress.total > 0 && (
                      <>
                        <LinearProgress
                          variant="determinate"
                          value={(eparamsProgress.done / eparamsProgress.total) * 100}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#FFE0B2",
                            "& .MuiLinearProgress-bar": { backgroundColor: "#FF9800" }
                          }}
                        />
                        <Typography variant="caption" sx={{ fontSize: 10, color: "#666", mt: 0.5, display: "block" }}>
                          {eparamsProgress.done} / {eparamsProgress.total} curves
                          {eparamsProgress.totalBatches > 0 && ` • Batch ${eparamsProgress.currentBatch}/${eparamsProgress.totalBatches}`}
                        </Typography>
                      </>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}

          {/* Regular Filters */}
          {Object.keys(regularFilters || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={regularFilters[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="regular"
            />
          ))}

          {/* CP Filters */}
          {Object.keys(cpFilters || {}).map((filterName) => (
            <FilterCard
              key={filterName}
              filterName={filterName}
              filterData={cpFilters[filterName]}
              capitalizeFilterName={capitalizeFilterName}
              handleRemoveFilter={handleRemoveFilter}
              handleFilterChange={handleFilterChange}
              type="cp"
              color="#000000" // Example differentiation
            />
          ))}

          {/* Force Models – only on Force–Indentation tab */}
          {activeTab === "forceIndentation" &&
            Object.keys(forceModels || {}).map((filterName) => (
              <FilterCard
                key={filterName}
                filterName={filterName}
                filterData={forceModels[filterName]}
                capitalizeFilterName={capitalizeFilterName}
                handleRemoveFilter={handleRemoveFilter}
                handleFilterChange={handleFilterChange}
                type="force"
              />
            ))
          }

          {/* Elasticity Models – only on Elasticity Spectra tab */}
          {activeTab === "elasticitySpectra" &&
            Object.keys(elasticityModels || {}).map((filterName) => (
              <FilterCard
                key={filterName}
                filterName={filterName}
                filterData={elasticityModels[filterName]}
                capitalizeFilterName={capitalizeFilterName}
                handleRemoveFilter={handleRemoveFilter}
                handleFilterChange={handleFilterChange}
                type="elasticity"
              />
            ))
          }
        </Stack>

        {/* Info card when models are disabled */}
        {!canUseModels && (
          <Card sx={cardSx}>
            <CardContent sx={{ p: 1 }}>
              <Typography variant="caption" sx={{ fontSize: 11, color: "#777" }}>
                To view model parameters, enter a Curve ID in the controls bar and select a model.
              </Typography>
            </CardContent>
          </Card>
        )}
        </Box>
      </Drawer>
    </Fade>
  );
};

export default FilterStatusSidebar;