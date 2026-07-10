import React, { useState, useEffect, useRef, useMemo } from "react";
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

const ForceIndentationDataSet = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => { },
  onCurveSelect = () => { },
  selectedCurveIds = [],
  graphType = "line",
  onGraphTypeChange = () => {}, // optional; safe if parent doesn't pass
  activeTab = "", // Track active tab to trigger resize when tab becomes visible
  isSingleCurveMode = false,
  selectedForceModel = "",
}) => {
  const chartRef = useRef(null);      // ReactECharts component
  const echartsRef = useRef(null);    // ECharts instance
  // Track window height for responsive chart
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [hoveredCurveId, setHoveredCurveId] = useState(null);

  // Unit prefix preferences shared across all graphs via context
  const { xUnitPrefix, setXUnitPrefix, yUnitPrefix, setYUnitPrefix } = useUnitPreferences();
  // Controls visibility of the X axis unit dropdown (local UI state)
  const [xDropdownOpen, setXDropdownOpen] = useState(false);
  // Controls visibility of the Y axis unit dropdown (local UI state)
  const [yDropdownOpen, setYDropdownOpen] = useState(false);
  // Refs for click-outside detection on each dropdown wrapper
  const xDropdownRef = useRef(null);
  const yDropdownRef = useRef(null);

  // Handle window resize and chart resize
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
      // Resize ECharts instance when window resizes
      const inst = echartsRef.current || chartRef.current?.getEchartsInstance?.();
      if (inst) {
        try { inst.resize(); } catch {}
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Resize chart when tab becomes active, data changes, or domain changes
  // This fixes the "blank after tab switch" issue when ECharts mounts in a hidden tab
  useEffect(() => {
    const inst = echartsRef.current || chartRef.current?.getEchartsInstance?.();
    if (inst) {
      // Use setTimeout to ensure the tab has rendered with proper dimensions
      setTimeout(() => {
        try { inst.resize(); } catch {}
      }, 0);
    }
  }, [activeTab, forceData, domainRange]);

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

  // --- Toolbar look (same as others) ---
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
  const titleStyle = { fontSize: 14, fontWeight: 700, color: "#1d1e2c", whiteSpace: "nowrap" };
  const chipStyle = {
    fontSize: 12, fontWeight: 700, color: "#3DA58A",
    background: "#ECFDF5", border: "1px solid #CFFAEA", padding: "4px 8px", borderRadius: "999px",
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
    display: "flex", alignItems: "center", gap: 0,
    background: "#f2f4ff", border: "1px solid #dfe3ff", borderRadius: "12px", overflow: "hidden",
  };
  const segBtnStyle = (active) => ({
    padding: "8px 12px", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer",
    background: active ? "#fff" : "transparent",
    color: active ? "#1d1e2c" : "#4a4f6a",
    boxShadow: active ? "inset 0 0 0 1px #cfd6ff" : "none",
    transition: "all .15s ease",
  });
  const actionBtnStyle = {
    padding: "8px 10px", fontSize: 13, fontWeight: 700,
    borderRadius: "10px", border: "1px solid #e6e9f7",
    background: "#fff", color: "#2c2f3a", cursor: "pointer",
    boxShadow: "0 2px 8px rgba(30, 41, 59, 0.06)",
  };
  const pressable = {
    onMouseDown: (e) => (e.currentTarget.style.transform = "translateY(1px)"),
    onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
    onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
  };

  const isMobile = window.innerWidth < 768;
  const headerHeight = isMobile ? 100 : 120; // Tabs + filters
  const footerHeight = isMobile ? 50 : 0; // Controls (stacked on mobile)
  const chartHeight = Math.min(
    Math.max(windowHeight - headerHeight - footerHeight - 300, 300), // Min 300px
    800 // Max 800px
  );

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
  // console.log("forceData", forceData)
  
  // Normalize: accept either the full graph {curves:{...}, domain:{...}} or just the curves object
  const graphObj = useMemo(() => {
    return (forceData && forceData.curves) ? forceData.curves : (forceData || {});
  }, [forceData]);
  
  const validForceData = graphObj;   // keep old naming if used elsewhere
  const curvesData = graphObj;
  
  // Extract curves_cp and curves_fparam from the curves object with proper array checks - memoized
  const curvesCpData = useMemo(() => {
    return Array.isArray(curvesData.curves_cp) ? curvesData.curves_cp : [];
  }, [curvesData]);
  
  const curvesFparamData = useMemo(() => {
    return Array.isArray(curvesData.curves_fparam) ? curvesData.curves_fparam : [];
  }, [curvesData]);
  
  // Determine if we should show model overlays (only in single-curve mode with a model selected)
  const showForceModelOverlay = isSingleCurveMode && selectedForceModel;
  
  // Safe filtering: Only filter if there *is* a selection; otherwise keep all
  // This prevents blank charts when selectedCurveIds from another tab don't match current curves
  // Always filter out _hertz model overlays unless in single-curve mode - memoized
  const filteredCp = useMemo(() => {
    if (selectedCurveIds?.length > 0) {
      return curvesCpData.filter(c => {
        // Filter out _hertz model overlays unless in single-curve mode
        if (c.curve_id.includes('_hertz')) {
          if (!showForceModelOverlay) return false;
          const base = c.curve_id.replace('_hertz', '');
          const mainId = `curve${base}`;
          return selectedCurveIds.includes(mainId);
        }
        if (selectedCurveIds.includes(c.curve_id)) return true;
        return false;
      });
    } else {
      // When no selection, still filter out _hertz overlays unless in single-curve mode
      return curvesCpData.filter(c => {
        if (c.curve_id.includes('_hertz')) {
          return showForceModelOverlay;
        }
        return true;
      });
    }
  }, [curvesCpData, selectedCurveIds, showForceModelOverlay]);

  const filteredFparam = useMemo(() => {
    if (!showForceModelOverlay) return [];
    
    if (selectedCurveIds?.length > 0) {
      return curvesFparamData.filter(fparam => {
        const curveIndex = fparam.curve_index;
        const correspondingCurve = curvesCpData[curveIndex];
        return correspondingCurve && selectedCurveIds.includes(correspondingCurve.curve_id);
      });
    }
    return curvesFparamData;
  }, [showForceModelOverlay, selectedCurveIds, curvesFparamData, curvesCpData]);

  // If filtering produced 0 visible series, fall back to non-model curves to avoid a blank chart
  // But don't re-add model overlays that were intentionally filtered out - memoized
  const fallbackCp = useMemo(() => {
    return curvesCpData.filter(c => !c.curve_id.includes('_hertz'));
  }, [curvesCpData]);
  
  const finalCp = useMemo(() => {
    return filteredCp.length > 0 ? filteredCp : fallbackCp;
  }, [filteredCp, fallbackCp]);
  
  const finalFp = filteredFparam;
  
  // Combine both types of curves for processing (using filtered data) - memoized
  const allCurves = useMemo(() => {
    return [...finalCp, ...finalFp];
  }, [finalCp, finalFp]);

  // Count unique base curves (excluding model overlays like _hertz)
  const uniqueCurveCount = useMemo(() => {
    const uniqueIds = new Set();
    finalCp.forEach(c => {
      // Only count curves that are not model overlays
      if (!c.curve_id.includes('_hertz')) {
        uniqueIds.add(c.curve_id);
      }
    });
    return uniqueIds.size;
  }, [finalCp]);
  
  // console.log("forceData (Indentation):", validForceData);
  // console.log("curves_cp:", curvesCpData);
  // console.log("curves_fparam:", curvesFparamData);

  // Resolve active unit option objects from the shared context selection
  const xUnitOption = UNIT_OPTIONS.find((o) => o.value === xUnitPrefix);
  const yUnitOption = UNIT_OPTIONS.find((o) => o.value === yUnitPrefix);

  // SI conversion factors driven by the selected prefix (e.g. nano → 1e9, milli → 1e3)
  const xSiFactor = xUnitOption.factor;
  const ySiFactor = yUnitOption.factor;

  // Raw SI value × scaleFactor = graph display value in the selected unit (e.g. µm, µN)
  const xScaleFactor = xSiFactor;
  const yScaleFactor = ySiFactor;

  // Scaled ranges used to compute how many decimal places are needed on tick labels
  const xScaledRange = useMemo(() => (domainRange.xMax - domainRange.xMin) * xScaleFactor, [domainRange.xMax, domainRange.xMin, xScaleFactor]);
  const xDecimals = useMemo(() => xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0, [xScaledRange]);

  const yScaledRange = useMemo(() => (domainRange.yMax - domainRange.yMin) * yScaleFactor, [domainRange.yMax, domainRange.yMin, yScaleFactor]);
  const yDecimals = useMemo(() => yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0, [yScaledRange]);
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipXDecimals = Math.max(2, xDecimals);
  // Keeps tooltip precision readable by forcing at least two decimal places.
  const tooltipYDecimals = Math.max(2, yDecimals);

  // Y axis base symbol for force: prepend selected metric prefix to "N" (e.g. milli → "mN")
  const yBaseSymbol = yUnitOption.prefix ? `${yUnitOption.prefix}N` : "N";

  // Axis unit labels use the selected prefix directly (e.g. µm, µN)
  const xUnit = xUnitOption.xSymbol;
  const yUnit = yBaseSymbol;

  // Debug: Log curve data before building chartOptions
  console.log("FI curves_cp len:", curvesCpData[0]?.x?.length, "fparams len:", curvesFparamData.length, "domain:", domainRange);

  // Generate series data - memoized to avoid recomputing point mappings on every render
  // Downsample when there are many curves to improve rendering performance
  const series = useMemo(() => {
    const manySeries = finalCp.length > 40; // Threshold for downsampling

    return [
      // curves_cp as line/scatter depending on toolbar
      ...finalCp
        .filter(c => Array.isArray(c?.x) && Array.isArray(c?.y) && c.x.length === c.y.length && c.x.length > 1)
        .map((curve) => {
          let x = curve.x;
          let y = curve.y;

          // Downsample when there are many series to improve performance
          if (manySeries) {
            [x, y] = downsampleXY(x, y);
          }

          const isValid = Array.isArray(x) && Array.isArray(y) && x.length === y.length;
          
          return {
            name: curve.curve_id,
            type: graphType === "scatter" ? "scatter" : "line",
            smooth: false,
            showSymbol: true, // Keep symbol hit targets enabled so item tooltips work in line mode.
            connectNulls: true,
            large: false, // Keep hit detection enabled for reliable hover/click behavior.
            sampling: "lttb", // Extra safety for large data
            triggerEvent: true,
            itemStyle: {
              color: curve.curve_id.includes('_hertz') ? 'yellow' : undefined,
              opacity: graphType === "line" ? 0 : 1,
            },
            lineStyle: {
              width: curve.curve_id.includes('_hertz') ? 5 : 1.5,
            },
            data: isValid ? x.map((vx, i) => [vx * xScaleFactor, (y[i] ?? 0) * yScaleFactor]) : [],
          };
        }),
      // curves_fparam as scatter series (using filtered finalFp)
      ...finalFp.map((fparamObj) => {
        const curveIndex = fparamObj.curve_index;
        const correspondingCurve = curvesCpData[curveIndex];
        if (!correspondingCurve) return null;
        const xIndex = Math.floor(correspondingCurve.x.length / 2);
        const xValue = correspondingCurve.x[xIndex] || 0;
        const yValue = fparamObj.fparam;
        return {
          name: `fparam_${curveIndex}`,
          type: "scatter",
          showSymbol: true,
          symbolSize: 8,
          large: true,
          triggerEvent: true,
          itemStyle: { color: '#ff6b6b' },
          data: [[xValue * xScaleFactor, yValue * yScaleFactor]],
        };
      }).filter(Boolean), // Remove null entries
    ];
  }, [finalCp, finalFp, graphType, xScaleFactor, yScaleFactor, curvesCpData]);

  // Determine if there are too many series for tooltips (performance optimization)
  const tooManySeries = finalCp.length > 40;

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
              `Indentation (${xUnit}): ${x.toFixed(tooltipXDecimals)}`,
              `Force (${yUnit}): ${y.toFixed(tooltipYDecimals)}`,
            ].join('<br/>');
          },
        },
    xAxis: {
      type: "value",
      name: formatAxisQuantityLabel("Indentation", 0, xUnitOption.xSymbol),
      nameLocation: "middle",
      nameGap: CHART_X_AXIS_NAME_GAP,
      nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
      min: domainRange.xMin !== null ? domainRange.xMin * xScaleFactor : undefined,
      max: domainRange.xMax !== null ? domainRange.xMax * xScaleFactor : undefined,
      axisLabel: buildValueAxisTickLabel((value) => value.toFixed(xDecimals)),
    },
    yAxis: {
      type: "value",
      name: formatAxisQuantityLabel("Force", 0, yBaseSymbol),
      nameLocation: "middle",
      nameGap: 50,
      nameTextStyle: CHART_AXIS_NAME_TEXT_STYLE,
      scale: true,
      min: domainRange.yMin !== null ? domainRange.yMin * yScaleFactor : undefined,
      max: domainRange.yMax !== null ? domainRange.yMax * yScaleFactor : undefined,
      axisLabel: buildValueAxisTickLabel((value) => value.toFixed(yDecimals)),
    },
    series,

    legend: { show: false },
    grid: { left: "12%", right: "10%", bottom: CHART_GRID_BOTTOM, top: "8%" },
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 20,
        bottom: CHART_X_DATAZOOM_BOTTOM,
      },
      {
        type: "slider",
        yAxisIndex: 0,
        start: 0,
        end: 100,
        width: 20,
        right: 10,
      },
      {
        type: "inside",
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
      {
        type: "inside",
        yAxisIndex: 0,
        start: 0,
        end: 100,
      },
    ],
    animation: false,
    progressive: 5000,
  }), [tooManySeries, series, xScaleFactor, yScaleFactor, xDecimals, yDecimals, tooltipXDecimals, tooltipYDecimals, xUnit, yUnit, domainRange, hoveredCurveId]);

  const onChartEvents = {
    mouseover: (params) => {
      if (params.componentType === "series") {
        const curveId = params.seriesName || params.name;
        if (curveId) setHoveredCurveId(curveId);
      }
    },
    mouseout: () => {
      setHoveredCurveId(null);
    },
    click: (params) => {
      console.log("Chart click event (Indentation):", {
        componentType: params.componentType,
        seriesType: params.seriesType,
        seriesIndex: params.seriesIndex,
        name: params.name,
      });
      if (params.componentType === "series") {
        const seriesIndex = params.seriesIndex;
        
        // Check if it's a fparam series (scatter points)
        if (seriesIndex >= curvesCpData.length) {
          // It's a fparam point
          const fparamIndex = seriesIndex - curvesCpData.length;
          const fparamObj = curvesFparamData[fparamIndex];
          const correspondingCurve = curvesCpData[fparamObj.curve_index];
          
          if (correspondingCurve) {
            console.log("Selected fparam point:", {
              curve_id: correspondingCurve.curve_id,
              fparam: fparamObj.fparam,
              curve_index: fparamObj.curve_index,
            });
            setSelectedCurveIds([correspondingCurve.curve_id]);
            if (onCurveSelect) {
              onCurveSelect({
                curve_id: correspondingCurve.curve_id,
                x: correspondingCurve.x || [],
                y: correspondingCurve.y || [],
              });
            }
          }
        } else {
          // It's a regular curve
          const selectedCurve = curvesCpData[seriesIndex];
          console.log("Selected curve (Indentation):", {
            curve_id: selectedCurve?.curve_id,
            x: selectedCurve?.x?.slice(0, 5),
            y: selectedCurve?.y?.slice(0, 5),
          });
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
      }
    },
  };

  return (
    <div style={{ flex: 1, height: "100%" }}>
      {/* Toolbar */}
      <div style={toolbarCardStyle}>
        <div style={leftWrapStyle}>
          <div style={titleStyle}>Force–Indentation</div>
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

          {/* Y axis unit selector */}
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
                    {opt.prefix ? `${opt.prefix}N` : "N"}
                    <span style={{ marginLeft: 6, opacity: 0.5, fontSize: 11 }}>({opt.value === "none" ? "SI" : opt.value})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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

          <button
            style={actionBtnStyle}
            onClick={() => {
              const inst = echartsRef.current || chartRef.current?.getEchartsInstance?.();
              if (!inst) return;
              try {
                inst.dispatchAction({ type: "dataZoom", start: 0, end: 100 });
                inst.dispatchAction({ type: "dataZoom", yAxisIndex: 0, start: 0, end: 100 });
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
        onChartReady={(inst) => {
          echartsRef.current = inst;
          // Ensure initial sizing if tab was already visible
          try { inst.resize(); } catch {}
        }}
      />
    </div>
  );
};

export default ForceIndentationDataSet;