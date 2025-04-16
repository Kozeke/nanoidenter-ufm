import React from "react";
import ReactECharts from "echarts-for-react";

const ElasticitySpectra = ({ forceData, domainRange }) => {
  // Function to determine scale factor based on a min value
  function getScaleFactor(minValue, dataArray = []) {
    if (!minValue && minValue !== 0) return 1; // Handle undefined or null
    if (minValue === 0 && dataArray.length > 0) {
      // If min is 0, find the smallest non-zero value in the data
      const nonZeroValues = dataArray.filter((v) => v > 0);
      if (nonZeroValues.length === 0) return 1; // Fallback if all values are 0
      minValue = Math.min(...nonZeroValues);
    }
    const absMin = Math.abs(minValue);
    const magnitude = Math.floor(Math.log10(absMin));
    return Math.pow(10, -magnitude); // Inverse to scale up (e.g., 1e9 for 1e-9)
  }

  const xData = forceData.length > 0 ? forceData[0].x : []; // Use the first curve's x values
  const xScaleFactor = getScaleFactor(domainRange?.xMin, xData); // Pass x data for non-zero check

  const chartOptions = {
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: `Z (x10^${-Math.log10(xScaleFactor)} m)`, // Reflect the scale factor in the unit
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange?.xMin ? domainRange.xMin * xScaleFactor : undefined, // Scale the domain min
      max: domainRange?.xMax ? domainRange.xMax * xScaleFactor : undefined, // Scale the domain max
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0); // Display as whole numbers
        },
      },
    },
    yAxis: {
      type: "value",
      name: "E (Pa)", // No scale factor in the unit
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: domainRange?.yMin, // Use raw domain min
      max: domainRange?.yMax, // Use raw domain max
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0); // Display as whole numbers
        },
      },
    },
    series: forceData.map((curve) => ({
      name: curve.curve_id,
      type: "line",
      smooth: false,
      showSymbol: false,
      large: true,
      data: curve.x.map((x, i) => [x * xScaleFactor, curve.y[i]]) || [], // Only scale x
    })),
    legend: { show: false, bottom: 0 },
    grid: { left: "12%", right: "10%", bottom: "15%", top: "10%" }, // Adjusted for sliders
    dataZoom: [
      {
        type: "slider", // X-axis slider
        xAxisIndex: 0,
        show: true,
        startValue: domainRange?.xMin ? domainRange.xMin * xScaleFactor : undefined,
        endValue: domainRange?.xMax ? domainRange.xMax * xScaleFactor : undefined,
        bottom: 10, // Position below chart
        height: 20,
      },
      {
        type: "slider", // Y-axis slider
        yAxisIndex: 0,
        show: true,
        startValue: domainRange?.yMin,
        endValue: domainRange?.yMax,
        right: 10, // Position to the right
        width: 20,
      },
      {
        type: "inside", // X-axis wheel/pinch zoom
        xAxisIndex: 0,
        disabled: false,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true, // Enable panning
        startValue: domainRange?.xMin ? domainRange.xMin * xScaleFactor : undefined,
        endValue: domainRange?.xMax ? domainRange.xMax * xScaleFactor : undefined,
      },
      {
        type: "inside", // Y-axis wheel/pinch zoom
        yAxisIndex: 0,
        disabled: false,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true, // Enable panning
        startValue: domainRange?.yMin,
        endValue: domainRange?.yMax,
      },
    ],
    animation: false,
    progressive: 5000,
  };

  return (
    <div style={{ flex: 1 }}>
      <ReactECharts
        option={chartOptions}
        style={{ height: 500 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
};

export default ElasticitySpectra;