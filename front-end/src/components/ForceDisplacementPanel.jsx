// Renders the Force–Displacement tab panel with its chart visualization.
import React from "react";
import ForceDisplacementDataSet from "./graphs/ForceDisplacementDataSet";

const ForceDisplacementPanel = ({
  chartContainerStyle,
  forceData,
  domainRange,
  graphType,
  onGraphTypeChange,
  selectedCurveIds,
  setSelectedCurveIds,
  onCurveSelect,
}) => {
  return (
    <div style={chartContainerStyle}>
      <ForceDisplacementDataSet
        forceData={forceData}
        domainRange={domainRange}
        onCurveSelect={onCurveSelect}
        setSelectedCurveIds={setSelectedCurveIds}
        selectedCurveIds={selectedCurveIds}
        graphType={graphType}
        onGraphTypeChange={onGraphTypeChange}
      />
    </div>
  );
};

export default ForceDisplacementPanel;

