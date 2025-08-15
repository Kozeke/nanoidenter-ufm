import React, { useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";

const ForceIndentationDataSet = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => { },
  onCurveSelect = () => { },
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
  console.log("forceData", forceData)
  
  // Handle the structure where forceData is the curves object containing curves_cp and curves_fparam
  const validForceData = forceData || {};
  const curvesData = forceData || {};
  
  // Extract curves_cp and curves_fparam from the curves object
  const curvesCpData = curvesData.curves_cp || [];
  const curvesFparamData = curvesData.curves_fparam || [];
  
  // Combine both types of curves for processing
  const allCurves = [...curvesCpData, ...curvesFparamData];
  
  console.log("forceData (Indentation):", validForceData);
  console.log("curves_cp:", curvesCpData);
  console.log("curves_fparam:", curvesFparamData);

  const xData = allCurves.length > 0 && allCurves[0]?.x.length > 0 ? allCurves[0].x : [];
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData);
  const yScaleFactor = getScaleFactor(domainRange.yMin);

  const xScaledRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor;
  const xDecimals = xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0;

  const yScaledRange = (domainRange.yMax - domainRange.yMin) * yScaleFactor;
  const yDecimals = yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0;

  const xExponent = Math.log10(xScaleFactor);
  const xUnit = xExponent === 0 ? 'm' : `×10^{-${Math.round(xExponent)}} m`;

  const yExponent = Math.log10(yScaleFactor);
  const yUnit = yExponent === 0 ? 'N' : `×10^{-${Math.round(yExponent)}} N`;

  const chartOptions = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: `Indentation (${xUnit})`,
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
    series: [
      // curves_cp as line series
      ...curvesCpData.map((curve) => ({
        name: curve.curve_id,
        type: "line",
        smooth: false,
        showSymbol: false,
        large: true,
        triggerEvent: true,
        itemStyle: {
          color: curve.curve_id.includes('_hertz') ? 'yellow' : undefined,
        },
        lineStyle: {
          width: curve.curve_id.includes('_hertz') ? 5 : 1.5,
        },
        data: (() => {
          let showCurve =
            (selectedCurveIds.length === 0 || selectedCurveIds.includes(curve.curve_id)) &&
            Array.isArray(curve.x) &&
            Array.isArray(curve.y) &&
            curve.x.length === curve.y.length;

          if (!showCurve && curve.curve_id.includes('_hertz')) {
            const base = curve.curve_id.replace('_hertz', '');
            const mainId = `curve${base}`;
            showCurve =
              selectedCurveIds.includes(mainId) &&
              Array.isArray(curve.x) &&
              Array.isArray(curve.y) &&
              curve.x.length === curve.y.length;
          }

          return showCurve
            ? curve.x.map((x, i) => [
              x * xScaleFactor,
              curve.y[i] !== undefined ? curve.y[i] * yScaleFactor : 0,
            ])
            : [];
        })(),
      })),
             // curves_fparam as scatter series
       ...curvesFparamData.map((fparamObj) => {
         // Find the corresponding curve in curves_cp to get the x-coordinate
         const curveIndex = fparamObj.curve_index;
         const correspondingCurve = curvesCpData[curveIndex];
         
         if (!correspondingCurve) return null;
         
         // Use the middle point of the curve for x-coordinate, or a specific point
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
           itemStyle: {
             color: '#ff6b6b', // Red color for fparam points
           },
           data: (() => {
             let showPoint = selectedCurveIds.length === 0 || 
                           selectedCurveIds.includes(correspondingCurve.curve_id);
             
             return showPoint ? [[xValue * xScaleFactor, yValue * yScaleFactor]] : [];
           })(),
         };
       }).filter(Boolean), // Remove null entries
    ],

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
      {/* <h2
        style={{
          margin: "0 0 5px 0",
          fontSize: isMobile ? "14px" : "16px",
          color: "#333",
        }}
      >
        Force vs Indentation
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

export default ForceIndentationDataSet;