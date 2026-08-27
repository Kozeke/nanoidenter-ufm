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

// Returns the unit symbol as-is (no ×10^n prefix on axis labels).
export function formatScaledUnit(_displayPower, unitSymbol) {
  return unitSymbol;
}

// Wraps a quantity label with its unit for axis titles.
export function formatAxisQuantityLabel(quantityLabel, _displayPower, unitSymbol) {
  return `${quantityLabel} (${unitSymbol})`;
}

// Returns ECharts axisLabel config with shared tick typography.
export function buildValueAxisTickLabel(formatter) {
  return {
    ...CHART_AXIS_TICK_STYLE,
    formatter,
  };
}
