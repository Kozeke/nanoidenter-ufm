// Renders the Elasticity Spectra tab panel with optional parameters graph side-by-side.
import React from "react";
import ElasticitySpectra from "./graphs/SpectraElasticity";
import ParametersGraph from "./graphs/ParametersGraph";

const ElasticitySpectraPanel = ({
  chartContainerStyle,
  elspectraData,
  elspectraDomain,
  graphType,
  onGraphTypeChange,
  selectedCurveIds,
  setSelectedCurveIds,
  onCurveSelect,
  showElasticityParameters,
  selectedElasticityModel,
  allElasticityParams,
  selectedElasticityParameters,
  onElasticityParameterChange,
  isSingleCurveMode,
}) => {
  // Determines outer container layout based on whether parameters panel is visible.
  const outerStyle = showElasticityParameters
    ? { display: "flex", gap: "10px", height: "100%" }
    : chartContainerStyle;

  // Determines main chart container style based on parameters panel visibility.
  const mainChartStyle = showElasticityParameters
    ? { flex: 1, ...chartContainerStyle }
    : {};

  // Extracts curves array from elspectraData with fallback to empty array.
  const curves = elspectraData.curves || [];

  return (
    <div style={outerStyle}>
      <div style={mainChartStyle}>
        <ElasticitySpectra
          forceData={curves}
          domainRange={elspectraDomain}
          setSelectedCurveIds={setSelectedCurveIds}
          onCurveSelect={onCurveSelect}
          selectedCurveIds={selectedCurveIds}
          graphType={graphType}
          onGraphTypeChange={onGraphTypeChange}
          isSingleCurveMode={isSingleCurveMode}
          selectedElasticityModel={selectedElasticityModel}
        />
      </div>

      {showElasticityParameters && selectedElasticityModel && (
        <div style={{ flex: 1, ...chartContainerStyle }}>
          <ParametersGraph
            forceData={curves}
            domainRange={elspectraDomain}
            setSelectedCurveIds={setSelectedCurveIds}
            onCurveSelect={onCurveSelect}
            selectedCurveIds={selectedCurveIds}
            allFparams={allElasticityParams}
            selectedParameters={selectedElasticityParameters}
            selectedForceModel={selectedElasticityModel}
            onParameterChange={onElasticityParameterChange}
          />
        </div>
      )}
    </div>
  );
};

export default ElasticitySpectraPanel;

