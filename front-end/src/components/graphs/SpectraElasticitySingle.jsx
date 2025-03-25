import React from "react";
import ReactECharts from "echarts-for-react";

const ElasticitySpectra = ({ forceData, domainRange }) => {
  // Function to determine scale factor based on a min value
  function getScaleFactor(minValue, dataArray = []) {
    if (!minValue && minValue !== 0) return 1; // Handle undefined or null
    if (minValue === 0 && dataArray.length > 0) {
      const nonZeroValues = dataArray.filter((v) => v > 0);
      if (nonZeroValues.length === 0) return 1; // Fallback if all values are 0
      minValue = Math.min(...nonZeroValues);
    }
    const absMin = Math.abs(minValue);
    const magnitude = Math.floor(Math.log10(absMin));
    return Math.pow(10, -magnitude); // Inverse to scale up (e.g., 1e9 for 1e-9)
  }

  const xData = forceData.length > 0 ? forceData[0].x : []; // Use the first curve's x values
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData); // Pass x data for non-zero check

  // Calculate the center of the x-axis range after scaling
  const xCenter = ((domainRange.xMin + domainRange.xMax) / 2) * xScaleFactor;
  const xRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor; // Full range for normalization

  const chartOptions = {
    title: { text: "Elasticity Spectra (Single)", left: "center" },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: `Z (x10^${-Math.log10(xScaleFactor)} m)`,
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange.xMin * xScaleFactor,
      max: domainRange.xMax * xScaleFactor,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0); // Display as whole numbers
        },
      },
    },
    yAxis: {
      type: "value",
      name: "E (Pa)",
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: domainRange.yMin,
      max: domainRange.yMax,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0); // Display as whole numbers
        },
      },
    },
    series: forceData.map((curve) => ({
      name: curve.curve_id,
      type: "scatter", // Change to scatter for individual dots
      symbol: "circle", // Use circular points
      symbolSize: 10, // Larger bubbles (adjust as needed, e.g., 12, 15)
      showSymbol: true, // Ensure points are visible
      large: true,
      data: curve.x.map((x, i) => [x * xScaleFactor, curve.y[i]]) || [], // Only scale x
      itemStyle: String(curve.curve_id).endsWith("_elastic")
        ? {
            color: "yellow", // Solid yellow for elastic curves
          }
        : {
            // Radial gradient for non-elastic curves
            color: {
              type: "radial",
              x: 0.5, // Center of the gradient (normalized)
              y: 0.5,
              r: 0.5, // Radius of the gradient (normalized)
              colorStops: [
                {
                  offset: 0, // Center
                  color: "rgba(255, 255, 255, 0.5)", // White, 50% transparent
                },
                {
                  offset: 1, // Edge
                  color: "rgba(0, 0, 255, 1)", // Blue, fully opaque (outer circle)
                },
              ],
            },
          },
    })),
    legend: { show: false, bottom: 0 },
    grid: { left: "12%", right: "10%", bottom: "10%" },
    animation: false,
    progressive: 5000,
  };

  return (
    <div style={{ flex: 1 }}>
      <h2>Elasticity Spectra (Single)</h2>
      <ReactECharts
        option={chartOptions}
        style={{ height: 600 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
};

export default ElasticitySpectra;