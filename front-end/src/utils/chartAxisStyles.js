// Shared ECharts axis typography helpers for dashboard scientific plots.

// Tick label styling applied to numeric axis values.
export const CHART_AXIS_TICK_STYLE = {
  fontSize: 14,
  fontWeight: 500,
  color: "#1d1e2c",
};

// Axis title styling applied to quantity + unit labels.
export const CHART_AXIS_NAME_TEXT_STYLE = {
  fontSize: 16,
  fontWeight: 700,
  color: "#1d1e2c",
};

// Builds a readable scale prefix like "×10^-3 mm" instead of tiny Unicode superscripts.
export function formatScaledUnit(displayPower, unitSymbol) {
  if (!displayPower) return unitSymbol;
  return `×10^${displayPower} ${unitSymbol}`;
}

// Wraps a quantity label with its (possibly scaled) unit for axis titles.
export function formatAxisQuantityLabel(quantityLabel, displayPower, unitSymbol) {
  return `${quantityLabel} (${formatScaledUnit(displayPower, unitSymbol)})`;
}

// Returns ECharts axisLabel config with shared tick typography.
export function buildValueAxisTickLabel(formatter) {
  return {
    ...CHART_AXIS_TICK_STYLE,
    formatter,
  };
}
