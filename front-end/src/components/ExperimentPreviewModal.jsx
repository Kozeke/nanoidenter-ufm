import { useEffect, useState } from "react";
import { getExperiment } from "../api/experiments";
import { useAuthStore } from "../state/useAuthStore";

export default function ExperimentPreviewModal({ id, onClose }) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !token) return;

    let mounted = true;

    

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const result = await getExperiment(token, id);
        if (mounted) setData(result);
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError(
            err.response?.data?.message ||
              "Failed to load experiment. Please try again."
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => { mounted = false; };
  }, [id, token]);

  if (!id) return null;

  const hasFilters = data?.filters && Object.keys(data.filters).length > 0;
  const hasFmodel = data?.filters?.f_models && Object.keys(data.filters.f_models).length > 0;
  const hasEmodel = data?.filters?.e_models && Object.keys(data.filters.e_models).length > 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 20px 0" }}>Experiment {id}</h3>

        {loading ? (
          <div style={msgStyle}>Loading experiment data...</div>
        ) : error ? (
          <div style={{ ...msgStyle, color: "#dc2626" }}>{error}</div>
        ) : !data ? (
          <div style={msgStyle}>No data available</div>
        ) : (
          <div style={contentStyle}>
            {/* General fields (id, name, metadata, etc.) */}
            <RenderValue value={data} level={0} skipKeys={["filters", "elasticity_params", "force_model_params"]} />

            {/* Filters section – only if not empty */}
            {hasFilters && (
              <Section title="Filters">
                <RenderValue value={data.filters} level={1} skipKeys={["f_models", "e_models"]} />
                {Object.keys(data.filters.f_models).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h5 style={subsectionTitleStyle}>Force Models (f_models)</h5>
                    <RenderValue value={data.filters.f_models} level={2} />
                  </div>
                )}
                {Object.keys(data.filters.e_models).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h5 style={subsectionTitleStyle}>Elasticity Models (e_models)</h5>
                    <RenderValue value={data.filters.e_models} level={2} />
                  </div>
                )}
              </Section>
            )}

            {/* Force Model Params – only if fmodel chosen */}
            {hasFmodel && (
              <Section title="Force Model Parameters" color="#1e40af">
                {data.force_model_params?.poisson != null && (
                  <ValueDisplay name="Poisson's ratio" value={data.force_model_params.poisson} />
                )}
                {data.force_model_params?.maxInd != null && (
                  <ValueDisplay name="Max individual" value={data.force_model_params.maxInd} />
                )}
                {data.force_model_params?.minInd != null && (
                  <ValueDisplay name="Min individual" value={data.force_model_params.minInd} />
                )}
                {/* Render any unknown/extra params */}
                <RenderValue value={data.force_model_params} level={1} skipKnownFields={knownForceFields} />
              </Section>
            )}

            {/* Elasticity Model Params – only if emodel chosen */}
            {hasEmodel && (
              <Section title="Elasticity Model Parameters" color="#166534">
                {data.elasticity_params?.interpolate != null && (
                  <ValueDisplay
                    name="Interpolate"
                    value={data.elasticity_params.interpolate ? "Yes" : "No"}
                  />
                )}
                {data.elasticity_params?.order != null && (
                  <ValueDisplay name="Interpolation order" value={data.elasticity_params.order} />
                )}
                {data.elasticity_params?.window != null && (
                  <ValueDisplay name="Window size" value={data.elasticity_params.window} />
                )}
                {/* Render any unknown/extra params */}
                <RenderValue value={data.elasticity_params} level={1} skipKnownFields={knownElasticityFields} />
              </Section>
            )}
          </div>
        )}

        <button style={closeBtnStyle} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ────────────────────── Reusable Components ──────────────────────
function Section({ title, children, color = "#1f2937" }) {
  return (
    <div style={sectionStyle}>
      <h4 style={{ ...sectionTitleStyle, color }}>{title}</h4>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function RenderValue({ value, name, level = 0, skipKeys = [], skipKnownFields = [] }) {
  if (value == null) {
    return <ValueDisplay name={name} value="—" dim />;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <ValueDisplay name={name} value="[empty]" dim />;
    return (
      <div style={{ marginLeft: level * 20 }}>
        {name && <FieldLabel>{name}</FieldLabel>}
        <div style={{ marginTop: 4 }}>
          {value.map((item, i) => (
            <RenderValue key={i} value={item} name={`[${i}]`} level={level + 1} />
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).filter(
      ([k]) => !skipKeys.includes(k) && !skipKnownFields.includes(k)
    );
    if (entries.length === 0) return null;

    return (
      <div style={{ marginLeft: level * 20 }}>
        {name && <FieldLabel>{name}</FieldLabel>}
        <div style={{ margin: "6px 0" }}>
          {entries.map(([key, val]) => (
            <RenderValue key={key} name={niceName(key)} value={val} level={level + 1} />
          ))}
        </div>
      </div>
    );
  }

  return <ValueDisplay name={name} value={formatValue(value)} />;
}

function FieldLabel({ children }) {
  return (
    <div style={{ fontWeight: 600, fontSize: 13.5, color: "#1f2937", marginBottom: 4 }}>
      {children}
    </div>
  );
}

function ValueDisplay({ name, value, dim = false }) {
  return (
    <div style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "baseline" }}>
      {name && (
        <div
          style={{
            fontWeight: 500,
            fontSize: 13,
            color: "#4b5563",
            minWidth: 160,
            flexShrink: 0,
          }}
        >
          {name}:
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          color: dim ? "#9ca3af" : "#111827",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ────────────────────── Helpers ──────────────────────
const knownForceFields = ["poisson", "maxInd", "minInd"];
const knownElasticityFields = ["interpolate", "order", "window"];

const niceName = (key) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .replace("Ind", "Individual")
    .trim();

const formatValue = (val) =>
  val === true ? "Yes" : val === false ? "No" : val == null ? "—" : String(val);

// ────────────────────── Styles ──────────────────────
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalStyle = {
  width: "90%",
  maxWidth: 760,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: 12,
  padding: "24px",
  boxShadow: "0 20px 30px -10px rgba(0,0,0,0.25)",
};

const contentStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sectionStyle = {
  background: "#f8fafc",
  borderRadius: 8,
  padding: 16,
  border: "1px solid #e2e8f0",
};

const sectionTitleStyle = {
  margin: "0 0 12px 0",
  fontSize: 15,
  fontWeight: 600,
};

const subsectionTitleStyle = {
  margin: "0 0 8px 0",
  fontSize: 14,
  color: "#374151",
};

const closeBtnStyle = {
  marginTop: 24,
  padding: "10px 24px",
  background: "#f1f5f9",
  border: "1px solid #cbd5e1",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 500,
};

const msgStyle = {
  textAlign: "center",
  padding: "40px 20px",
  color: "#6b7280",
  fontSize: 15,
};