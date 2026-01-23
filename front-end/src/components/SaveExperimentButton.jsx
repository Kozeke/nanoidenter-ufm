import { useState } from "react";
import { saveExperiment } from "../api/experiments";
import { useDashboardStore } from "../state/useDashboardStore";
import { useAuthStore } from "../state/useAuthStore";
import { useMetadata } from "./Dashboard"; // adjust path if needed

export default function SaveExperimentButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { metadataObject } = useMetadata();

  const dashboard = useDashboardStore();
  const token = useAuthStore((s) => s.token);

  const handleSave = async () => {
    if (loading) return;
    if (!metadataObject || metadataObject.columns?.length === 0) {
        setError("Cannot save experiment: metadata not loaded yet");
        setLoading(false);
        return;
      }
      
    setError("");
    setSuccess("");
    setLoading(true);
    console.log("Asd");
    try {
      await saveExperiment(token, {
        name: generateDefaultName(),
        metadata: metadataObject,
        filters: dashboard.filters,
        elasticity_params: dashboard.elasticityParams,
        force_model_params: dashboard.forceModelParams,
        curve_id: dashboard.selectedCurveId,
        results: {
          youngs_modulus_mean: dashboard.modelStats?.force[0]?.mean,
          youngs_modulus_std: dashboard.modelStats?.force[0]?.std
          // elasticity_param: dashboard.elasticityParams?.params,
        },
      });

      setSuccess("Experiment saved");
    } catch (err) {
      setError(err.message || "Failed to save experiment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        onClick={handleSave}
        disabled={loading}
        style={{
          ...buttonStyle,
          ...(loading ? disabledStyle : {}),
        }}
      >
        {loading ? "Saving…" : "Save Experiment"}
      </button>

      {success && <span style={successStyle}>{success}</span>}
      {error && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

/* ---------- Helpers ---------- */

function generateDefaultName() {
  const date = new Date().toLocaleString();
  return `Experiment – ${date}`;
}

/* ---------- Styles (Dashboard-consistent) ---------- */

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

const disabledStyle = {
  opacity: 0.7,
  cursor: "not-allowed",
};

const successStyle = {
  fontSize: 12,
  color: "#065f46",
};

const errorStyle = {
  fontSize: 12,
  color: "#b91c1c",
};
