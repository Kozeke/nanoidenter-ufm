import React, { useState, useEffect } from "react";
import ReactECharts from "echarts-for-react";

const ParametersGraph = ({
  forceData = [],
  domainRange = { xMin: 0, xMax: 0, yMin: 0, yMax: 0 },
  setSelectedCurveIds = () => { },
  onCurveSelect = () => { },
  selectedCurveIds = [],
  allFparams = [],
  selectedParameters = [],
  selectedForceModel = "",
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

  console.log("forceData (Parameters):", forceData);
  console.log("allFparams:", allFparams);
  
  // Use the fetched fparams data directly
  const curvesFparamData = allFparams;
   
  console.log("curves_fparam:", curvesFparamData);
  console.log("selectedParameters:", selectedParameters);
  console.log("selectedForceModel:", selectedForceModel);
  
  // Determine if we're dealing with force or elasticity data
  const isForceData = curvesFparamData.length > 0 && curvesFparamData[0].hasOwnProperty('fparam');
  const isElasticityData = curvesFparamData.length > 0 && curvesFparamData[0].hasOwnProperty('elasticity_param');
  
  console.log("isForceData:", isForceData, "isElasticityData:", isElasticityData);
  
  // Debug force model parameters
  if (curvesFparamData.length > 0) {
    console.log("First force param object:", curvesFparamData[0]);
    if (curvesFparamData[0].fparam) {
      console.log("Force param array:", curvesFparamData[0].fparam);
      console.log("Force param length:", curvesFparamData[0].fparam.length);
      console.log("Force param type:", typeof curvesFparamData[0].fparam);
    }
  }

  // Debug elasticity parameters
  if (curvesFparamData.length > 0) {
    console.log("First elasticity param object:", curvesFparamData[0]);
    if (curvesFparamData[0].elasticity_param) {
      console.log("Elasticity param array:", curvesFparamData[0].elasticity_param);
      console.log("Elasticity param length:", curvesFparamData[0].elasticity_param.length);
      
      // Debug for LineMax model specifically
      if (selectedForceModel === "linemax") {
        console.log("LineMax model detected, parameters should be [avg, median, max, min]");
        console.log("E[Pa] should be at index 0:", curvesFparamData[0].elasticity_param[0]);
        console.log("M<E>[Pa] should be at index 1:", curvesFparamData[0].elasticity_param[1]);
        console.log("Emax[Pa] should be at index 2:", curvesFparamData[0].elasticity_param[2]);
        console.log("Emin should be at index 3:", curvesFparamData[0].elasticity_param[3]);
      }
    }
  }

  // Filter and process data based on selected parameters
  const processFparamData = (data, parameters, forceModel) => {
    if (!data || data.length === 0) return [];
    
    // Check if we're dealing with elasticity parameters (different parameter names)
    // Only check for elasticity-specific parameters, not general E[Pa] which can be both
    const isElasticityParams = parameters.some(param => 
      param.includes('E0') || param.includes('Eb') || param.includes('EH') || param.includes('EL') || param.includes('Emax') || param.includes('M<E>') || param.includes('d[nm]') || param.includes('T[nm]') || param.includes('k[Pa/nm]') || param.includes('Emin')
    );
    
    console.log("isElasticityParams:", isElasticityParams, "parameters:", parameters);
    
    return data.map(obj => {
      const result = {
        curve_index: obj.curve_index,
      };
      
      if (isElasticityParams || isElasticityData) {
        // Handle elasticity parameters
        parameters.forEach(param => {
          if (obj.elasticity_param && Array.isArray(obj.elasticity_param)) {
            console.log(`Processing param ${param}, elasticity_param:`, obj.elasticity_param);
            if (param === "E[Pa]" && obj.elasticity_param.length > 0) {
              result.E = obj.elasticity_param[0];
              console.log(`Extracted E[Pa] = ${result.E} from index 0`);
            } else if (param === "E0[Pa]" && obj.elasticity_param.length > 0) {
              result.E0 = obj.elasticity_param[0];
            } else if (param === "Eb[Pa]" && obj.elasticity_param.length > 1) {
              result.Eb = obj.elasticity_param[1];
            } else if (param === "d[nm]" && obj.elasticity_param.length > 2) {
              result.d = obj.elasticity_param[2];
              console.log(`Extracted d[nm] = ${result.d} from index 2`);
            } else if (param === "EH[Pa]" && obj.elasticity_param.length > 0) {
              result.EH = obj.elasticity_param[0];
            } else if (param === "EL[Pa]" && obj.elasticity_param.length > 1) {
              result.EL = obj.elasticity_param[1];
            } else if (param === "T[nm]" && obj.elasticity_param.length > 2) {
              result.T = obj.elasticity_param[2];
            } else if (param === "k[Pa/nm]" && obj.elasticity_param.length > 3) {
              result.k = obj.elasticity_param[3];
            } else if (param === "M<E>[Pa]" && obj.elasticity_param.length > 1) {
              result.ME = obj.elasticity_param[1];
              console.log(`Extracted M<E>[Pa] = ${result.ME} from index 1`);
            } else if (param === "Emax[Pa]" && obj.elasticity_param.length > 2) {
              result.Emax = obj.elasticity_param[2];
              console.log(`Extracted Emax[Pa] = ${result.Emax} from index 2`);
            } else if (param === "Emin" && obj.elasticity_param.length > 3) {
              result.Emin = obj.elasticity_param[3];
              console.log(`Extracted Emin = ${result.Emin} from index 3`);
            }
          }
        });
      } else if (isForceData) {
        // Handle force model parameters (original logic)
        parameters.forEach(param => {
          console.log(`Processing force param ${param}, fparam:`, obj.fparam);
          if (param === "E[Pa]" && obj.fparam && Array.isArray(obj.fparam)) {
            result.E = obj.fparam[0]; // First parameter is E
            console.log(`Extracted E[Pa] = ${result.E} from index 0`);
          } else if (param === "m[N/m]" && obj.fparam && Array.isArray(obj.fparam) && obj.fparam.length > 1) {
            result.m = obj.fparam[1]; // Second parameter is m
            console.log(`Extracted m[N/m] = ${result.m} from index 1`);
          } else if (param === "E[Pa]" && typeof obj.fparam === 'number') {
            result.E = obj.fparam; // Single parameter case
            console.log(`Extracted E[Pa] = ${result.E} (single parameter)`);
          }
        });
      }
      
      return result;
    }).filter(obj => {
      // Only include objects that have at least one selected parameter
      return parameters.some(param => {
        if (isElasticityParams || isElasticityData) {
          // Check elasticity parameters
          if (param === "E[Pa]" || param === "E0[Pa]") return obj.E !== undefined || obj.E0 !== undefined;
          if (param === "Eb[Pa]") return obj.Eb !== undefined;
          if (param === "d[nm]") return obj.d !== undefined;
          if (param === "EH[Pa]") return obj.EH !== undefined;
          if (param === "EL[Pa]") return obj.EL !== undefined;
          if (param === "T[nm]") return obj.T !== undefined;
          if (param === "k[Pa/nm]") return obj.k !== undefined;
          if (param === "M<E>[Pa]") return obj.ME !== undefined;
          if (param === "Emax[Pa]") return obj.Emax !== undefined;
          if (param === "Emin") return obj.Emin !== undefined;
        } else {
          // Check force parameters
          if (param === "E[Pa]") return obj.E !== undefined;
          if (param === "m[N/m]") return obj.m !== undefined;
        }
        return false;
      });
    });
  };

  const processedData = processFparamData(curvesFparamData, selectedParameters, selectedForceModel);
  console.log("processedData:", processedData);

  // Create series for each selected parameter
  const createSeries = (data, parameters) => {
    // Check if we're dealing with elasticity parameters
    // Only check for elasticity-specific parameters, not general E[Pa] which can be both
    const isElasticityParams = parameters.some(param => 
      param.includes('E0') || param.includes('Eb') || param.includes('EH') || param.includes('EL') || param.includes('Emax') || param.includes('M<E>') || param.includes('d[nm]') || param.includes('T[nm]') || param.includes('k[Pa/nm]') || param.includes('Emin')
    );

    // Define colors for different parameters
    const getParameterColor = (param, index) => {
      if (isElasticityParams || isElasticityData) {
        // Elasticity model colors
        const elasticityColors = {
          'E[Pa]': '#4CAF50',      // Green
          'E0[Pa]': '#2196F3',     // Blue
          'Eb[Pa]': '#FF9800',      // Orange
          'd[nm]': '#9C27B0',      // Purple
          'EH[Pa]': '#F44336',      // Red
          'EL[Pa]': '#00BCD4',      // Cyan
          'T[nm]': '#FF5722',       // Deep Orange
          'k[Pa/nm]': '#795548',    // Brown
          'M<E>[Pa]': '#607D8B',    // Blue Grey
          'Emax[Pa]': '#E91E63',    // Pink
          'Emin': '#3F51B5'         // Indigo
        };
        return elasticityColors[param] || `hsl(${index * 60}, 70%, 50%)`;
      } else {
        // Force model colors
        const forceColors = {
          'E[Pa]': '#4CAF50',       // Green
          'm[N/m]': '#FF9800'       // Orange
        };
        return forceColors[param] || `hsl(${index * 60}, 70%, 50%)`;
      }
    };

    return parameters.map((param, index) => {
      const paramData = data
        .filter(obj => {
          if (isElasticityParams || isElasticityData) {
            // Filter for elasticity parameters
            if (param === "E[Pa]" || param === "E0[Pa]") return obj.E !== undefined || obj.E0 !== undefined;
            if (param === "Eb[Pa]") return obj.Eb !== undefined;
            if (param === "d[nm]") return obj.d !== undefined;
            if (param === "EH[Pa]") return obj.EH !== undefined;
            if (param === "EL[Pa]") return obj.EL !== undefined;
            if (param === "T[nm]") return obj.T !== undefined;
            if (param === "k[Pa/nm]") return obj.k !== undefined;
            if (param === "M<E>[Pa]") return obj.ME !== undefined;
            if (param === "Emax[Pa]") return obj.Emax !== undefined;
            if (param === "Emin") return obj.Emin !== undefined;
          } else {
            // Filter for force parameters
            if (param === "E[Pa]") return obj.E !== undefined;
            if (param === "m[N/m]") return obj.m !== undefined;
          }
          return false;
        })
        .map(obj => {
          let value;
          if (isElasticityParams || isElasticityData) {
            // Get elasticity parameter value
            if (param === "E[Pa]" || param === "E0[Pa]") value = obj.E || obj.E0;
            else if (param === "Eb[Pa]") value = obj.Eb;
            else if (param === "d[nm]") value = obj.d;
            else if (param === "EH[Pa]") value = obj.EH;
            else if (param === "EL[Pa]") value = obj.EL;
            else if (param === "T[nm]") value = obj.T;
            else if (param === "k[Pa/nm]") value = obj.k;
            else if (param === "M<E>[Pa]") value = obj.ME;
            else if (param === "Emax[Pa]") value = obj.Emax;
            else if (param === "Emin") value = obj.Emin;
          } else {
            // Get force parameter value
            value = param === "E[Pa]" ? obj.E : obj.m;
          }
          return [obj.curve_index, value];
        });

      return {
        name: param,
        type: "scatter",
        showSymbol: true,
        symbolSize: 12, // Increased from 8 to 12
        large: true,
        triggerEvent: true,
        itemStyle: {
          color: getParameterColor(param, index),
        },
        data: paramData,
      };
    });
  };

  const series = createSeries(processedData, selectedParameters);
  
  // Calculate domain for all data points
  const allCurveIndices = processedData.map(obj => obj.curve_index);
  
  // Check if we're dealing with elasticity parameters
  // Only check for elasticity-specific parameters, not general E[Pa] which can be both
  const isElasticityParams = selectedParameters.some(param => 
    param.includes('E0') || param.includes('Eb') || param.includes('EH') || param.includes('EL') || param.includes('Emax') || param.includes('M<E>') || param.includes('d[nm]') || param.includes('T[nm]') || param.includes('k[Pa/nm]') || param.includes('Emin')
  );
  
  // Calculate domain for each parameter separately to handle different scales
  const parameterDomains = {};
  selectedParameters.forEach(param => {
    const paramData = processedData.filter(obj => {
      if (isElasticityParams || isElasticityData) {
        if (param === "E[Pa]" || param === "E0[Pa]") return obj.E !== undefined || obj.E0 !== undefined;
        if (param === "Eb[Pa]") return obj.Eb !== undefined;
        if (param === "d[nm]") return obj.d !== undefined;
        if (param === "EH[Pa]") return obj.EH !== undefined;
        if (param === "EL[Pa]") return obj.EL !== undefined;
        if (param === "T[nm]") return obj.T !== undefined;
        if (param === "k[Pa/nm]") return obj.k !== undefined;
        if (param === "M<E>[Pa]") return obj.ME !== undefined;
        if (param === "Emax[Pa]") return obj.Emax !== undefined;
        if (param === "Emin") return obj.Emin !== undefined;
      } else {
        if (param === "E[Pa]") return obj.E !== undefined;
        if (param === "m[N/m]") return obj.m !== undefined;
      }
      return false;
    }).map(obj => {
      if (isElasticityParams || isElasticityData) {
        if (param === "E[Pa]" || param === "E0[Pa]") return obj.E || obj.E0;
        if (param === "Eb[Pa]") return obj.Eb;
        if (param === "d[nm]") return obj.d;
        if (param === "EH[Pa]") return obj.EH;
        if (param === "EL[Pa]") return obj.EL;
        if (param === "T[nm]") return obj.T;
        if (param === "k[Pa/nm]") return obj.k;
        if (param === "M<E>[Pa]") return obj.ME;
        if (param === "Emax[Pa]") return obj.Emax;
        if (param === "Emin") return obj.Emin;
      } else {
        return param === "E[Pa]" ? obj.E : obj.m;
      }
    }).filter(val => val !== undefined);
    
    if (paramData.length > 0) {
      parameterDomains[param] = {
        min: Math.min(...paramData),
        max: Math.max(...paramData),
        range: Math.max(...paramData) - Math.min(...paramData)
      };
    }
  });
  
  // Find the parameter with the largest range to use for scaling
  let largestRangeParam = null;
  let largestRange = 0;
  Object.keys(parameterDomains).forEach(param => {
    if (parameterDomains[param].range > largestRange) {
      largestRange = parameterDomains[param].range;
      largestRangeParam = param;
    }
  });
  
  // Use all selected parameters' values for scaling, not just the largest range parameter
  const allParamValues = processedData.flatMap(obj => {
    const values = [];
    if (isElasticityParams || isElasticityData) {
      if (obj.E !== undefined) values.push(obj.E);
      if (obj.E0 !== undefined) values.push(obj.E0);
      if (obj.Eb !== undefined) values.push(obj.Eb);
      if (obj.d !== undefined) values.push(obj.d);
      if (obj.EH !== undefined) values.push(obj.EH);
      if (obj.EL !== undefined) values.push(obj.EL);
      if (obj.T !== undefined) values.push(obj.T);
      if (obj.k !== undefined) values.push(obj.k);
      if (obj.ME !== undefined) values.push(obj.ME);
      if (obj.Emax !== undefined) values.push(obj.Emax);
      if (obj.Emin !== undefined) values.push(obj.Emin);
    } else {
      if (obj.E !== undefined) values.push(obj.E);
      if (obj.m !== undefined) values.push(obj.m);
    }
    return values;
  });

  const xScaleFactor = getScaleFactor(domainRange.xMin, allCurveIndices);
  const yScaleFactor = getScaleFactor(domainRange.yMin, allParamValues);

  // Calculate proper y-axis domain from parameter values
  const yMin = allParamValues.length > 0 ? Math.min(...allParamValues) : 0;
  const yMax = allParamValues.length > 0 ? Math.max(...allParamValues) : 1;
  const yRange = yMax - yMin;
  
  // Add some padding to the y-axis range
  const yPadding = yRange * 0.1;
  const adjustedYMin = yMin - yPadding;
  const adjustedYMax = yMax + yPadding;

  const xScaledRange = (domainRange.xMax - domainRange.xMin) * xScaleFactor;
  const xDecimals = xScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(xScaledRange / 10))) : 0;

  const yScaledRange = yRange * yScaleFactor;
  const yDecimals = yScaledRange > 0 ? Math.max(0, Math.ceil(-Math.log10(yScaledRange / 10))) : 0;

  const xExponent = Math.log10(xScaleFactor);
  const xUnit = xExponent === 0 ? 'Curve Index' : `×10^{-${Math.round(xExponent)}} Curve Index`;

  const yExponent = Math.log10(yScaleFactor);
  const yUnit = yExponent === 0 ? 'Parameter Value' : `×10^{-${Math.round(yExponent)}} Parameter Value`;

  const chartOptions = {
    tooltip: { 
      trigger: "axis",
      formatter: function(params) {
        const data = params[0];
        return `Curve Index: ${data.value[0]}<br/>Parameter Value: ${data.value[1].toFixed(4)}`;
      }
    },
    xAxis: {
      type: "value",
      name: `Curve Index`,
      nameLocation: "middle",
      nameGap: 25,
      min: allCurveIndices.length > 0 ? Math.min(...allCurveIndices) - 0.5 : 0,
      max: allCurveIndices.length > 0 ? Math.max(...allCurveIndices) + 0.5 : 10,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(0);
        },
      },
    },
    yAxis: {
      type: "value",
      name: `Parameter Value`,
      nameLocation: "middle",
      nameGap: 40,
      scale: true,
      min: adjustedYMin,
      max: adjustedYMax,
      axisLabel: {
        formatter: function (value) {
          return value.toFixed(yDecimals);
        },
      },
    },
    series: series,

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
      console.log("Chart click event (Parameters):", {
        componentType: params.componentType,
        seriesType: params.seriesType,
        seriesIndex: params.seriesIndex,
        name: params.name,
        value: params.value,
      });
      if (params.componentType === "series") {
        const curveIndex = params.value[0];
        const fparamValue = params.value[1];
        
        console.log("Selected parameter point:", {
          curve_index: curveIndex,
          fparam: fparamValue,
        });
        
        // You can add selection logic here if needed
        if (onCurveSelect) {
          onCurveSelect({
            curve_index: curveIndex,
            fparam: fparamValue,
          });
        }
      }
    },
  };

  return (
    <div style={{ flex: 1, height: "100%" }}>
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

export default ParametersGraph; 