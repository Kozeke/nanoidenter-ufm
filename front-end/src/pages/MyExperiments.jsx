import { useState, useEffect } from "react";
import BackToDashboardButton from "../components/BackToDashboardButton";
import { listExperiments } from "../api/experiments";
import { useAuthStore } from "../state/useAuthStore";
import { useNavigate } from "react-router-dom";
import { useDashboardStore } from "../state/useDashboardStore";
import { getExperiment } from "../api/experiments";
import ExperimentPreviewModal from "../components/ExperimentPreviewModal";

export default function MyExperiments() {
  // 🔧 Frontend-only mock data (replace with API later)
  const navigate = useNavigate();
  const [previewId, setPreviewId] = useState(null);

  const [experiments, setExperiments] = useState([]);
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);

  const dashboard = useDashboardStore.getState();

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    listExperiments(token)
      .then(setExperiments)
      .catch((err) => {
        console.error("Failed to load experiments", err);
        setExperiments([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDelete = (id) => {
    if (!window.confirm("Delete this experiment?")) return;
    setExperiments((prev) => prev.filter((e) => e.id !== id));
  };

  const handleOpen = async (exp) => {
    const data = await getExperiment(token, exp.id);

    console.log("data filters", data.filters);
    // ✅ 1. Set Zustand state FIRST
    dashboard.setFilters(data.filters ?? {});
    dashboard.setElasticityParams(data.elasticity_params ?? {});
    dashboard.setForceModelParams(data.force_model_params ?? {});
    dashboard.setSelectedCurveId(data.curve_id ?? null);
    dashboard.setSelectedCurveIds([]);
    console.log("AFTER SET FILTERS:", useDashboardStore.getState());

    // ✅ 2. THEN navigate
    navigate("/dashboard");
  };

  return (
    <div style={pageStyle}>
      

      <div style={cardStyle}>
      <div style={{ marginBottom: 12 }}>
        <BackToDashboardButton />
      </div>
        <h2 style={titleStyle}>My Experiments</h2>
        <p style={subtitleStyle}>Saved analysis runs</p>
        {loading ? (
          <div>Loading experiments…</div>
        ) : experiments.length === 0 ? (
          <div style={emptyStyle}>
            No experiments yet
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Open a file and save your first analysis
            </div>
          </div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <tr key={exp.id} style={rowStyle} className="row">
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{exp.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                      ID: {exp.id}
                    </div>
                  </td>

                  <td style={tdStyle}>{formatDate(exp.created_at)}</td>

                  <td style={tdStyle}>
                    <StatusBadge status={exp.status} />
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button
                      style={secondaryButtonStyle}
                      onClick={() => setPreviewId(exp.id)}
                    >
                      👁 Preview
                    </button>
                    <button
                      style={actionButtonStyle}
                      onClick={() => handleOpen(exp)}
                    >
                      ▶ Open
                    </button>
                    <button style={secondaryButtonStyle}>⬇ Export</button>
                    <button
                      style={dangerButtonStyle}
                      onClick={() => handleDelete(exp.id)}
                    >
                      🗑 Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {previewId && (
        <ExperimentPreviewModal
          id={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/* ---------- Small components ---------- */

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

const statusConfig = {
  Completed: { bg: "#ecfdf3", fg: "#065f46", label: "Completed ✓" },
  Running: { bg: "#eff6ff", fg: "#1d4ed8", label: "Running…" },
  Failed: { bg: "#fee2e2", fg: "#991b1b", label: "Failed" },
};

/* ---------- Styles (Dashboard-consistent) ---------- */

const pageStyle = {
  padding: 24,
  display: "flex",
  justifyContent: "center",
};

const cardStyle = {
  width: "100%",
  maxWidth: 900,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.12)",
  padding: 24,
};

const titleStyle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: "#1d1e2c",
};

const subtitleStyle = {
  marginTop: 6,
  marginBottom: 16,
  fontSize: 14,
  color: "#6b7280",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle = {
  textAlign: "left",
  fontSize: 13,
  color: "#6b7280",
  paddingBottom: 8,
  borderBottom: "1px solid #eef1ff",
};

const rowStyle = {
  borderBottom: "1px solid #eef1ff",
  transition: "background .15s ease",
};

const tdStyle = {
  padding: "12px 0",
  fontSize: 14,
  color: "#1d1e2c",
};

const badgeStyle = {
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
};

const actionButtonStyle = {
  marginRight: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "none",
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  marginRight: 8,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const dangerButtonStyle = {
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid #fca5a5",
  background: "#fff",
  color: "#b91c1c",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const emptyStyle = {
  padding: 24,
  textAlign: "center",
  fontSize: 14,
  color: "#6b7280",
};
