// GraphComponent.jsx
import React from "react";
import ReactECharts from "echarts-for-react";

const ForceIndentationDataSet = ({ forceData, domainRange }) => {
  function getScaleFactor(minValue, dataArray = []) {
    if (!minValue && minValue !== 0) return 1; // Handle undefined or null
    if (minValue === 0 && dataArray.length > 0) {
        // If min is 0, find the smallest non-zero value in the data
        const nonZeroValues = dataArray.filter(v => v > 0);
        if (nonZeroValues.length === 0) return 1; // Fallback if all values are 0
        minValue = Math.min(...nonZeroValues);
    }
    const absMin = Math.abs(minValue);
    const magnitude = Math.floor(Math.log10(absMin));
    return Math.pow(10, -magnitude); // Inverse to scale up (e.g., 1e9 for 1e-9)
  }

  const xData = forceData.length > 0 ? forceData[0].x : []; // Use the first curve's x values
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData); // Pass x data for non-zero check
  const yScaleFactor = getScaleFactor(domainRange.yMin); 

  const chartOptions = {
    title: { text: "Force Indentation (Data set)", left: "center" },
    tooltip: { trigger: "axis" },
    xAxis: {
        type: "value",
        name: `Z (x10^-${Math.log10(xScaleFactor)} m)`, // Reflect the scale factor in the unit
        nameLocation: "middle",
        nameGap: 25,
        min: domainRange.xMin * xScaleFactor, // Scale the domain min
        max: domainRange.xMax * xScaleFactor, // Scale the domain max
        axisLabel: {
            formatter: function (value) {
                return value.toFixed(0); // Display as whole numbers
            }
        }
    },
    yAxis: {
        type: "value",
        name: `Force (x10^-${Math.log10(yScaleFactor)} N)`, // Reflect the scale factor in the unit
        nameLocation: "middle",
        nameGap: 40,
        scale: true,
        min: domainRange.yMin * yScaleFactor, // Scale the domain min
        max: domainRange.yMax * yScaleFactor, // Scale the domain max
        axisLabel: {
            formatter: function (value) {
                return value.toFixed(0); // Display as whole numbers
            }
        }
    },
    series: forceData.map((curve) => ({
        name: curve.curve_id,
        type: "line",
        smooth: false,
        showSymbol: false,
        large: true,
        data: curve.x.map((x, i) => [x * xScaleFactor, curve.y[i] * yScaleFactor]) || [], // Apply different scales
    })),
    legend: { show: false, bottom: 0 },
    grid: { left: "12%", right: "10%", bottom: "10%" },
    animation: false,
    progressive: 5000,
  };

  return (
    <div style={{ flex: 1 }}>
      <h2>Force Indentation (Data Set)</h2>
      <ReactECharts
        option={chartOptions}
        style={{ height: 600 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
};
export default ForceIndentationDataSet;