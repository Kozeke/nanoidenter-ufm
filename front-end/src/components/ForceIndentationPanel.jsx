// Renders the Force–Indentation tab panel with optional parameters graph side-by-side.
import React from "react";
import ForceIndentationDataSet from "./graphs/ForceIndentationDataSet";
import ParametersGraph from "./graphs/ParametersGraph";

const ForceIndentationPanel = ({
  chartContainerStyle,
  indentationData,
  indentationDomain,
  graphType,
  onGraphTypeChange,
  selectedCurveIds,
  setSelectedCurveIds,
  onCurveSelect,
  showParameters,
  selectedForceModel,
  allFparams,
  selectedParameters,
  onParameterChange,
  isSingleCurveMode,
}) => {
  // Determines outer container layout based on whether parameters panel is visible.
  const outerStyle = showParameters
    ? { display: "flex", gap: "10px", height: "100%" }
    : chartContainerStyle;

  // Determines main chart container style based on parameters panel visibility.
  const mainChartStyle = showParameters
    ? { flex: 1, ...chartContainerStyle }
    : {};

  return (
    <div style={outerStyle}>
      <div style={mainChartStyle}>
        <ForceIndentationDataSet
          forceData={indentationData}
          domainRange={indentationDomain}
          setSelectedCurveIds={setSelectedCurveIds}
          onCurveSelect={onCurveSelect}
          selectedCurveIds={selectedCurveIds}
          graphType={graphType}
          onGraphTypeChange={onGraphTypeChange}
          isSingleCurveMode={isSingleCurveMode}
          selectedForceModel={selectedForceModel}
        />
      </div>

      {showParameters && selectedForceModel && (
        <div style={{ flex: 1, ...chartContainerStyle }}>
          <ParametersGraph
            forceData={indentationData}
            domainRange={indentationDomain}
            setSelectedCurveIds={setSelectedCurveIds}
            onCurveSelect={onCurveSelect}
            selectedCurveIds={selectedCurveIds}
            allFparams={allFparams}
            selectedParameters={selectedParameters}
            selectedForceModel={selectedForceModel}
            onParameterChange={onParameterChange}
          />
        </div>
      )}
    </div>
  );
};

export default ForceIndentationPanel;

