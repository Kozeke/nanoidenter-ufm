// SaveExperimentButton – opens a modal to collect name + description before saving.
// Replaces the previous direct-save + window.alert flow.
// The modal is rendered via a React Portal into document.body so that parent
// transforms (e.g. pressable translateY) cannot break position:fixed centering.

import { useState } from "react";
import { createPortal } from "react-dom";
import { saveExperiment } from "../api/experiments";
import { useDashboardStore } from "../state/useDashboardStore";
import { useAuthStore } from "../state/useAuthStore";
import { useMetadata } from "./Dashboard";

// ─── Main component ───────────────────────────────────────────────────────────

export default function SaveExperimentButton() {
  // Controls visibility of the save modal
  const [modalOpen, setModalOpen] = useState(false);

  const { metadataObject } = useMetadata();
  const dashboard = useDashboardStore();
  const token = useAuthStore((s) => s.token);

  const handleButtonClick = () => {
    // Guard: metadata must be loaded before saving
    if (!metadataObject || metadataObject.columns?.length === 0) {
      setModalOpen(true); // Open modal anyway to show the warning inside it
      return;
    }
    setModalOpen(true);
  };

  return (
    <>
      <button
        onClick={handleButtonClick}
        style={buttonStyle}
      >
        Save Experiment
      </button>

      {/* Portal ensures the overlay escapes any transformed ancestor */}
      {modalOpen &&
        createPortal(
          <SaveExperimentModal
            metadataObject={metadataObject}
            dashboard={dashboard}
            token={token}
            onClose={() => setModalOpen(false)}
          />,
          document.body
        )}
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function SaveExperimentModal({ metadataObject, dashboard, token, onClose }) {
  // Experiment title entered by the user (pre-filled with a generated default)
  const [name, setName] = useState(generateDefaultName());

  // Optional free-text description entered by the user
  const [description, setDescription] = useState("");

  // Tracks whether the API call is in-flight
  const [loading, setLoading] = useState(false);

  // Holds the save result to show inside the modal instead of an alert
  const [result, setResult] = useState(null);

  // Holds any error message to show inside the modal
  const [errorMsg, setErrorMsg] = useState(null);

  // True when metadata is missing – shows a warning instead of the form
  const metadataMissing =
    !metadataObject || metadataObject.columns?.length === 0;

  const handleSave = async () => {
    if (loading) return;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      // K_raw, K_contact, and E (Young's modulus) come from the LinearWindowFit regular
      // filter (see linear_window_fit_filter.py / compute_derived()) and are only present
      // in modelStats.stiffness while that filter is active with enough valid curves —
      // find() safely returns undefined otherwise, so these are omitted rather than sent
      // as garbage values.
      const stiffnessStats = dashboard.modelStats?.stiffness || [];
      const kRawStat = stiffnessStats.find((item) => item?.key === "k_raw");
      const kContactStat = stiffnessStats.find((item) => item?.key === "k_contact");
      const stiffnessYoungsModulusStat = stiffnessStats.find((item) => item?.key === "youngs_modulus");

      const apiResult = await saveExperiment(token, {
        name: name.trim() || generateDefaultName(),
        description: description.trim() || null,
        metadata: metadataObject,
        filters: dashboard.filters,
        elasticity_params: dashboard.elasticityParams,
        force_model_params: dashboard.forceModelParams,
        curve_id: dashboard.selectedCurveId,
        dataset_id: dashboard.datasetId,
        results: {
          youngs_modulus_mean: dashboard.modelStats?.force[0]?.mean,
          youngs_modulus_std: dashboard.modelStats?.force[0]?.std,
          k_raw_mean: kRawStat?.mean,
          k_raw_std: kRawStat?.std,
          k_contact_mean: kContactStat?.mean,
          k_contact_std: kContactStat?.std,
          stiffness_youngs_modulus_mean: stiffnessYoungsModulusStat?.mean,
          stiffness_youngs_modulus_std: stiffnessYoungsModulusStat?.std,
        },
      });

      // Store the status + message from the backend to show inside the modal
      const statusCode = apiResult.status_code || apiResult.status || "ok";
      const statusMessage =
        apiResult.message || "Experiment saved successfully";
      setResult({ statusCode, statusMessage });
    } catch (err) {
      setErrorMsg(err.message || "Failed to save experiment");
    } finally {
      setLoading(false);
    }
  };

  return (
    // Clicking the overlay closes the modal (unless a save is in progress)
    <div
      style={overlayStyle}
      onClick={() => {
        if (!loading) onClose();
      }}
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div style={headerStyle}>
          <h2 style={modalTitleStyle}>Save Experiment</h2>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div style={bodyStyle}>
          {/* Metadata warning state */}
          {metadataMissing && (
            <div style={warningBoxStyle}>
              ⚠ Cannot save experiment: metadata not loaded yet.
              <br />
              Please open a dataset first.
            </div>
          )}

          {/* Normal form – shown when metadata is available and no result yet */}
          {!metadataMissing && !result && (
            <>
              {/* Experiment name field */}
              <label style={labelStyle}>
                Experiment name
                <input
                  style={inputStyle}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter experiment name…"
                  disabled={loading}
                />
              </label>

              {/* Optional description field */}
              <label style={labelStyle}>
                Description{" "}
                <span style={{ fontWeight: 400, color: "#9ca3af" }}>
                  (optional)
                </span>
                <textarea
                  style={textareaStyle}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes about this experiment…"
                  rows={3}
                  disabled={loading}
                />
              </label>

              {/* Inline error from API */}
              {errorMsg && <div style={errorBoxStyle}>⚠ {errorMsg}</div>}
            </>
          )}

          {/* Success / status result shown after a successful save */}
          {result && (
            <div
              style={
                result.statusCode === "success"
                  ? successBoxStyle
                  : pendingBoxStyle
              }
            >
              <div style={resultTitleStyle}>
                Status: {result.statusCode.toUpperCase()}
              </div>
              <div style={resultMessageStyle}>{result.statusMessage}</div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={footerStyle}>
          <button
            style={cancelBtnStyle}
            onClick={onClose}
            disabled={loading}
          >
            {result ? "Close" : "Cancel"}
          </button>

          {/* Save button is hidden once we have a result */}
          {!result && !metadataMissing && (
            <button
              style={{
                ...saveBtnStyle,
                ...(loading ? { opacity: 0.7, cursor: "not-allowed" } : {}),
              }}
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Generates a default experiment name based on the current date/time
function generateDefaultName() {
  const date = new Date().toLocaleString();
  return `Experiment – ${date}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const buttonStyle = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  color: "#fff",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  boxShadow: "0 6px 14px rgba(90,105,255,0.25)",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 24,
};

const modalStyle = {
  width: "100%",
  maxWidth: 480,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.15)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle = {
  padding: "20px 24px 16px",
  borderBottom: "1px solid #eef1ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const modalTitleStyle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#1d1e2c",
};

const closeBtnStyle = {
  background: "none",
  border: "none",
  fontSize: 16,
  color: "#6b7280",
  cursor: "pointer",
  padding: 4,
  lineHeight: 1,
};

const bodyStyle = {
  padding: "20px 24px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
};

const inputStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  fontSize: 14,
  color: "#1d1e2c",
  outline: "none",
  fontFamily: "inherit",
};

const textareaStyle = {
  ...inputStyle,
  resize: "vertical",
  minHeight: 72,
};

const warningBoxStyle = {
  background: "#fffbeb",
  border: "1px solid #fcd34d",
  borderRadius: 8,
  padding: "12px 14px",
  fontSize: 13,
  color: "#92400e",
  lineHeight: 1.6,
};

const errorBoxStyle = {
  background: "#fef2f2",
  border: "1px solid #fca5a5",
  borderRadius: 8,
  padding: "12px 14px",
  fontSize: 13,
  color: "#b91c1c",
};

const successBoxStyle = {
  background: "#ecfdf5",
  border: "1px solid #6ee7b7",
  borderRadius: 8,
  padding: "16px 18px",
  color: "#065f46",
};

const pendingBoxStyle = {
  background: "#eff6ff",
  border: "1px solid #93c5fd",
  borderRadius: 8,
  padding: "16px 18px",
  color: "#1e40af",
};

const resultTitleStyle = {
  fontWeight: 700,
  fontSize: 14,
  marginBottom: 4,
};

const resultMessageStyle = {
  fontSize: 13,
  lineHeight: 1.5,
};

const footerStyle = {
  padding: "16px 24px",
  borderTop: "1px solid #eef1ff",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const cancelBtnStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#1d1e2c",
};

const saveBtnStyle = {
  padding: "8px 20px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 4px 10px rgba(90,105,255,0.25)",
};
