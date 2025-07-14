import React, { useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";

const ElasticitySpectra = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => {},
  onCurveSelect = () => {},
  selectedCurveIds = [],
  graphType = "line",
}) => {
  // Track window height for responsive chart
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const validForceData = Array.isArray(forceData)
    ? forceData.map((curve) => ({
        ...curve,
        curve_id: curve?.curve_id ? String(curve.curve_id) : "Unknown Curve",
        x: Array.isArray(curve?.x) ? curve.x : [],
        y: Array.isArray(curve?.y) ? curve.y : [],
      }))
    : [];
  console.log("forceData (Elasticity):", JSON.stringify(validForceData, null, 2));

  const xData = validForceData.length > 0 && validForceData[0]?.x.length > 0 ? validForceData[0].x : [];
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData);
  const yScaleFactor = getScaleFactor(domainRange.yMin);

  const xScaledRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor;
  const xDecimals = xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0;

  const yScaledRange = (domainRange.yMax - domainRange.yMin) * yScaleFactor;
  const yDecimals = yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0;

  const xExponent = Math.log10(xScaleFactor);
  const xUnit = xExponent === 0 ? 'm' : `×10^{-${Math.round(xExponent)}} m`;

  const yExponent = Math.log10(yScaleFactor);
  const yUnit = yExponent === 0 ? 'Pa' : `×10^{-${Math.round(yExponent)}} Pa`;

  const chartOptions = {
    tooltip: { trigger: "axis" },
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
      name: `E (${yUnit})`,
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
    series: validForceData.map((curve) => ({
      name: curve.curve_id,
      type: graphType,
      smooth: graphType === "line" ? false : undefined,
      showSymbol: graphType === "scatter" ? true : false,
      symbolSize: graphType === "scatter" ? 4 : undefined,
      large: true,
      triggerEvent: true,
      data:
        (selectedCurveIds.length === 0 || selectedCurveIds.includes(curve.curve_id)) &&
        Array.isArray(curve.x) &&
        Array.isArray(curve.y) &&
        curve.x.length === curve.y.length
          ? curve.x.map((x, i) => [
              x * xScaleFactor,
              curve.y[i] !== undefined ? curve.y[i] * yScaleFactor : 0,
            ])
          : [],
    })),
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
  };

  const onChartEvents = {
    click: (params) => {
      console.log("Chart click event (Elasticity):", {
        componentType: params.componentType,
        seriesType: params.seriesType,
        seriesIndex: params.seriesIndex,
        name: params.name,
      });
      if (params.componentType === "series") {
        const curveIndex = params.seriesIndex;
        const selectedCurve = validForceData[curveIndex];
        console.log("Selected curve (Elasticity):", {
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
    },
  };

  return (
    <div style={{ flex: 1, height: "100%" }}>
      {/* <h2
        style={{
          margin: "0 0 5px 0",
          fontSize: isMobile ? "14px" : "16px",
          color: "#333",
        }}
      >
        Elasticity Spectra
      </h2> */}
      <ReactECharts
        option={chartOptions}
        style={{ height: chartHeight, width: "100%" }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
        onEvents={onChartEvents}
      />
    </div>
  );
};

export default ElasticitySpectra;