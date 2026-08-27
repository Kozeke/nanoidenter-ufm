// Dataset metadata field definitions aligned with barytech HDF5 export / tip attrs.

// Scale factors: display value = stored SI value × storageScale.
export const METERS_TO_MICROMETERS = 1e6;
export const METERS_TO_MILLIMETERS = 1e3;

// Probe tip shapes supported in HDF5 tip geometry metadata.
export const TIP_GEOMETRY_OPTIONS = ["sphere", "cone", "cylinder", "pyramid"];

// Editable metadata fields shown in the dataset preview modal (labels include units).
export const DATASET_METADATA_FIELDS = [
  {
    key: "velocity",
    label: "Velocity (µm/s)",
    inputType: "number",
    storageScale: METERS_TO_MICROMETERS,
  },
  {
    key: "force_scale_to_n",
    label: "Force conversion coefficient (mN/V)",
    inputType: "number",
  },
  {
    key: "z_scale_to_m",
    label: "Z conversion factor (raw Z × this → m)",
    inputType: "number",
  },
  {
    key: "spring_constant",
    label: "Spring constant (N/m)",
    inputType: "number",
  },
  {
    key: "sensor_type",
    label: "Sensor type",
    inputType: "text",
  },
  {
    key: "tip_geometry",
    label: "Probe tip shape",
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
];

/** Convert stored metadata values to form strings for display/editing. */
export const metadataToFormValues = (metadata = {}) => {
  const formValues = {};
  DATASET_METADATA_FIELDS.forEach(({ key, inputType, storageScale, options }) => {
    const stored = metadata[key];
    if (stored == null || stored === "") {
      formValues[key] = "";
      return;
    }
    if (inputType === "select") {
      const normalized = String(stored).toLowerCase();
      formValues[key] = options?.includes(normalized) ? normalized : normalized;
      return;
    }
    if (inputType === "number" && storageScale) {
      formValues[key] = String(Number(stored) * storageScale);
      return;
    }
    formValues[key] = String(stored);
  });
  return formValues;
};

/** Build API payload from form values, converting display units back to stored SI. */
export const formValuesToMetadataPayload = (formValues, currentMetadata = {}) => {
  const payload = {};
  DATASET_METADATA_FIELDS.forEach(({ key, inputType, storageScale }) => {
    const raw = formValues[key];
    if (raw === "" || raw == null) return;

    let nextValue = inputType === "number" ? Number(raw) : raw;
    if (inputType === "number" && Number.isNaN(nextValue)) {
      return;
    }
    if (inputType === "number" && storageScale) {
      nextValue = nextValue / storageScale;
    }

    const currentValue = currentMetadata[key];
    const changed =
      inputType === "number"
        ? Number(currentValue) !== nextValue
        : String(currentValue ?? "") !== String(nextValue);
    if (changed) {
      payload[key] = nextValue;
    }
  });
  return payload;
};
