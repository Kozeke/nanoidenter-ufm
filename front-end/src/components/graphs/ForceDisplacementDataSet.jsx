import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import echarts from "../../utils/echartsConfig";
import { useUnitPreferences, UNIT_OPTIONS } from "../../context/UnitPreferencesContext";
import { useDashboardStore } from "../../state/useDashboardStore";
import {
  CHART_AXIS_NAME_TEXT_STYLE,
  CHART_GRID_BOTTOM,
  CHART_X_AXIS_NAME_GAP,
  CHART_X_DATAZOOM_BOTTOM,
  buildValueAxisTickLabel,
  formatAxisQuantityLabel,
} from "../../utils/chartAxisStyles";

const ForceDisplacementDataSet = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => {},
  onCurveSelect = () => {},
  selectedCurveIds = [],
  graphType = "line",
  onGraphTypeChange = () => {}, // optional, keeps backward compatibility
}) => {
  const chartRef = useRef(null); // ReactECharts component
  const echartsRef = useRef(null); // ECharts instance
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  // Tracks the current dataZoom percentages so re-renders (e.g. unit change) don't reset zoom
  const zoomRef = useRef({ xStart: 0, xEnd: 100, yStart: 0, yEnd: 100 });

  // Unit prefix preferences are shared across all graph panels via context
  const { xUnitPrefix, setXUnitPrefix, yUnitPrefix, setYUnitPrefix } = useUnitPreferences();

  // Reads the active FixedBaseline / LinearWindowFit configs directly from the
  // store (rather than threading new props through Dashboard.jsx /
  // ForceDisplacementPanel.jsx) so the chart can shade each fit's window and
  // mark its edges — matching the reference script's axvspan/axvline on the
  // baseline-window and K-window diagnostic plots.
  const baselineCfg = useDashboardStore((s) => s.filters?.regular?.fixedbaseline);
  const linfitCfg = useDashboardStore((s) => s.filters?.regular?.linearwindowfit);
  // Controls visibility of the X axis unit dropdown (local UI state only)
  const [xDropdownOpen, setXDropdownOpen] = useState(false);
  // Controls visibility of the Y axis unit dropdown (local UI state only)
  const [yDropdownOpen, setYDropdownOpen] = useState(false);
  // Wrapper refs used to detect clicks outside the dropdowns and close them
  const xDropdownRef = useRef(null);
  const yDropdownRef = useRef(null);
  // Update window height on resize and handle chart resize
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      // Resize ECharts instance when window resizes
      const inst =
        echartsRef.current || chartRef.current?.getEchartsInstance?.();
      if (inst) {
        try {
          inst.resize();
        } catch {}
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Close whichever dropdown was open when the user clicks outside its wrapper
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

  // --- Unified toolbar/card look (matches other headers) ---
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
    whiteSpace: "nowrap",
  };

  // Clickable unit chip — same look as static chip but pointer cursor to signal interactivity
  const unitChipStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "#4a4f6a",
    background: "#f5f7ff",
    border: "1px solid #e9ecf5",
    padding: "3px 8px",
    borderRadius: "999px",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    userSelect: "none",
  };

  // Floating dropdown panel that appears below the chip
  const dropdownPanelStyle = {
    position: "absolute",
    top: "calc(100% + 5px)",
    left: 0,
    zIndex: 200,
    background: "#fff",
    border: "1px solid #e9ecf5",
    borderRadius: "10px",
    boxShadow: "0 8px 20px rgba(20,20,43,0.12)",
    minWidth: "120px",
    overflow: "hidden",
  };

  // Individual item inside the dropdown; active item is highlighted in green
  const dropdownItemStyle = (active) => ({
    display: "block",
    width: "100%",
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: active ? 700 : 500,
    color: active ? "#3DA58A" : "#1d1e2c",
    background: active ? "#ECFDF5" : "transparent",
    border: "none",
    textAlign: "left",
    cursor: "pointer",
    transition: "background .1s",
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

  // console.log("selectedCurveIds",selectedCurveIds)
  // Calculate chart height based on window size
  const isMobile = window.innerWidth < 768;
  const headerHeight = isMobile ? 100 : 120; // Approximate space for tabs + filters
  const footerHeight = isMobile ? 50 : 0; // Space for any bottom controls
  const chartHeight = Math.min(
    Math.max(windowHeight - headerHeight - footerHeight - 300, 300), // Min 300px
    800, // Max 800px
  );

  // Resolve the active unit option objects based on user selection
  const xUnitOption = UNIT_OPTIONS.find((o) => o.value === xUnitPrefix);
  const yUnitOption = UNIT_OPTIONS.find((o) => o.value === yUnitPrefix);

  // SI conversion factors driven by the selected prefix (e.g. nano → 1e9, milli → 1e3)
  const xSiFactor = xUnitOption.factor;
  const ySiFactor = yUnitOption.factor;

  // Raw SI value × scaleFactor = graph display value in the selected unit (e.g. µm, µN)
  const xScaleFactor = xSiFactor;
  const yScaleFactor = ySiFactor;

  // Y axis base symbol for force: prepend the selected metric prefix to "N" (e.g. milli → "mN")
  const yBaseSymbol = yUnitOption.prefix ? `${yUnitOption.prefix}N` : "N";

  // Axis unit labels use the selected prefix directly (e.g. µm, µN)
  const xUnit = xUnitOption.xSymbol;
  const yUnit = yBaseSymbol;

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

  // Process and normalize force data - memoized to avoid recomputing on every render
  const processedCurves = useMemo(() => {
    if (!Array.isArray(forceData)) return [];

    return forceData.map((curve) => ({
      ...curve,
      curve_id: curve?.curve_id ? String(curve.curve_id) : "Unknown Curve",
      x: Array.isArray(curve?.x) ? curve.x : [],
      y: Array.isArray(curve?.y) ? curve.y : [],
    }));
  }, [forceData]);

  // Keep validForceData for backward compatibility with existing code
  const validForceData = processedCurves;
  // console.log("forceData (Displacement):", JSON.stringify(validForceData, null, 2));

  // Scaled axis range used to determine how many decimals to show on tick labels
  const xScaledRange = useMemo(
    () => (domainRange.xMax - domainRange.xMin) * xScaleFactor,
    [domainRange.xMax, domainRange.xMin, xScaleFactor],
  );
  const xDecimals = useMemo(
    () =>
      xScaledRange > 0
        ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10)))
        : 2,
    [xScaledRange],
  );

  const yScaledRange = useMemo(
    () => (domainRange.yMax - domainRange.yMin) * yScaleFactor,
    [domainRange.yMax, domainRange.yMin, yScaleFactor],
  );
  const yDecimals = useMemo(
    () =>
      yScaledRange > 0
        ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10)))
        : 2,
    [yScaledRange],
  );
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipXDecimals = Math.max(2, xDecimals);
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipYDecimals = Math.max(2, yDecimals);

  // Generate series data - memoized to avoid recomputing point mappings on every render
  // Downsample when there are many curves to improve rendering performance
  const series = useMemo(() => {
    const manySeries = processedCurves.length > 40; // Threshold for downsampling

    return processedCurves.map((curve) => {
      let x = curve.x;
      let y = curve.y;

      // Downsample when there are many series to improve performance
      if (manySeries) {
        [x, y] = downsampleXY(x, y);
      }

      // Overlay curves get a fixed, distinct color/weight regardless of the
      // underlying curve's own color, so they read clearly as fit diagnostics
      // rather than as another data curve — same idea as the "_hertz" overlay
      // treatment on the Force–Indentation chart.
      const isBaselineOverlay = curve.curve_id.includes("_baseline");
      const isLinfitOverlay = curve.curve_id.includes("_linfit") && curve.curve_id !== "avg_linfit";
      const isAvgLinfit = curve.curve_id === "avg_linfit";
      const isOverlay = isBaselineOverlay || isLinfitOverlay || isAvgLinfit;

      // Overlay/annotation curve IDs (e.g. "5_linfit", "avg_linfit") never
      // match a real curve_id in selectedCurveIds ("curve5"), so without this
      // they'd disappear the instant any curve was selected. Always show them.
      const isShown =
        (selectedCurveIds.length === 0 ||
          selectedCurveIds.includes(curve.curve_id) ||
          isOverlay) &&
        Array.isArray(x) &&
        Array.isArray(y) &&
        x.length === y.length;

      return {
        name: curve.curve_id,
        type: graphType,
        smooth: false,
        // Invisible symbols are the hit targets for trigger:"item" on line series.
        // opacity:0 hides them visually; ECharts canvas still detects hover on them.
        showSymbol: true,
        symbolSize: graphType === "scatter" ? 4 : 10,
        itemStyle: {
          opacity: graphType === "scatter" ? 1 : 0,
          color: isBaselineOverlay
            ? "#4c78a8"
            : isAvgLinfit
              ? "#f6b26b"
              : isLinfitOverlay
                ? "#e0399c"
                : undefined,
        },
        lineStyle: isOverlay
          ? {
              width: isAvgLinfit ? 3 : 2.5,
              color: isBaselineOverlay ? "#4c78a8" : isAvgLinfit ? "#f6b26b" : "#e0399c",
              // Approximates the reference script's white-halo path effect
              // (pe.Stroke(white) + pe.Normal()) — ECharts has no native
              // stroke-outline option, so the "shadow" below fakes the halo.
              shadowColor: "#ffffff",
              shadowBlur: isAvgLinfit ? 6 : 0,
            }
          : undefined,
        z: isAvgLinfit ? 11 : isOverlay ? 10 : 1,
        connectNulls: true,
        large: false,
        sampling: "lttb",
        triggerEvent: true,
        data: isShown
          ? x.map((vx, i) => [vx * xScaleFactor, (y[i] ?? 0) * yScaleFactor])
          : [],
      };
    });
  }, [
    processedCurves,
    graphType,
    selectedCurveIds,
    xScaleFactor,
    yScaleFactor,
  ]);

  // Baseline-window and K-window shaded regions + dashed edge lines, matching
  // the reference script's plt.axvspan/plt.axvline. Rendered as two invisible
  // ("silent", no line/points of their own) marker series carrying markArea +
  // markLine, since ECharts attaches these to a series rather than the chart
  // as a whole. Only included when the corresponding filter is actually active.
  const windowMarkerSeries = useMemo(() => {
    const markers = [];

    if (baselineCfg) {
      const startNm = Number(baselineCfg.baseline_start_nm ?? 0);
      const dzNm = Number(baselineCfg.baseline_dz_nm ?? 0);
      if (Number.isFinite(startNm) && Number.isFinite(dzNm) && dzNm > 0) {
        const startScaled = startNm * 1e-9 * xScaleFactor;
        const endScaled = (startNm + dzNm) * 1e-9 * xScaleFactor;
        markers.push({
          name: "_baseline_window_marker",
          type: "line",
          data: [],
          silent: true,
          showSymbol: false,
          tooltip: { show: false },
          markArea: {
            itemStyle: { color: "rgba(76,120,168,0.12)" },
            data: [[{ xAxis: startScaled }, { xAxis: endScaled }]],
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#4c78a8", type: "dashed", width: 0.9 },
            label: { show: false },
            data: [{ xAxis: startScaled }, { xAxis: endScaled }],
          },
        });
      }
    }

    if (linfitCfg) {
      const t1Nm = Number(linfitCfg.t1_nm ?? NaN);
      const t2Nm = Number(linfitCfg.t2_nm ?? NaN);
      if (Number.isFinite(t1Nm) && Number.isFinite(t2Nm)) {
        const lowScaled = Math.min(t1Nm, t2Nm) * 1e-9 * xScaleFactor;
        const highScaled = Math.max(t1Nm, t2Nm) * 1e-9 * xScaleFactor;
        markers.push({
          name: "_k_window_marker",
          type: "line",
          data: [],
          silent: true,
          showSymbol: false,
          tooltip: { show: false },
          markArea: {
            itemStyle: { color: "rgba(224,57,156,0.10)" },
            data: [[{ xAxis: lowScaled }, { xAxis: highScaled }]],
          },
          markLine: {
            silent: true,
            symbol: "none",
            lineStyle: { color: "#e0399c", type: "dashed", width: 0.9 },
            label: { show: false },
            data: [{ xAxis: lowScaled }, { xAxis: highScaled }],
          },
        });
      }
    }

    return markers;
  }, [baselineCfg, linfitCfg, xScaleFactor]);

  const onChartEvents = {
    // Track zoom state so it survives re-renders (e.g. unit prefix change)
    datazoom: (params) => {
      const inst = echartsRef.current || chartRef.current?.getEchartsInstance?.();
      if (!inst) return;
      try {
        const option = inst.getOption();
        const dz = option?.dataZoom ?? [];
        // slider index 0 = x, slider index 1 = y (matches chartOptions order)
        if (dz[0]) {
          zoomRef.current.xStart = dz[0].start ?? zoomRef.current.xStart;
          zoomRef.current.xEnd   = dz[0].end   ?? zoomRef.current.xEnd;
        }
        if (dz[1]) {
          zoomRef.current.yStart = dz[1].start ?? zoomRef.current.yStart;
          zoomRef.current.yEnd   = dz[1].end   ?? zoomRef.current.yEnd;
        }
      } catch {}
    },
    click: (params) => {
      // console.log("Chart click event (Displacement):", {
      //   componentType: params.componentType,
      //   seriesType: params.seriesType,
      //   seriesIndex: params.seriesIndex,
      //   name: params.name,
      // });
      if (params.componentType === "series") {
        const curveIndex = params.seriesIndex;
        const selectedCurve = validForceData[curveIndex];
        // console.log("Selected curve (Displacement):", {
        //   curve_id: selectedCurve?.curve_id,
        //   x: selectedCurve?.x?.slice(0, 5),
        //   y: selectedCurve?.y?.slice(0, 5),
        // });
        if (selectedCurve && selectedCurve.curve_id) {
          setSelectedCurveIds([selectedCurve.curve_id]);
          if (onCurveSelect) {
            onCurveSelect({
              curve_id: selectedCurve.curve_id,
              x: selectedCurve.x || [],
              y: selectedCurve.y || [],
            });
          }
        }
      }
    },
  };

  // Determine if there are too many series for tooltips (performance optimization)
  const tooManySeries = processedCurves.length > 40;

  // Chart options - memoized to avoid recreating the entire config object on every render
  const chartOptions = useMemo(
    () => ({
      tooltip: tooManySeries
        ? { show: false } // Disable tooltips when there are many curves to improve performance
        : {
            trigger: "item",
            formatter: (params) => {
              console.log("[Tooltip formatter fired]", params);
              const name = params.seriesName || params.name || "";
              const value = Array.isArray(params.value)
                ? params.value
                : [params.value];
              const x = value[0];
              const y = value[1];
              if (x == null || y == null || isNaN(x) || isNaN(y)) return "";
              return [
                `<b>${name}</b>`,
                `Z (${xUnit}): ${x.toFixed(tooltipXDecimals)}`,
                `Force (${yUnit}): ${y.toFixed(tooltipYDecimals)}`,
              ].join("<br/>");
            },
          },
      xAxis: {
        type: "value",
        name: formatAxisQuantityLabel("Z", 0, xUnitOption.xSymbol),
        nameLocation: "middle",
        nameGap: CHART_X_AXIS_NAME_GAP,
        nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
        min: domainRange.xMin ? domainRange.xMin * xScaleFactor : undefined,
        max: domainRange.xMax ? domainRange.xMax * xScaleFactor : undefined,
        axisLabel: buildValueAxisTickLabel((value) => value.toFixed(xDecimals)),
      },
      yAxis: {
        type: "value",
        name: formatAxisQuantityLabel("Force", 0, yBaseSymbol),
        nameLocation: "middle",
        nameGap: 50,
        nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
        scale: true,
        min: domainRange.yMin * yScaleFactor,
        max: domainRange.yMax * yScaleFactor,
        axisLabel: buildValueAxisTickLabel((value) => value.toFixed(yDecimals)),
      },
      series: [...series, ...windowMarkerSeries],
      legend: {
        show: false,
      },
      grid: {
        left: "12%",
        right: "10%",
        bottom: CHART_GRID_BOTTOM,
        top: "8%",
      },
      dataZoom: [
        {
          type: "slider",
          xAxisIndex: 0,
          start: zoomRef.current.xStart,
          end: zoomRef.current.xEnd,
          height: 20,
          bottom: CHART_X_DATAZOOM_BOTTOM,
        },
        {
          type: "slider",
          yAxisIndex: 0,
          start: zoomRef.current.yStart,
          end: zoomRef.current.yEnd,
          width: 20,
          right: 10,
        },
        {
          type: "inside",
          xAxisIndex: 0,
          start: zoomRef.current.xStart,
          end: zoomRef.current.xEnd,
        },
        {
          type: "inside",
          yAxisIndex: 0,
          start: zoomRef.current.yStart,
          end: zoomRef.current.yEnd,
        },
      ],
      animation: false,
      progressive: 5000,
    }),
    [
      tooManySeries,
      series,
      windowMarkerSeries,
      xDecimals,
      yDecimals,
      tooltipXDecimals,
      tooltipYDecimals,
      xUnit,
      yUnit,
      domainRange,
      xScaleFactor,
      yScaleFactor,
    ],
  );

  return (
    <div style={{ flex: 1, height: "100%" }}>
      {/* Chart Toolbar */}
      <div style={toolbarCardStyle}>
        <div style={leftWrapStyle}>
          <div style={titleStyle}>Force–Displacement</div>
          <div style={chipStyle}>{validForceData.length} series</div>

          {/* X axis unit selector */}
          <div ref={xDropdownRef} style={{ position: "relative" }}>
            <button
              style={unitChipStyle}
              onClick={() => {
                setXDropdownOpen((v) => !v);
                setYDropdownOpen(false);
              }}
              title="Change X axis unit"
            >
              X: {xUnit} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {xDropdownOpen && (
              <div style={dropdownPanelStyle}>
                {UNIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    style={dropdownItemStyle(xUnitPrefix === opt.value)}
                    onClick={() => {
                      setXUnitPrefix(opt.value);
                      setXDropdownOpen(false);
                    }}
                  >
                    {opt.xSymbol}
                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>
                      ({opt.value === "none" ? "SI" : opt.value})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Y axis unit selector */}
          <div ref={yDropdownRef} style={{ position: "relative" }}>
            <button
              style={unitChipStyle}
              onClick={() => {
                setYDropdownOpen((v) => !v);
                setXDropdownOpen(false);
              }}
              title="Change Y axis unit"
            >
              Y: {yUnit} <span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
            </button>
            {yDropdownOpen && (
              <div style={dropdownPanelStyle}>
                {UNIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    style={dropdownItemStyle(yUnitPrefix === opt.value)}
                    onClick={() => {
                      setYUnitPrefix(opt.value);
                      setYDropdownOpen(false);
                    }}
                  >
                    {opt.prefix ? `${opt.prefix}N` : "N"}
                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>
                      ({opt.value === "none" ? "SI" : opt.value})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Segmented view toggle (optional controlled by parent) */}
          <div style={segWrapStyle} role="tablist" aria-label="Chart Type">
            <button
              style={segBtnStyle(graphType === "line")}
              onClick={() => onGraphTypeChange("line")}
              role="tab"
              aria-selected={graphType === "line"}
              {...pressable}
            >
              Line
            </button>
            <button
              style={segBtnStyle(graphType === "scatter")}
              onClick={() => onGraphTypeChange("scatter")}
              role="tab"
              aria-selected={graphType === "scatter"}
              {...pressable}
            >
              Scatter
            </button>
          </div>

          {/* Reset zoom */}
          <button
            style={actionBtnStyle}
            onClick={() => {
              const inst =
                echartsRef.current || chartRef.current?.getEchartsInstance?.();
              if (!inst) return;
              try {
                zoomRef.current = { xStart: 0, xEnd: 100, yStart: 0, yEnd: 100 };
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
        notMerge={false}
        opts={{ renderer: "canvas" }}
        onEvents={onChartEvents}
        onChartReady={(inst) => {
          echartsRef.current = inst;
          // Ensure initial sizing if tab was already visible
          try {
            inst.resize();
          } catch {}
        }}
      />
    </div>
  );
};

export default ForceDisplacementDataSet;