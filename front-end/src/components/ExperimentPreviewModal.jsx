import { useEffect, useState } from "react";
import { getExperiment } from "../api/experiments";
import { useAuthStore } from "../state/useAuthStore";

/* ───────────────────────────────────────────── */

export default function ExperimentPreviewModal({ id, onClose, onOpen }) {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    filters: true,
    forceModel: false,
    elasticity: false,
  });

  function formatYoungsModulus(mean, std, decimals = 1) {
    if (mean == null || std == null) return "—";
    return `${mean.toFixed(decimals)} ± ${std.toFixed(decimals)}`;
  }

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
        if (mounted) setError("Failed to load experiment.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();
    return () => {
      mounted = false;
    };
  }, [id, token]);

  const toggleSection = (section) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (!id) return null;

  const hasFilters = !!data?.filters;
  const hasFmodel = Object.keys(data?.filters?.f_models || {}).length > 0;
  const hasEmodel = Object.keys(data?.filters?.e_models || {}).length > 0;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* ───────────── Header ───────────── */}
        <div style={headerStyle}>
          <div>
            {/* Experiment title */}
            <h2 style={modalTitleStyle}>
              {data?.name || `Experiment #${id}`}
            </h2>
            {/* Optional description shown below the title */}
            {data?.description && (
              <p style={descriptionStyle}>{data.description}</p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              {data?.created_at && (
                <span style={captionStyle}>{formatDate(data.created_at)}</span>
              )}
              {data?.status && (
                <StatusBadge status={data.status} />
              )}
            </div>
          </div>
        </div>

        {/* ───────────── Content ───────────── */}
        <div style={contentStyle}>
          {loading && (
            <div style={centerStyle}>
              <div style={spinnerStyle}></div>
              <div style={{ ...captionStyle, marginTop: 16 }}>
                Loading experiment…
              </div>
            </div>
          )}

          {error && (
            <div style={errorStyle}>{error}</div>
          )}

          {data && !loading && (
            <div style={stackStyle}>
              {/* ───────── Overview ───────── */}
              <div style={sectionTitleStyle}>Overview</div>

              <KeyValue label="Experiment ID" value={data.id} />
              {data.curve_id != null && (
                <KeyValue label="Chosen Curve ID" value={data.curve_id} />
              )}
              <div style={bodyTextStyle}>
                <strong>Young's modulus:</strong>{" "}
                {formatYoungsModulus(
                  data.youngs_modulus_mean,
                  data.youngs_modulus_std
                )}{" "}
                Pa
              </div>

              <div style={dividerStyle}></div>

              {/* ───────── Filters ───────── */}
              {hasFilters && (
                <Accordion
                  title="Filters"
                  expanded={expandedSections.filters}
                  onToggle={() => toggleSection("filters")}
                >
                  <KeyValue
                    label="Regular filters"
                    value={
                      Object.keys(data.filters.regular || {}).join(", ") ||
                      "None"
                    }
                  />
                  <KeyValue
                    label="Contact point filters"
                    value={
                      Object.keys(data.filters.cp_filters || {}).join(", ") ||
                      "None"
                    }
                  />
                </Accordion>
              )}

              {/* ───────── Force model ───────── */}
              {hasFmodel && (
                <Accordion
                  title="Force model"
                  expanded={expandedSections.forceModel}
                  onToggle={() => toggleSection("forceModel")}
                >
                  <KeyValue
                    label="Model"
                    value={
                      Object.keys(data.filters?.f_models || {})
                        .map(capitalizeModelName)
                        .join(", ") || "None"
                    }
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 16 }}>
                    {data.force_model_params?.poisson != null && (
                      <Chip label={`Poisson: ${data.force_model_params.poisson}`} />
                    )}
                    {data.force_model_params?.maxInd != null && (
                      <Chip label={`MaxInd: ${data.force_model_params.maxInd}`} />
                    )}
                    {data.force_model_params?.minInd != null && (
                      <Chip label={`MinInd: ${data.force_model_params.minInd}`} />
                    )}
                  </div>

                  <RenderValue
                    value={data.force_model_params}
                    skipKnownFields={knownForceFields}
                  />
                </Accordion>
              )}

              {/* ───────── Elasticity params ───────── */}
              {hasEmodel && (
                <Accordion
                  title="Elasticity model"
                  expanded={expandedSections.elasticity}
                  onToggle={() => toggleSection("elasticity")}
                >
                  <KeyValue
                    label="Model"
                    value={
                      Object.keys(data.filters?.e_models || {})
                        .map(capitalizeModelName)
                        .join(", ") || "None"
                    }
                  />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 16 }}>
                    {data.elasticity_params?.window != null && (
                      <Chip label={`Window: ${data.elasticity_params.window}`} />
                    )}
                    {data.elasticity_params?.order != null && (
                      <Chip label={`Order: ${data.elasticity_params.order}`} />
                    )}
                  </div>

                  <RenderValue
                    value={data.elasticity_params}
                    skipKnownFields={knownElasticityFields}
                  />
                </Accordion>
              )}
            </div>
          )}
        </div>

        {/* ───────────── Footer ───────────── */}
        <div style={footerStyle}>
          <button style={secondaryButtonStyle} onClick={onClose}>
            Close
          </button>
          {onOpen && (
            <button
              style={primaryButtonStyle}
              onClick={() => onOpen(data)}
            >
              Open in dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Components ───────────────────── */

function KeyValue({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
      <div style={{ ...captionStyle, minWidth: 160 }}>
        {label}
      </div>
      <div style={bodyTextStyle}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function Accordion({ title, expanded, onToggle, children }) {
  return (
    <div style={accordionStyle}>
      <div style={accordionHeaderStyle} onClick={onToggle}>
        <span style={accordionTitleStyle}>{title}</span>
        <span style={{
          ...accordionIconStyle,
          transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        }}>
          ▼
        </span>
      </div>
      {expanded && (
        <div style={accordionContentStyle}>
          {children}
        </div>
      )}
    </div>
  );
}

function Chip({ label }) {
  return (
    <span style={chipStyle}>
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = statusConfig[status] || statusConfig.Completed;
  return (
    <span
      style={{
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.fg,
      }}
    >
      {s.label}
    </span>
  );
}

function RenderValue({ value, level = 0, skipKnownFields = [] }) {
  if (value == null) return null;

  if (typeof value !== "object") {
    return (
      <div style={{ ...bodyTextStyle, marginLeft: level * 16 }}>
        {String(value)}
      </div>
    );
  }

  return (
    <div style={{ marginLeft: level * 16 }}>
      {Object.entries(value)
        .filter(([k]) => !skipKnownFields.includes(k))
        .map(([key, val]) => (
          <div key={key} style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <div style={{ ...captionStyle, minWidth: 140 }}>
              {niceName(key)}
            </div>
            <div style={bodyTextStyle}>
              {formatValue(val)}
            </div>
          </div>
        ))}
    </div>
  );
}

/* ───────────────────── Helpers ───────────────────── */

const knownForceFields = ["poisson", "maxInd", "minInd"];
const knownElasticityFields = ["interpolate", "order", "window"];

const statusConfig = {
  Completed: { bg: "#ecfdf3", fg: "#065f46", label: "Completed ✓" },
  Running: { bg: "#eff6ff", fg: "#1d4ed8", label: "Running…" },
  Failed: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
};

const capitalizeModelName = (name) => {
  if (!name) return "";
  return name
    .charAt(0)
    .toUpperCase() + name.slice(1).replace(/([A-Z])/g, " $1");
};

const niceName = (key) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();

const formatValue = (v) =>
  v === true ? "Yes" : v === false ? "No" : v ?? "—";

const formatDate = (value) => {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

/* ───────────────────── Styles ───────────────────── */

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

const modalStyle = {
  width: "100%",
  maxWidth: 700,
  maxHeight: "90vh",
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.12)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const headerStyle = {
  padding: 24,
  borderBottom: "1px solid #eef1ff",
};

// Description text shown below the experiment title in the header
const descriptionStyle = {
  margin: "6px 0 0",
  fontSize: 14,
  color: "#6b7280",
  lineHeight: 1.5,
};

const modalTitleStyle = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#1d1e2c",
};

const contentStyle = {
  flex: 1,
  overflow: "auto",
  padding: 24,
};

const footerStyle = {
  padding: 24,
  borderTop: "1px solid #eef1ff",
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const stackStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const sectionTitleStyle = {
  fontSize: 16,
  fontWeight: 600,
  color: "#1d1e2c",
  marginBottom: 8,
};

const bodyTextStyle = {
  fontSize: 14,
  color: "#1d1e2c",
  lineHeight: 1.5,
};

const captionStyle = {
  fontSize: 13,
  color: "#6b7280",
};

const dividerStyle = {
  height: 1,
  background: "#eef1ff",
  margin: "8px 0",
};

const centerStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 0",
};

const errorStyle = {
  color: "#b91c1c",
  textAlign: "center",
  padding: "32px 0",
  fontSize: 14,
};

const spinnerStyle = {
  width: 40,
  height: 40,
  border: "4px solid #eef1ff",
  borderTop: "4px solid #6772ff",
  borderRadius: "50%",
  animation: "spin 1s linear infinite",
};

const accordionStyle = {
  border: "1px solid #e9ecf5",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 8,
};

const accordionHeaderStyle = {
  padding: "12px 16px",
  background: "#fafbff",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  transition: "background 0.15s ease",
  userSelect: "none",
};

const accordionTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: "#1d1e2c",
};

const accordionIconStyle = {
  fontSize: 10,
  color: "#6b7280",
  transition: "transform 0.2s ease",
};

const accordionContentStyle = {
  padding: 16,
  background: "#fff",
};

const chipStyle = {
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: "#eff6ff",
  color: "#1d4ed8",
  display: "inline-block",
};

const primaryButtonStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s ease",
};

const secondaryButtonStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  color: "#1d1e2c",
  transition: "background 0.15s ease",
};

// Add CSS animation for spinner
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}