import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";

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
  const unitChipStyle = {
    fontSize: 12, fontWeight: 600, color: "#4a4f6a",
    background: "#f5f7ff", border: "1px solid #e9ecf5", padding: "3px 8px", borderRadius: "999px",
  };
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

  function getScaleFactor(minValue, dataArray = []) {
    if (!minValue && minValue !== 0) return 1;
    if (minValue === 0 && dataArray.length > 0) {
      const nonZeroValues = dataArray.filter((v) => v > 0);
      if (nonZeroValues.length === 0) return 1;
      minValue = Math.min(...nonZeroValues);
    }
    const absMin = Math.abs(minValue);
    const magnitude = Math.floor(Math.log10(absMin));
    return Math.pow(10, -magnitude);
  }

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
  
  // console.log("forceData (Indentation):", validForceData);
  // console.log("curves_cp:", curvesCpData);
  // console.log("curves_fparam:", curvesFparamData);

  // If the first curve is invalid, fall back to the first valid curve for scaling
  const firstValid = (arr) => arr.find(c => Array.isArray(c?.x) && c.x.length && Array.isArray(c?.y) && c.y.length);
  
  const xData = useMemo(() => {
    return allCurves.length > 0 ? (firstValid(allCurves)?.x || []) : [];
  }, [allCurves]);
  
  const xScaleFactor = useMemo(() => getScaleFactor(domainRange.xMin, xData), [domainRange.xMin, xData]);
  
  // Normalize y-axis scaling to avoid edge-cases when yMin is 0
  const yFirst = useMemo(() => {
    return firstValid(allCurves)?.y || [];
  }, [allCurves]);
  
  const yScaleFactor = useMemo(() => getScaleFactor(domainRange.yMin, yFirst), [domainRange.yMin, yFirst]);

  const xScaledRange = useMemo(() => (domainRange.xMax - domainRange.xMin) * xScaleFactor, [domainRange.xMax, domainRange.xMin, xScaleFactor]);
  const xDecimals = useMemo(() => xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0, [xScaledRange]);

  const yScaledRange = useMemo(() => (domainRange.yMax - domainRange.yMin) * yScaleFactor, [domainRange.yMax, domainRange.yMin, yScaleFactor]);
  const yDecimals = useMemo(() => yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0, [yScaledRange]);

  const xExponent = useMemo(() => Math.log10(xScaleFactor), [xScaleFactor]);
  const xUnit = useMemo(() => xExponent === 0 ? 'm' : `×10^{-${Math.round(xExponent)}} m`, [xExponent]);

  const yExponent = useMemo(() => Math.log10(yScaleFactor), [yScaleFactor]);
  const yUnit = useMemo(() => yExponent === 0 ? 'N' : `×10^{-${Math.round(yExponent)}} N`, [yExponent]);

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
            showSymbol: false, // Keep symbols off for cp curves (fparam uses scatter with symbols)
            connectNulls: true,
            large: true,
            sampling: "lttb", // Extra safety for large data
            triggerEvent: true,
            itemStyle: {
              color: curve.curve_id.includes('_hertz') ? 'yellow' : undefined,
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
          trigger: "axis",
          // Format tooltip to show each series cleanly with curve ID, x, and y values
          formatter: (params) => {
            const list = Array.isArray(params) ? params : [params];

            return list
              .map(p => {
                // Extract curve ID from series name or data
                const curveId = p.seriesName || p.name || (p.data && p.data.curve_id);

                // Handle value as array or single value
                const value = Array.isArray(p.value) ? p.value : [p.value];

                const x = value[0];
                const y = value[1];

                return [
                  `<b>${curveId}</b>`,
                  `x: ${x}`,
                  `y: ${y}`,
                ].join('<br/>');
              })
              .join('<br/><br/>');
          },
        },
    xAxis: {
      type: "value",
      name: `Indentation (${xUnit})`,
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange.xMin !== null ? domainRange.xMin * xScaleFactor : undefined,
      max: domainRange.xMax !== null ? domainRange.xMax * xScaleFactor : undefined,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(xDecimals);
        },
      },
    },
    yAxis: {
      type: "value",
      name: `Force (${yUnit})`,
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: domainRange.yMin !== null ? domainRange.yMin * yScaleFactor : undefined,
      max: domainRange.yMax !== null ? domainRange.yMax * yScaleFactor : undefined,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(yDecimals);
        },
      },
    },
    series,

    legend: { show: false },
    grid: { left: "12%", right: "10%", bottom: "15%", top: "8%" },
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
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
  }), [tooManySeries, series, xScaleFactor, yScaleFactor, xDecimals, yDecimals, xUnit, yUnit, domainRange]);

  const onChartEvents = {
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
          <div style={chipStyle}>{allCurves.length} series</div>
          <div style={unitChipStyle}>X: {xUnit}</div>
          <div style={unitChipStyle}>Y: {yUnit}</div>
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