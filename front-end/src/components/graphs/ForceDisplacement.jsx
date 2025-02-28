// GraphComponent.jsx
import React from "react";
import ReactECharts from "echarts-for-react";

const ForceDisplacement = ({ forceData, domainRange }) => {
  const chartOptions = {
    title: { text: "Force vs Z (Live)", left: "center" },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: "Z",
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange.xMin,
      max: domainRange.xMax,
    },
    yAxis: {
      type: "value",
      name: "Force",
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: domainRange.yMin,
      max: domainRange.yMax,
    },
    series: forceData.map((curve) => ({
      name: curve.curve_id,
      type: "line",
      smooth: false,
      showSymbol: false,
      large: true,
      data: curve.x.map((x, i) => [x, curve.y[i]]) || [],
    })),
    legend: { show: false, bottom: 0 },
    grid: { left: "10%", right: "10%", bottom: "5%" },
    animation: false,
    progressive: 5000,
  };

  return (
    <div style={{ flex: 1 }}>
      <h2>Force vs Z (Live)</h2>
      <ReactECharts
        option={chartOptions}
        style={{ height: 600 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
};
export default ForceDisplacement;