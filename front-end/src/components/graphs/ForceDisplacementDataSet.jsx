import React, { useState } from "react";
import ReactECharts from "echarts-for-react";

const ForceDisplacementDataSet = ({
  forceData,
  domainRange,
  onCurveSelect,
  setSelectedCurveIds,
  selectedCurveIds,
  graphType,
}) => {

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

  console.log("forceData:", JSON.stringify(forceData, null, 2));

  const xData = forceData.length > 0 ? forceData[0].x : [];
  const xScaleFactor = getScaleFactor(domainRange.xMin, xData);
  const yScaleFactor = getScaleFactor(domainRange.yMin);


  const onChartEvents = {
    click: (params) => {
      console.log("Chart click event:", {
        componentType: params.componentType,
        seriesType: params.seriesType,
        seriesIndex: params.seriesIndex,
        name: params.name,
      });
      if (params.componentType === "series") {
        const curveIndex = params.seriesIndex;
        const selectedCurve = forceData[curveIndex];
        console.log("Selected curve:", {
          curve_id: selectedCurve?.curve_id,
          x: selectedCurve?.x?.slice(0, 5),
          y: selectedCurve?.y?.slice(0, 5),
        });
        if (selectedCurve) {
          setSelectedCurveIds([selectedCurve.curve_id]);
          if (onCurveSelect) {
            const curveIdInt = parseInt(
              selectedCurve.curve_id.replace("curve", ""),
              10
            );
            onCurveSelect({
              curve_id: isNaN(curveIdInt) ? selectedCurve.curve_id : curveIdInt,
              x: selectedCurve.x,
              y: selectedCurve.y,
            });
          }
        }
      }
    },
  };

  const chartOptions = {
    // title: { text: "Force-displacement (data set)", left: "center" },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "value",
      name: `Z (x10^-${Math.log10(xScaleFactor)} m)`,
      nameLocation: "middle",
      nameGap: 25,
      min: domainRange.xMin * xScaleFactor,
      max: domainRange.xMax * xScaleFactor,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0);
        },
      },
    },
    yAxis: {
      type: "value",
      name: `Force (x10^-${Math.log10(yScaleFactor)} N)`,
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: domainRange.yMin * yScaleFactor,
      max: domainRange.yMax * yScaleFactor,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0);
        },
      },
    },
    series: forceData.map((curve) => ({
      name: curve.curve_id,
      type: graphType, // Dynamic graph type
      smooth: graphType === "line" ? false : undefined,
      showSymbol: graphType === "scatter" ? true : false,
      symbolSize: graphType === "scatter" ? 4 : undefined,
      large: true,
      triggerEvent: true,
      data:
        selectedCurveIds.length === 0 || selectedCurveIds.includes(curve.curve_id)
          ? curve.x.map((x, i) => [
              x * xScaleFactor,
              curve.y ? curve.y[i] * yScaleFactor : 0,
            ])
          : [],
    })),
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
  };

  return (
    <div style={{ flex: 1 }}>

      <ReactECharts
        option={chartOptions}
        style={{ height: 500 }}
        notMerge={true}
        opts={{ renderer: "canvas" }}
        onEvents={onChartEvents}
      />
    </div>
  );
};

export default ForceDisplacementDataSet;