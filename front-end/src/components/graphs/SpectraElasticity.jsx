import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ReactECharts from "echarts-for-react";
import echarts from "../../utils/echartsConfig";
import { useUnitPreferences, UNIT_OPTIONS } from "../../context/UnitPreferencesContext";
import {
  CHART_AXIS_NAME_TEXT_STYLE,
  CHART_GRID_BOTTOM,
  CHART_X_AXIS_NAME_GAP,
  CHART_X_DATAZOOM_BOTTOM,
  buildValueAxisTickLabel,
  formatAxisQuantityLabel,
} from "../../utils/chartAxisStyles";

const ElasticitySpectra = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => {},
  onCurveSelect = () => {},
  selectedCurveIds = [],
  graphType = "line",
  onGraphTypeChange = () => {}, // optional, safe default
  isSingleCurveMode = false,
  selectedElasticityModel = "",
}) => {
  const chartRef = useRef(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [hoveredCurveId, setHoveredCurveId] = useState(null);
  const lastNonEmptyDataRef = useRef([]);

  // Unit prefix preferences shared across all graph panels via context
  const { xUnitPrefix, setXUnitPrefix, yUnitPrefix, setYUnitPrefix } = useUnitPreferences();
  // Controls visibility of the X axis unit dropdown (local UI state)
  const [xDropdownOpen, setXDropdownOpen] = useState(false);
  // Controls visibility of the Y axis unit dropdown (local UI state)
  const [yDropdownOpen, setYDropdownOpen] = useState(false);
  // Refs for click-outside detection on each dropdown wrapper
  const xDropdownRef = useRef(null);
  const yDropdownRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Avoid flicker when forceData briefly goes empty by rendering the last non-empty data
  useEffect(() => {
    if (Array.isArray(forceData) && forceData.length > 0) {
      lastNonEmptyDataRef.current = forceData;
    }
  }, [forceData]);

  // Close whichever unit dropdown is open when the user clicks outside its wrapper
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (xDropdownRef.current && !xDropdownRef.current.contains(e.target)) {
        setXDropdownOpen(false);
      }
      if (yDropdownRef.current && !yDropdownRef.current.contains(e.target)) {
        setYDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isMobile = window.innerWidth < 768;
  const headerHeight = isMobile ? 100 : 120;
  const footerHeight = isMobile ? 50 : 0;
  const chartHeight = Math.min(
    Math.max(windowHeight - headerHeight - footerHeight - 300, 300),
    800
  );

  // ---------- Scale helpers ----------
  // Downsample data when there are many curves to improve rendering performance
  const MAX_POINTS_PER_CURVE = 700;
  function downsampleXY(xArr, yArr, maxPoints = MAX_POINTS_PER_CURVE) {
    if (!xArr || !yArr || xArr.length !== yArr.length) return [[], []];
    const n = xArr.length;
    if (n <= maxPoints) return [xArr, yArr];
    const step = Math.ceil(n / maxPoints);
    const xs = [];
    const ys = [];
    for (let i = 0; i < n; i += step) {
      xs.push(xArr[i]);
      ys.push(yArr[i]);
    }
    return [xs, ys];
  }

  // Normalize the render data (use last non-empty to avoid blink)
  const renderForceData = Array.isArray(forceData) && forceData.length > 0
    ? forceData
    : lastNonEmptyDataRef.current;

  // Determine if we should show model overlays (only in single-curve mode with a model selected)
  const showElasticModelOverlay = isSingleCurveMode && selectedElasticityModel;
  
  // Helper: treat "curve1" and "1" as same base; add pairing with "_elastic"
  const isElasticId = (id) => /_elastic$/i.test(id);
  // strip any suffix after first underscore (e.g., _elastic, _hertz, _whatever)
  const baseToken = (id) => {
    const noSuffix = String(id).replace(/_.+$/i, "");   // "curve0_hertz" -> "curve0"
    return noSuffix.replace(/^curve/i, "");             // "curve0" -> "0"
  };

  const isShownWithPartner = useCallback((id, selected) => {
    if (!selected || selected.length === 0) return true;
    const base = baseToken(id);
    // compare by base to be suffix-agnostic AND type-agnostic
    const selectedBases = new Set(
      selected.map((s) => baseToken(String(s)))
    );
    return selectedBases.has(base);
  }, []);

  // Process and normalize force data - memoized to avoid recomputing on every render
  const processedCurves = useMemo(() => {
    if (!Array.isArray(renderForceData)) return [];

    return renderForceData.map((curve) => ({
      ...curve,
      curve_id: curve?.curve_id ? String(curve.curve_id) : "Unknown Curve",
      x: Array.isArray(curve?.x) ? curve.x : [],
      y: Array.isArray(curve?.y) ? curve.y : [],
    }));
  }, [renderForceData]);

  // Keep validForceData for backward compatibility with existing code
  const validForceData = processedCurves;

  // Count unique base curves (excluding elastic model overlays)
  const uniqueCurveCount = useMemo(() => {
    const uniqueIds = new Set();
    validForceData.forEach(c => {
      // Only count curves that are not elastic model overlays
      if (!isElasticId(c.curve_id)) {
        uniqueIds.add(c.curve_id);
      }
    });
    return uniqueIds.size;
  }, [validForceData]);

  // Debug: Log the data to see what we're getting
  // console.log("SpectraElasticity - forceData:", forceData);
  // console.log("SpectraElasticity - validForceData:", validForceData);

  // Resolve active unit option objects from shared context selection
  const xUnitOption = UNIT_OPTIONS.find((o) => o.value === xUnitPrefix);
  const yUnitOption = UNIT_OPTIONS.find((o) => o.value === yUnitPrefix);

  // SI conversion factors driven by the selected prefix (e.g. nano → 1e9, milli → 1e3)
  const xSiFactor = xUnitOption.factor;
  const ySiFactor = yUnitOption.factor;

  // Raw SI value × scaleFactor = graph display value in the selected unit (e.g. µm, µPa)
  const xScaleFactor = xSiFactor;
  const yScaleFactor = ySiFactor;

  // Scaled ranges used to compute required decimal places on tick labels
  const xScaledRange = useMemo(() => (domainRange.xMax - domainRange.xMin) * xScaleFactor, [domainRange.xMax, domainRange.xMin, xScaleFactor]);
  const yScaledRange = useMemo(() => (domainRange.yMax - domainRange.yMin) * yScaleFactor, [domainRange.yMax, domainRange.yMin, yScaleFactor]);

  const xDecimals = useMemo(() =>
    xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0,
    [xScaledRange]
  );
  const yDecimals = useMemo(() =>
    yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0,
    [yScaledRange]
  );
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipXDecimals = Math.max(2, xDecimals);
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipYDecimals = Math.max(2, yDecimals);

  // Y axis base symbol for elastic modulus: prepend selected prefix to "Pa" (e.g. milli → "mPa")
  const yBaseSymbol = yUnitOption.prefix ? `${yUnitOption.prefix}Pa` : "Pa";

  // Axis unit labels use the selected prefix directly (e.g. µm, µPa)
  const xUnit = xUnitOption.xSymbol;
  const yUnit = yBaseSymbol;

  // ---------- Toolbar styles ----------
  const toolbarCardStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
    border: "1px solid #e9ecf5",
    borderRadius: "10px",
    boxShadow: "0 8px 18px rgba(20, 20, 43, 0.06)",
    padding: "10px 12px",
    marginBottom: "8px",
  };
  const leftWrapStyle = { display: "flex", alignItems: "center", gap: "10px" };
  const titleStyle = {
    fontSize: 14,
    fontWeight: 700,
    color: "#1d1e2c",
    whiteSpace: "nowrap",
  };
  const chipStyle = {
    fontSize: 12,
    fontWeight: 700,
    color: "#3DA58A",
    background: "#ECFDF5",
    border: "1px solid #CFFAEA",
    padding: "4px 8px",
    borderRadius: "999px",
  };
  // Clickable unit chip — same visual as static chip but with pointer cursor
  const unitChipStyle = {
    fontSize: 12, fontWeight: 600, color: "#4a4f6a",
    background: "#f5f7ff", border: "1px solid #e9ecf5", padding: "3px 8px", borderRadius: "999px",
    cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", userSelect: "none",
  };

  // Floating dropdown panel positioned below the chip
  const dropdownPanelStyle = {
    position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 200,
    background: "#fff", border: "1px solid #e9ecf5", borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(20,20,43,0.12)", minWidth: "120px", overflow: "hidden",
  };

  // Individual dropdown item; active option highlighted in green
  const dropdownItemStyle = (active) => ({
    display: "block", width: "100%", padding: "8px 14px",
    fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? "#3DA58A" : "#1d1e2c",
    background: active ? "#ECFDF5" : "transparent",
    border: "none", textAlign: "left", cursor: "pointer", transition: "background .1s",
  });
  const segWrapStyle = {
    display: "flex",
    alignItems: "center",
    gap: 0,
    background: "#f2f4ff",
    border: "1px solid #dfe3ff",
    borderRadius: "12px",
    overflow: "hidden",
  };
  const segBtnStyle = (active) => ({
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    background: active ? "#fff" : "transparent",
    color: active ? "#1d1e2c" : "#4a4f6a",
    boxShadow: active ? "inset 0 0 0 1px #cfd6ff" : "none",
    transition: "all .15s ease",
  });
  const actionBtnStyle = {
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: "10px",
    border: "1px solid #e6e9f7",
    background: "#fff",
    color: "#2c2f3a",
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(30, 41, 59, 0.06)",
  };
  const pressable = {
    onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
    onMouseUp: (e) => (e.currentTarget.style.transform = "translateY(0)"),
    onMouseLeave: (e) => (e.currentTarget.style.transform = "translateY(0)"),
  };

  // ---------- Chart config ----------
  const safeMin = (v) => (Number.isFinite(v) ? v : undefined);
  
  // Generate series data - memoized to avoid recomputing point mappings on every render
  // Downsample when there are many curves to improve rendering performance
  const series = useMemo(() => {
    const manySeries = processedCurves.length > 40; // Threshold for downsampling

    return processedCurves.map((curve) => {
      const id = curve.curve_id;
      const elastic = isElasticId(id);
      
      // Only show elastic model overlays when in single-curve mode
      if (elastic && !showElasticModelOverlay) {
        return null;
      }
      
      let x = curve.x;
      let y = curve.y;

      // Downsample when there are many series to improve performance
      if (manySeries) {
        [x, y] = downsampleXY(x, y);
      }
      
      const showCurve =
        isShownWithPartner(id, selectedCurveIds) &&
        Array.isArray(x) &&
        Array.isArray(y) &&
        x.length === y.length;

      // Check hover state
      const isHovered = hoveredCurveId === id;
      const isDimmed = hoveredCurveId !== null && hoveredCurveId !== id;

      // Debug: Log each curve being processed
      // console.log(`SpectraElasticity - Processing curve: ${id}, elastic: ${elastic}, showCurve: ${showCurve}`);

      return {
        name: id,
        type: graphType,
        smooth: false,
        showSymbol: true, // Keep symbol hit targets enabled so item tooltips work in line mode.
        connectNulls: true,
        large: false, // Keep hit detection enabled for reliable hover/click behavior.
        sampling: "lttb", // Extra safety for large data
        triggerEvent: true,
        // keep elastic on top
        z: elastic ? 3 : 2,
        // Only set color for elastic model overlays (yellow), let ECharts auto-assign colors for others
        itemStyle: elastic 
          ? { color: 'yellow', opacity: graphType === "line" ? 0 : (isDimmed ? 0.25 : 1) }
          : { opacity: graphType === "line" ? 0 : (isDimmed ? 0.25 : 1) },
        lineStyle:
          graphType === "line"
            ? elastic 
              ? { color: 'yellow', width: isHovered ? 5 : 4, opacity: isDimmed ? 0.25 : 1 }
              : { width: isHovered ? 3 : 1.5, opacity: isDimmed ? 0.25 : 1 }
            : undefined,
        data: showCurve
          ? x.map((vx, i) => [vx * xScaleFactor, (y[i] ?? 0) * yScaleFactor])
          : [],
      };
    }).filter(Boolean); // Remove null entries
  }, [processedCurves, graphType, selectedCurveIds, xScaleFactor, yScaleFactor, showElasticModelOverlay, hoveredCurveId, isShownWithPartner]);
  
  // Determine if there are too many series for tooltips (performance optimization)
  const tooManySeries = processedCurves.length > 40;

  // Chart options - memoized to avoid recreating the entire config object on every render
  const chartOptions = useMemo(() => ({
    tooltip: tooManySeries
      ? { show: false } // Disable tooltips when there are many curves to improve performance
      : {
          trigger: "item",
          formatter: (params) => {
            const name = params.seriesName || params.name || '';
            const value = Array.isArray(params.value) ? params.value : [params.value];
            const x = value[0];
            const y = value[1];
            if (x == null || y == null || isNaN(x) || isNaN(y)) return '';
            return [
              `<b>${name}</b>`,
              `Z (${xUnit}): ${x.toFixed(tooltipXDecimals)}`,
              `E (${yUnit}): ${y.toFixed(tooltipYDecimals)}`,
            ].join('<br/>');
          },
        },
    xAxis: {
      type: "value",
      name: formatAxisQuantityLabel("Z", 0, xUnitOption.xSymbol),
      nameLocation: "middle",
      nameGap: CHART_X_AXIS_NAME_GAP,
      nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
      min: safeMin(domainRange.xMin * xScaleFactor),
      max: safeMin(domainRange.xMax * xScaleFactor),
      axisLabel: buildValueAxisTickLabel((value) => value.toFixed(xDecimals)),
    },
    yAxis: {
      type: "value",
      name: formatAxisQuantityLabel("E", 0, yBaseSymbol),
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
      scale: true,
      min: safeMin(domainRange.yMin * yScaleFactor),
      max: safeMin(domainRange.yMax * yScaleFactor),
      axisLabel: buildValueAxisTickLabel((value) => value.toFixed(yDecimals)),
    },
    series,
    legend: { show: false },
    grid: { left: "12%", right: "10%", bottom: CHART_GRID_BOTTOM, top: "8%" },
    dataZoom: [
      { type: "slider", xAxisIndex: 0, start: 0, end: 100, height: 20, bottom: CHART_X_DATAZOOM_BOTTOM },
      { type: "slider", yAxisIndex: 0, start: 0, end: 100, width: 20, right: 10 },
      { type: "inside", xAxisIndex: 0, start: 0, end: 100 },
      { type: "inside", yAxisIndex: 0, start: 0, end: 100 },
    ],
    animation: false,
    progressive: 5000,
    }), [tooManySeries, series, xScaleFactor, yScaleFactor, xDecimals, yDecimals, tooltipXDecimals, tooltipYDecimals, xUnit, yUnit, domainRange]);

  const onChartEvents = {
    mouseover: (params) => {
      if (params.componentType === "series") {
        const curveId = params.seriesName || params.name;
        if (curveId) {
          setHoveredCurveId(curveId);
        }
      }
    },
    mouseout: (params) => {
      setHoveredCurveId(null);
    },
    click: (params) => {
      if (params.componentType === "series") {
        const selectedCurve = validForceData[params.seriesIndex];
        if (selectedCurve && selectedCurve.curve_id) {
          setSelectedCurveIds([selectedCurve.curve_id]);
          onCurveSelect?.({
              curve_id: selectedCurve.curve_id,
              x: selectedCurve.x || [],
              y: selectedCurve.y || [],
            });
        }
      }
    },
  };

  // ---------- Render ----------
  return (
    <div style={{ flex: 1, height: "100%" }}>
      {/* Toolbar */}
      <div style={toolbarCardStyle}>
        <div style={leftWrapStyle}>
          <div style={titleStyle}>Elasticity Spectra</div>
          <div style={chipStyle}>{uniqueCurveCount} series</div>

          {/* X axis unit selector */}
          <div ref={xDropdownRef} style={{ position: "relative" }}>
            <button
              style={unitChipStyle}
              onClick={() => { setXDropdownOpen((v) => !v); setYDropdownOpen(false); }}
              title="Change X axis unit"
            >
              X: {xUnit} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {xDropdownOpen && (
              <div style={dropdownPanelStyle}>
                {UNIT_OPTIONS.map((opt) => (
                  <button key={opt.value} style={dropdownItemStyle(xUnitPrefix === opt.value)}
                    onClick={() => { setXUnitPrefix(opt.value); setXDropdownOpen(false); }}>
                    {opt.xSymbol}
                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>({opt.value === "none" ? "SI" : opt.value})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Y axis unit selector — Y axis is elastic modulus (Pa) for this graph */}
          <div ref={yDropdownRef} style={{ position: "relative" }}>
            <button
              style={unitChipStyle}
              onClick={() => { setYDropdownOpen((v) => !v); setXDropdownOpen(false); }}
              title="Change Y axis unit"
            >
              Y: {yUnit} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {yDropdownOpen && (
              <div style={dropdownPanelStyle}>
                {UNIT_OPTIONS.map((opt) => (
                  <button key={opt.value} style={dropdownItemStyle(yUnitPrefix === opt.value)}
                    onClick={() => { setYUnitPrefix(opt.value); setYDropdownOpen(false); }}>
                    {opt.prefix ? `${opt.prefix}Pa` : "Pa"}
                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>({opt.value === "none" ? "SI" : opt.value})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={segWrapStyle}>
            <button
              style={segBtnStyle(graphType === "line")}
              onClick={() => onGraphTypeChange("line")}
              {...pressable}
            >
              Line
            </button>
            <button
              style={segBtnStyle(graphType === "scatter")}
              onClick={() => onGraphTypeChange("scatter")}
              {...pressable}
            >
              Scatter
            </button>
          </div>

          <button
            style={actionBtnStyle}
            onClick={() => {
              const inst = chartRef.current;
              if (!inst) return;
              try {
                inst.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
                inst.dispatchAction({
                  type: "dataZoom",
                  yAxisIndex: 0,
                  start: 0,
                  end: 100,
                });
              } catch {}
            }}
            {...pressable}
          >
            Reset Zoom
          </button>
        </div>
      </div>

      {/* Chart */}
      <ReactECharts
        echarts={echarts}
        ref={chartRef}
        option={chartOptions}
        style={{ height: chartHeight, width: "100%" }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
        onEvents={onChartEvents}
        onChartReady={(inst) => (chartRef.current = inst)}
      />
    </div>
  );
};

export default ElasticitySpectra;