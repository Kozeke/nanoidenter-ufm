import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import echarts from "../../utils/echartsConfig";

const ForceDisplacementDataSet = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => {},
  onCurveSelect = () => {},
  selectedCurveIds = [],
  graphType = "line",
  onGraphTypeChange = () => {}, // optional, keeps backward compatibility
}) => {
  const chartRef = useRef(null);      // ReactECharts component
  const echartsRef = useRef(null);    // ECharts instance
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  // Update window height on resize and handle chart resize
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
  const titleStyle = { fontSize: 14, fontWeight: 700, color: "#1d1e2c", whiteSpace: "nowrap" };

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

  const unitChipStyle = {
    fontSize: 12,
    fontWeight: 600,
    color: "#4a4f6a",
    background: "#f5f7ff",
    border: "1px solid #e9ecf5",
    padding: "3px 8px",
    borderRadius: "999px",
  };

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
    onMouseUp:   (e) => (e.currentTarget.style.transform = "translateY(0)"),
    onMouseLeave:(e) => (e.currentTarget.style.transform = "translateY(0)"),
  };

  // console.log("selectedCurveIds",selectedCurveIds)
    // Calculate chart height based on window size
    const isMobile = window.innerWidth < 768;
    const headerHeight = isMobile ? 100 : 120; // Approximate space for tabs + filters
    const footerHeight = isMobile ? 50 : 0; // Space for any bottom controls
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

  // Calculate scale factors - memoized based on domainRange and first curve's x data
  const xData = useMemo(() => {
    return validForceData.length > 0 && validForceData[0]?.x.length > 0 ? validForceData[0].x : [];
  }, [validForceData]);

  const xScaleFactor = useMemo(() => getScaleFactor(domainRange.xMin, xData), [domainRange.xMin, xData]);
  const yScaleFactor = useMemo(() => getScaleFactor(domainRange.yMin), [domainRange.yMin]);

  const xScaledRange = useMemo(() => (domainRange.xMax - domainRange.xMin) * xScaleFactor, [domainRange.xMax, domainRange.xMin, xScaleFactor]);
  const xDecimals = useMemo(() => xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0, [xScaledRange]);

  const yScaledRange = useMemo(() => (domainRange.yMax - domainRange.yMin) * yScaleFactor, [domainRange.yMax, domainRange.yMin, yScaleFactor]);
  const yDecimals = useMemo(() => yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0, [yScaledRange]);

  const xExponent = useMemo(() => Math.log10(xScaleFactor), [xScaleFactor]);
  const xUnit = useMemo(() => xExponent === 0 ? 'm' : `×10^{-${Math.round(xExponent)}} m`, [xExponent]);

  const yExponent = useMemo(() => Math.log10(yScaleFactor), [yScaleFactor]);
  const yUnit = useMemo(() => yExponent === 0 ? 'N' : `×10^{-${Math.round(yExponent)}} N`, [yExponent]);

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

      const isShown =
        (selectedCurveIds.length === 0 || selectedCurveIds.includes(curve.curve_id)) &&
        Array.isArray(x) &&
        Array.isArray(y) &&
        x.length === y.length;

      return {
        name: curve.curve_id,
        type: graphType,
        smooth: graphType === "line" ? false : undefined,
        showSymbol: !manySeries && graphType === "scatter",
        symbolSize: !manySeries && graphType === "scatter" ? 4 : undefined,
        large: true,
        sampling: "lttb", // Extra safety for large data
        triggerEvent: true,
        data: isShown
          ? x.map((vx, i) => [vx * xScaleFactor, (y[i] ?? 0) * yScaleFactor])
          : [],
      };
    });
  }, [processedCurves, graphType, selectedCurveIds, xScaleFactor, yScaleFactor]);

  const onChartEvents = {
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
      name: `Z (${xUnit})`,
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange.xMin ? domainRange.xMin * xScaleFactor : undefined,
      max: domainRange.xMax ? domainRange.xMax * xScaleFactor : undefined,
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
      min: domainRange.yMin * yScaleFactor,
      max: domainRange.yMax * yScaleFactor,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(yDecimals);
        },
      },
    },
    series,
    legend: {
      show: false,
    },
    grid: {
      left: "12%",
      right: "10%",
      bottom: "15%",
      top: "8%",
    },
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

  return (
    <div style={{ flex: 1, height: "100%" }}>
      {/* Chart Toolbar */}
      <div style={toolbarCardStyle}>
        <div style={leftWrapStyle}>
          <div style={titleStyle}>Force–Displacement</div>
          <div style={chipStyle}>{validForceData.length} series</div>
          <div style={unitChipStyle}>X: {xUnit}</div>
          <div style={unitChipStyle}>Y: {yUnit}</div>
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

export default ForceDisplacementDataSet;