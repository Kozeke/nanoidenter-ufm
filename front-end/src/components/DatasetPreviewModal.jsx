// Modal component that previews dataset details before opening or deleting.
import { useEffect, useState } from "react";
import { getDataset, updateDatasetMetadata } from "../api/datasets";
import { useAuthStore } from "../state/useAuthStore";
import {
  DATASET_METADATA_FIELDS,
  formValuesToMetadataPayload,
  metadataToFormValues,
} from "../config/datasetMetadataFields";

// Renders a modal with dataset summary and metadata details.
export default function DatasetPreviewModal({ id, onClose, onOpen }) {
  // Stores auth token required for dataset preview API calls.
  const token = useAuthStore((state) => state.token);
  // Stores loaded dataset payload for the selected dataset ID.
  const [dataset, setDataset] = useState(null);
  // Tracks loading state while dataset preview details are fetched.
  const [loading, setLoading] = useState(true);
  // Stores error text when dataset preview loading fails.
  const [error, setError] = useState(null);
  // Stores editable metadata form values shown inside the preview modal.
  const [editableMetadata, setEditableMetadata] = useState(
    metadataToFormValues({})
  );
  // Tracks save state while metadata updates are being sent to backend.
  const [savingMetadata, setSavingMetadata] = useState(false);
  // Stores metadata-specific validation or request errors.
  const [metadataError, setMetadataError] = useState("");
  // Stores success message after metadata update completes.
  const [metadataSuccess, setMetadataSuccess] = useState("");

  useEffect(() => {
    if (!id || !token) return;
    // Tracks mount status to prevent state updates after unmount.
    let mounted = true;

    // Loads dataset preview details from backend for modal rendering.
    const fetchDataset = async () => {
      setLoading(true);
      setError(null);
      setDataset(null);
      try {
        // Stores response payload returned by the dataset details endpoint.
        const data = await getDataset(token, id);
        if (mounted) {
          setDataset(data);
          setEditableMetadata(metadataToFormValues(data?.metadata || {}));
          setMetadataError("");
          setMetadataSuccess("");
        }
      } catch (requestError) {
        if (mounted) setError("Failed to load dataset.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDataset();
    return () => {
      mounted = false;
    };
  }, [id, token]);

  // Handles metadata input changes inside the modal form.
  const handleMetadataChange = (fieldName, value) => {
    setEditableMetadata((previousMetadata) => ({
      ...previousMetadata,
      [fieldName]: value,
    }));
    setMetadataError("");
    setMetadataSuccess("");
  };

  // Validates numeric metadata inputs before sending the save request.
  const validateMetadataForm = () => {
    for (const { key, label, inputType } of DATASET_METADATA_FIELDS) {
      if (inputType !== "number") continue;
      const raw = editableMetadata[key];
      if (raw === "" || raw == null) continue;
      if (Number.isNaN(Number(raw))) {
        return `${label} must be a valid number.`;
      }
    }
    return "";
  };

  // Persists edited metadata values to backend and refreshes local modal data.
  const handleSaveMetadata = async () => {
    if (!dataset || !token) return;

    const validationError = validateMetadataForm();
    if (validationError) {
      setMetadataError(validationError);
      return;
    }

    const payload = formValuesToMetadataPayload(
      editableMetadata,
      dataset?.metadata || {}
    );

    if (Object.keys(payload).length === 0) {
      setMetadataSuccess("No metadata changes to save.");
      return;
    }

    setSavingMetadata(true);
    setMetadataError("");
    setMetadataSuccess("");
    try {
      // Stores API response containing updated dataset data.
      const response = await updateDatasetMetadata(token, dataset.id, payload);
      if (response?.dataset) {
        setDataset(response.dataset);
        setEditableMetadata(metadataToFormValues(response.dataset?.metadata || {}));
      }
      setMetadataSuccess("Metadata saved.");
    } catch (requestError) {
      setMetadataError(requestError.message || "Failed to save metadata.");
    } finally {
      setSavingMetadata(false);
    }
  };

  if (!id) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>{dataset?.name || `Dataset #${id}`}</h2>
          {dataset?.description && <p style={descriptionStyle}>{dataset.description}</p>}
          <div style={captionStyle}>
            {dataset?.created_at ? `Created: ${formatDate(dataset.created_at)}` : "Created: —"}
          </div>
        </div>

        <div style={contentStyle}>
          {loading && <div style={centerTextStyle}>Loading dataset...</div>}
          {error && <div style={errorStyle}>{error}</div>}
          {!loading && !error && dataset && (
            <>
              <InfoRow label="Dataset ID" value={dataset.id} />
              <InfoRow label="File Name" value={dataset.filename || "—"} />
              <InfoRow label="Format" value={dataset.format || "unknown"} />
              <InfoRow label="Length" value={dataset.length ?? 0} />
              <MetadataEditor
                editableMetadata={editableMetadata}
                savingMetadata={savingMetadata}
                metadataError={metadataError}
                metadataSuccess={metadataSuccess}
                onChange={handleMetadataChange}
                onSave={handleSaveMetadata}
              />
              <InfoRow
                label="Last Accessed"
                value={dataset.last_accessed_at ? formatDate(dataset.last_accessed_at) : "—"}
              />
            </>
          )}
        </div>

        <div style={footerStyle}>
          <button style={secondaryButtonStyle} onClick={onClose}>
            Close
          </button>
          {onOpen && (
            <button
              style={{
                ...primaryButtonStyle,
                ...(dataset ? {} : disabledButtonStyle),
              }}
              onClick={() => dataset && onOpen(dataset)}
              disabled={!dataset}
            >
              Open in dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Renders a single label/value row in the dataset preview body.
function InfoRow({ label, value }) {
  return (
    <div style={infoRowStyle}>
      <div style={infoLabelStyle}>{label}</div>
      <div style={infoValueStyle}>{value ?? "—"}</div>
    </div>
  );
}

// Renders editable metadata inputs and save action inside the dataset modal.
function MetadataEditor({
  editableMetadata,
  savingMetadata,
  metadataError,
  metadataSuccess,
  onChange,
  onSave,
}) {
  return (
    <div style={metadataBlockStyle}>
      <div style={infoLabelStyle}>Metadata</div>
      <div style={metadataFieldsStyle}>
        {DATASET_METADATA_FIELDS.map(({ key, label, inputType, options }) => (
          <label key={key} style={metadataFieldLabelStyle}>
            {label}
            {inputType === "select" ? (
              <select
                style={metadataInputStyle}
                value={editableMetadata[key] ?? ""}
                onChange={(event) => onChange(key, event.target.value)}
              >
                <option value="">Select geometry</option>
                {(options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                style={metadataInputStyle}
                type={inputType === "number" ? "number" : "text"}
                value={editableMetadata[key] ?? ""}
                onChange={(event) => onChange(key, event.target.value)}
                placeholder="—"
              />
            )}
          </label>
        ))}
        <div style={metadataActionsStyle}>
          <button
            style={{
              ...secondaryButtonStyle,
              ...(savingMetadata ? disabledButtonStyle : {}),
            }}
            onClick={onSave}
            disabled={savingMetadata}
          >
            {savingMetadata ? "Saving..." : "Save metadata"}
          </button>
        </div>
        {metadataError && <div style={inlineErrorStyle}>{metadataError}</div>}
        {metadataSuccess && <div style={inlineSuccessStyle}>{metadataSuccess}</div>}
      </div>
    </div>
  );
}

// Formats a timestamp into a user-friendly date and time.
function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

// Defines modal backdrop style.
const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 24,
};

// Defines modal container style.
const modalStyle = {
  width: "100%",
  maxWidth: 650,
  maxHeight: "90vh",
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.12)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

// Defines modal header style.
const headerStyle = {
  padding: 24,
  borderBottom: "1px solid #eef1ff",
};

// Defines modal title style.
const titleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#1d1e2c",
};

// Defines optional dataset description text style.
const descriptionStyle = {
  margin: "6px 0 0",
  fontSize: 14,
  color: "#6b7280",
  lineHeight: 1.5,
};

// Defines header caption text style.
const captionStyle = {
  marginTop: 8,
  fontSize: 13,
  color: "#6b7280",
};

// Defines modal body scrolling style.
const contentStyle = {
  flex: 1,
  overflow: "auto",
  padding: 24,
};

// Defines compact label/value row style.
const infoRowStyle = {
  display: "flex",
  gap: 16,
  marginBottom: 10,
};

// Defines label style used in each info row.
const infoLabelStyle = {
  minWidth: 140,
  fontSize: 13,
  color: "#6b7280",
};

// Defines value style used in each info row.
const infoValueStyle = {
  fontSize: 14,
  color: "#1d1e2c",
  lineHeight: 1.5,
};

// Defines metadata editor wrapper style.
const metadataBlockStyle = {
  display: "flex",
  gap: 16,
  marginBottom: 10,
  alignItems: "flex-start",
};

// Defines metadata fields container style.
const metadataFieldsStyle = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

// Defines metadata input label style.
const metadataFieldLabelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 13,
  color: "#374151",
};

// Defines shared metadata input/select style.
const metadataInputStyle = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "#1d1e2c",
  background: "#fff",
};

// Defines metadata action row style.
const metadataActionsStyle = {
  display: "flex",
  justifyContent: "flex-start",
};

// Defines footer action button row style.
const footerStyle = {
  padding: 24,
  borderTop: "1px solid #eef1ff",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

// Defines primary action button style.
const primaryButtonStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

// Defines secondary action button style.
const secondaryButtonStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  color: "#1d1e2c",
  cursor: "pointer",
};

// Defines style for modal loading and empty messages.
const centerTextStyle = {
  textAlign: "center",
  padding: "24px 0",
  fontSize: 14,
  color: "#6b7280",
};

// Defines style for modal error text.
const errorStyle = {
  textAlign: "center",
  padding: "24px 0",
  fontSize: 14,
  color: "#b91c1c",
};

// Defines inline style for metadata validation or request errors.
const inlineErrorStyle = {
  fontSize: 13,
  color: "#b91c1c",
};

// Defines inline style for metadata save success message.
const inlineSuccessStyle = {
  fontSize: 13,
  color: "#065f46",
};

// Defines style overrides for disabled action buttons.
const disabledButtonStyle = {
  opacity: 0.5,
  cursor: "not-allowed",
};
