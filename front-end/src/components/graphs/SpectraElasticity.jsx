import React, { useState, useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react";

const ElasticitySpectra = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => {},
  onCurveSelect = () => {},
  selectedCurveIds = [],
  graphType = "line",
  onGraphTypeChange = () => {}, // optional, safe default
}) => {
  const chartRef = useRef(null);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const lastNonEmptyDataRef = useRef([]);

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

  const isMobile = window.innerWidth < 768;
  const headerHeight = isMobile ? 100 : 120;
  const footerHeight = isMobile ? 50 : 0;
  const chartHeight = Math.min(
    Math.max(windowHeight - headerHeight - footerHeight - 300, 300),
    800
  );

  // ---------- Scale helpers ----------
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

  // Normalize the render data (use last non-empty to avoid blink)
  const renderForceData = Array.isArray(forceData) && forceData.length > 0
    ? forceData
    : lastNonEmptyDataRef.current;

  // Helper: treat "curve1" and "1" as same base; add pairing with "_elastic"
  const isElasticId = (id) => /_elastic$/i.test(id);
  // strip any suffix after first underscore (e.g., _elastic, _hertz, _whatever)
  const baseToken = (id) => {
    const noSuffix = String(id).replace(/_.+$/i, "");   // "curve0_hertz" -> "curve0"
    return noSuffix.replace(/^curve/i, "");             // "curve0" -> "0"
  };

  const isShownWithPartner = (id, selected) => {
    if (!selected || selected.length === 0) return true;
    const base = baseToken(id);
    // compare by base to be suffix-agnostic AND type-agnostic
    const selectedBases = new Set(
      selected.map((s) => baseToken(String(s)))
    );
    return selectedBases.has(base);
  };

  const validForceData = Array.isArray(renderForceData)
    ? renderForceData.map((curve) => ({
        ...curve,
        curve_id: curve?.curve_id ? String(curve.curve_id) : "Unknown Curve",
        x: Array.isArray(curve?.x) ? curve.x : [],
        y: Array.isArray(curve?.y) ? curve.y : [],
      }))
    : [];

  // Debug: Log the data to see what we're getting
  // console.log("SpectraElasticity - forceData:", forceData);
  // console.log("SpectraElasticity - validForceData:", validForceData);

  const xData =
    validForceData.length > 0 && validForceData[0]?.x.length > 0
      ? validForceData[0].x
      : [];
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData);
  const yScaleFactor = getScaleFactor(domainRange.yMin);

  const xScaledRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor;
  const yScaledRange = (domainRange.yMax - domainRange.yMin) * yScaleFactor;

  const xDecimals =
    xScaledRange > 0
      ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10)))
      : 0;
  const yDecimals =
    yScaledRange > 0
      ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10)))
      : 0;

  const xExponent = Math.log10(xScaleFactor);
  const yExponent = Math.log10(yScaleFactor);

  const xUnit = xExponent === 0 ? "m" : `×10^{-${Math.round(xExponent)}} m`;
  const yUnit = yExponent === 0 ? "Pa" : `×10^{-${Math.round(yExponent)}} Pa`;

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
    onMouseUp: (e) => (e.currentTarget.style.transform = "translateY(0)"),
    onMouseLeave: (e) => (e.currentTarget.style.transform = "translateY(0)"),
  };

  // ---------- Chart config ----------
  const safeMin = (v) => (Number.isFinite(v) ? v : undefined);
  const chartOptions = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: `Z (${xUnit})`,
      nameLocation: "middle",
      nameGap: 25,
      min: safeMin(domainRange.xMin * xScaleFactor),
      max: safeMin(domainRange.xMax * xScaleFactor),
      axisLabel: {
        formatter: (value) => value.toFixed(xDecimals),
      },
    },
    yAxis: {
      type: "value",
      name: `E (${yUnit})`,
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: safeMin(domainRange.yMin * yScaleFactor),
      max: safeMin(domainRange.yMax * yScaleFactor),
      axisLabel: {
        formatter: (value) => value.toFixed(yDecimals),
      },
    },
    series: validForceData.map((curve) => {
      const id = curve.curve_id;
      const elastic = isElasticId(id);
      const color = elastic ? "yellow" : "#5470C6";
      const showCurve =
        isShownWithPartner(id, selectedCurveIds) &&
        Array.isArray(curve.x) &&
        Array.isArray(curve.y) &&
        curve.x.length === curve.y.length;

      // Debug: Log each curve being processed
      // console.log(`SpectraElasticity - Processing curve: ${id}, elastic: ${elastic}, showCurve: ${showCurve}, color: ${color}`);

      return {
        name: id,
        type: graphType,
        smooth: graphType === "line" ? false : undefined,
        showSymbol: graphType === "scatter",
        symbolSize: graphType === "scatter" ? 4 : undefined,
        large: true,
        triggerEvent: true,
        // keep elastic on top
        z: elastic ? 3 : 2,
        lineStyle:
          graphType === "line"
            ? { color, width: elastic ? 4 : 2, opacity: 1 }
            : undefined,
        itemStyle: graphType === "scatter" ? { color } : undefined,
        data: showCurve
          ? curve.x.map((x, i) => [
              x * xScaleFactor,
              curve.y[i] !== undefined ? curve.y[i] * yScaleFactor : 0,
            ])
          : [],
      };
    }),
    legend: { show: false },
    grid: { left: "12%", right: "10%", bottom: "15%", top: "8%" },
    dataZoom: [
      { type: "slider", xAxisIndex: 0, start: 0, end: 100, height: 20, bottom: 10 },
      { type: "slider", yAxisIndex: 0, start: 0, end: 100, width: 20, right: 10 },
      { type: "inside", xAxisIndex: 0, start: 0, end: 100 },
      { type: "inside", yAxisIndex: 0, start: 0, end: 100 },
    ],
    animation: false,
    progressive: 5000,
  };

  const onChartEvents = {
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
          <div style={chipStyle}>{validForceData.length} series</div>
          <div style={unitChipStyle}>X: {xUnit}</div>
          <div style={unitChipStyle}>Y: {yUnit}</div>
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