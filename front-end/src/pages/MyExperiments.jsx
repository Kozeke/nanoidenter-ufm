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
  
    // console.log("OPEN EXPERIMENT DATA:", data.filters.regular);
    // function parseCurveId(curveId){
    //   if (typeof curveId === "number") return curveId;
    //   if (typeof curveId !== "string") return null;
    //   const match = curveId.match(/\d+/);
    //   return match ? Number(match[0]) : null 
    // }
    console.log("data filters",data.filters)
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
      <div style={{ marginBottom: 12 }}>
        <BackToDashboardButton />
      </div>

      <div style={cardStyle}>
        <h2 style={titleStyle}>My Experiments</h2>
        <p style={subtitleStyle}>Saved analysis runs</p>
        {loading ? (
            <div>Loading experiments…</div>
        ) : experiments.length === 0 ? (
          <div style={emptyStyle}>No experiments saved yet</div>
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
                <tr key={exp.id} style={rowStyle}>
                  <td style={tdStyle}>{exp.name}</td>
                  <td style={tdStyle}>{exp.created_at}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={exp.status} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                  <button
                    style={secondaryButtonStyle}
                    onClick={() => setPreviewId(exp.id)}
                    >
                    Preview
                    </button>
                    <button
                      style={actionButtonStyle}
                      onClick={() => handleOpen(exp)}
                    >
                      Open
                    </button>
                    <button
                      style={secondaryButtonStyle}
                      onClick={() => alert("Export not wired yet")}
                    >
                      Export
                    </button>
                    <button
                      style={dangerButtonStyle}
                      onClick={() => handleDelete(exp.id)}
                    >
                      Delete
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

/* ---------- Small components ---------- */

function StatusBadge({ status }) {
  return (
    <span
      style={{
        ...badgeStyle,
        background:
          status === "Completed" ? "#ecfdf3" : "#fef3c7",
        color:
          status === "Completed" ? "#065f46" : "#92400e",
      }}
    >
      {status}
    </span>
  );
}

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
