// Metadata fields shown in the file-opener final step (load-experiment workflow).

export const METERS_TO_MICROMETERS = 1e6;
export const METERS_TO_MILLIMETERS = 1e3;

// Probe tip shapes supported in imported HDF5 tip groups.
export const TIP_GEOMETRY_OPTIONS = ["sphere", "cone", "cylinder", "pyramid"];

// Visible metadata fields in step 4 (labels include units where applicable).
export const VISIBLE_FILE_OPENER_METADATA_FIELDS = [
  // "Geometry" is a duplicate of "Tip geometry" below (they are kept in sync as
  // aliases in applyDisplayValueToMetadata/normalizeTipAttributes for backend
  // compatibility), so the redundant free-text input is hidden from the UI.
  // { key: "geometry", label: "Geometry", inputType: "text" },
  {
    key: "tip_geometry",
    label: "Tip geometry",
    inputType: "select",
    options: TIP_GEOMETRY_OPTIONS,
  },
  {
    key: "tip_radius",
    label: "Tip radius (mm)",
    inputType: "number",
    storageScale: METERS_TO_MILLIMETERS,
  },
  {
    key: "tip_angle",
    label: "Tip angle (deg)",
    inputType: "number",
  },
  {
    key: "spring_constant",
    label: "Spring constant (N/m)",
    inputType: "number",
  },
  { key: "sensor_type", label: "Sensor type", inputType: "text" },
  {
    key: "velocity",
    label: "Velocity (µm/s)",
    inputType: "number",
    storageScale: METERS_TO_MICROMETERS,
  },
];

// Metadata keys kept for backend processing but hidden from the final UI step.
export const HIDDEN_FILE_OPENER_METADATA_KEYS = [
  "file_id",
  "date",
  "z_scale_to_m",
  "force_scale_to_n",
  "parameter",
  "unit",
  "value",
  "force_conversion_factor",
  "z_conversion_factor",
];

/** Formats an HDF5 attribute value for display in the metadata-location picker. */
export const formatAttributeValueForDisplay = (value) => {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Reads group attributes from either the group shell or nested groups map. */
export const getGroupAttributes = (group = {}) => {
  const directAttributes = group.attributes || {};
  const nestedAttributes = group.groups?.attributes || {};
  return Object.keys(directAttributes).length > 0
    ? directAttributes
    : nestedAttributes;
};

/** Normalize HDF5 tip attribute names to canonical metadata keys. */
export const normalizeTipAttributes = (attributes = {}) => {
  const normalized = { ...attributes };

  if (normalized.geometry && !normalized.tip_geometry) {
    normalized.tip_geometry = String(normalized.geometry);
  }
  if (normalized.tip_geometry && !normalized.geometry) {
    normalized.geometry = String(normalized.tip_geometry);
  }

  if (
    (normalized.tip_radius == null || normalized.tip_radius === "") &&
    normalized.value != null &&
    normalized.value !== ""
  ) {
    const tipValue = Number(normalized.value);
    const tipUnit = String(normalized.unit || "").toLowerCase();
    if (Number.isFinite(tipValue)) {
      if (tipUnit === "um" || tipUnit === "µm") {
        normalized.tip_radius = tipValue * 1e-6;
      } else if (tipUnit === "mm") {
        normalized.tip_radius = tipValue * 1e-3;
      } else {
        normalized.tip_radius = tipValue;
      }
    }
  }

  if (
    normalized.force_conversion_factor != null &&
    (normalized.force_scale_to_n == null || normalized.force_scale_to_n === "")
  ) {
    normalized.force_scale_to_n = normalized.force_conversion_factor;
  }
  if (
    normalized.z_conversion_factor != null &&
    (normalized.z_scale_to_m == null || normalized.z_scale_to_m === "")
  ) {
    normalized.z_scale_to_m = normalized.z_conversion_factor;
  }

  // Supplies default tip angle when HDF5 metadata omits or leaves it blank.
  if (normalized.tip_angle == null || normalized.tip_angle === "") {
    normalized.tip_angle = 0;
  }

  return normalized;
};

// Number of significant digits kept when converting between storage and
// display units, to avoid surfacing IEEE-754 rounding dust (e.g. converting
// 123 um/s to 0.000123 m/s and back can otherwise yield 123.00000000000001).
const DISPLAY_PRECISION_DIGITS = 12;

/** Rounds a number to a fixed number of significant digits to hide floating-point noise. */
const roundForDisplay = (value) => {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(DISPLAY_PRECISION_DIGITS));
};

/** Convert stored SI metadata to a display string for one visible field. */
export const metadataValueForDisplay = (field, metadata = {}) => {
  const stored = metadata[field.key];
  if (stored == null || stored === "") return "";

  if (field.inputType === "number" && field.storageScale) {
    const numeric = Number(stored);
    return Number.isFinite(numeric)
      ? String(roundForDisplay(numeric * field.storageScale))
      : "";
  }

  return String(stored);
};

/** Apply an edited display value back into stored SI metadata. */
export const applyDisplayValueToMetadata = (field, displayValue, metadata = {}) => {
  const nextMetadata = { ...metadata };

  if (displayValue === "" || displayValue == null) {
    nextMetadata[field.key] = "";
    if (field.key === "tip_geometry") {
      nextMetadata.geometry = "";
    } else if (field.key === "geometry") {
      nextMetadata.tip_geometry = "";
    }
    return nextMetadata;
  }

  if (field.inputType === "number") {
    const numeric = Number(displayValue);
    if (!Number.isFinite(numeric)) {
      return nextMetadata;
    }
    nextMetadata[field.key] = field.storageScale
      ? roundForDisplay(numeric / field.storageScale)
      : numeric;
  } else {
    nextMetadata[field.key] = displayValue;
  }

  if (field.key === "tip_geometry") {
    nextMetadata.geometry = displayValue;
  } else if (field.key === "geometry") {
    nextMetadata.tip_geometry = displayValue;
  }

  return nextMetadata;
};

/** Build the full metadata object used for submit (visible + hidden keys). */
export const buildInitialMetadata = (filePath, attributeKeys = []) => {
  const today = new Date().toISOString().split("T")[0];
  const base = {
    file_id: filePath
      ? filePath.split("/").pop() || filePath.split("\\").pop() || filePath
      : "",
    date: today,
    spring_constant: "",
    tip_geometry: "",
    geometry: "",
    tip_radius: "",
    tip_angle: 0,
    sensor_type: "",
    velocity: "",
    z_scale_to_m: 1.0,
    force_scale_to_n: 1.0,
  };

  attributeKeys.forEach((key) => {
    if (!(key in base)) {
      base[key] = "";
    }
  });

  return base;
};
