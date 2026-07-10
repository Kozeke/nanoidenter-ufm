// Provides shared unit-prefix preferences (nano/micro/milli/none) for all graph panels.
// Any graph that consumes this context will update in sync when the user changes a unit.
import React, { createContext, useContext, useState } from "react";

// Available unit prefix options shared across all graph components.
// Each entry carries:
//   factor   – SI multiplier to convert raw SI values into this unit scale
//   prefix   – metric prefix string used by each graph to build its own Y-axis symbol
//   xSymbol  – display symbol for the X axis (always metres-based, i.e. displacement)
export const UNIT_OPTIONS = [
  { value: "nano",  factor: 1e9, prefix: "n", xSymbol: "nm" },
  { value: "micro", factor: 1e6, prefix: "µ", xSymbol: "µm" },
  { value: "milli", factor: 1e3, prefix: "m", xSymbol: "mm" },
  { value: "none",  factor: 1,   prefix: "",  xSymbol: "m"  },
];

// React context that stores selected unit prefixes for X and Y axes
const UnitPreferencesContext = createContext(null);

// Provider: place this above any component tree that contains graph panels
export const UnitPreferencesProvider = ({ children }) => {
  // Default X axis prefix: micro (µm) — typical displacement scale for nanoindentation
  const [xUnitPrefix, setXUnitPrefix] = useState("micro");
  // Default Y axis prefix: micro (µN / µPa) — comfortable scale for typical force/modulus values
  const [yUnitPrefix, setYUnitPrefix] = useState("micro");

  return (
    <UnitPreferencesContext.Provider
      value={{ xUnitPrefix, setXUnitPrefix, yUnitPrefix, setYUnitPrefix }}
    >
      {children}
    </UnitPreferencesContext.Provider>
  );
};

// Hook to read and write unit preferences; throws if used outside a provider
export const useUnitPreferences = () => {
  const ctx = useContext(UnitPreferencesContext);
  if (!ctx) {
    // Prevent cryptic errors when provider is accidentally omitted
    throw new Error("useUnitPreferences must be used inside <UnitPreferencesProvider>");
  }
  return ctx;
};
