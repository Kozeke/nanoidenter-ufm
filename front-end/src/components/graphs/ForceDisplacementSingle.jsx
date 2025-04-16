// // GraphComponent.jsx
// import React from "react";
// import ReactECharts from "echarts-for-react";

// const ForceDisplacementSingle = ({ forceData, domainRange }) => {
//   // Function to determine scale factor based on a min value
//   function getScaleFactor(minValue, dataArray = []) {
//     if (!minValue && minValue !== 0) return 1; // Handle undefined or null
//     if (minValue === 0 && dataArray.length > 0) {
//       const nonZeroValues = dataArray.filter((v) => v > 0);
//       if (nonZeroValues.length === 0) return 1; // Fallback if all values are 0
//       minValue = Math.min(...nonZeroValues);
//     }
//     const absMin = Math.abs(minValue);
//     const magnitude = Math.floor(Math.log10(absMin));
//     return Math.pow(10, -magnitude); // Inverse to scale up (e.g., 1e9 for 1e-9)
//   }

//   const xData = forceData.length > 0 ? forceData[0].x : []; // Use the first curve's x values
//   const xScaleFactor = getScaleFactor(domainRange.xMin, xData); // Pass x data for non-zero check
//   const yScaleFactor = getScaleFactor(domainRange.yMin);

//   // Calculate the center of the x-axis range after scaling
//   const xCenter = ((domainRange.xMin + domainRange.xMax) / 2) * xScaleFactor;
//   const xRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor; // Full range for normalization

//   const chartOptions = {
//     title: { text: "Force-displacement (single)", left: "center" },
//     tooltip: { trigger: "axis" },
//     xAxis: {
//       type: "value",
//       name: `Z (x10^-${Math.log10(xScaleFactor)} m)`,
//       nameLocation: "middle",
//       nameGap: 25,
//       min: domainRange.xMin * xScaleFactor,
//       max: domainRange.xMax * xScaleFactor,
//       axisLabel: {
//         formatter: function (value) {
//           return value.toFixed(0); // Display as whole numbers
//         },
//       },
//     },
//     yAxis: {
//       type: "value",
//       name: `Force (x10^-${Math.log10(yScaleFactor)} N)`,
//       nameLocation: "middle",
//       nameGap: 40,
//       scale: true,
//       min: domainRange.yMin * yScaleFactor,
//       max: domainRange.yMax * yScaleFactor,
//       axisLabel: {
//         formatter: function (value) {
//           return value.toFixed(0); // Display as whole numbers
//         },
//       },
//     },
//     series: forceData.map((curve) => ({
//       name: curve.curve_id,
//       type: "scatter",
//       symbol: "circle",
//       symbolSize: 10, // Larger bubbles (adjust as needed, e.g., 12, 15)
//       showSymbol: true,
//       large: true,
//       data: curve.x.map((x, i) => [x * xScaleFactor, curve.y[i] * yScaleFactor]) || [],
//       itemStyle: {
//         // Radial gradient for color and opacity
//         color: {
//           type: "radial",
//           x: 0.5, // Center of the gradient (normalized)
//           y: 0.5,
//           r: 0.5, // Radius of the gradient (normalized)
//           colorStops: [
//             {
//               offset: 0, // Center
//               color: "rgba(255, 255, 255, 0.5)", // White, 50% transparent
//             },
//             {
//               offset: 1, // Edge
//               color: "rgba(0, 0, 255, 1)", // Blue, fully opaque (outer circle)
//             },
//           ],
//         },
//         // Optional: Dynamic opacity based on x-axis position (can remove if gradient suffices)
//         opacity: (data) => {
//           const xValue = data[0];
//           const distanceFromCenter = Math.abs(xValue - xCenter);
//           const normalizedDistance = distanceFromCenter / (xRange / 2);
//           return 0.3 + 0.5 * normalizedDistance; // Range from 0.3 (center) to 0.8 (edges)
//         },
//       },
//     })),
//     legend: { show: false, bottom: 0 },
//     grid: { left: "12%", right: "10%", bottom: "15%" }, // Adjusted bottom for slider
//     dataZoom: [
//       {
//         type: "slider", // Visible slider for x-axis
//         xAxisIndex: 0, // Apply to xAxis
//         start: 0, // Initial zoom range (0% to 100%)
//         end: 100,
//         height: 20, // Height of the slider
//         bottom: 10, // Position above the bottom edge
//       },
//       {
//         type: "slider", // Visible slider for y-axis
//         yAxisIndex: 0, // Apply to yAxis
//         start: 0,
//         end: 100,
//         width: 20, // Width of the slider
//         right: 10, // Position from the right edge
//       },
//       {
//         type: "inside", // Mouse wheel and pinch-to-zoom
//         xAxisIndex: 0, // Apply to xAxis
//         start: 0,
//         end: 100,
//       },
//       {
//         type: "inside", // Mouse wheel and pinch-to-zoom
//         yAxisIndex: 0, // Apply to yAxis
//         start: 0,
//         end: 100,
//       },
//     ],
//     animation: false,
//     progressive: 5000,
//   };

//   return (
//     <div style={{ flex: 1 }}>
//       <h2>Force vs Z (Single)</h2>
//       <ReactECharts
//         option={chartOptions}
//         style={{ height: 600 }}
//         notMerge={true}
//         opts={{ renderer: "canvas" }}
//       />
//     </div>
//   );
// };

// export default ForceDisplacementSingle;