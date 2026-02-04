import { useState, useEffect, useRef } from "react";
import BackToDashboardButton from "../components/BackToDashboardButton";
import { listExperiments, deleteExperiment } from "../api/experiments";
import { useAuthStore } from "../state/useAuthStore";
import { useNavigate } from "react-router-dom";
import { useDashboardStore } from "../state/useDashboardStore";
import { getExperiment } from "../api/experiments";
import ExperimentPreviewModal from "../components/ExperimentPreviewModal";
import ExportButton from "../components/ExportButton";

export default function MyExperiments() {
  // 🔧 Frontend-only mock data (replace with API later)
  const navigate = useNavigate();
  const [previewId, setPreviewId] = useState(null);

  const [experiments, setExperiments] = useState([]);
  const token = useAuthStore((s) => s.token);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const experimentDataRef = useRef({});

  const dashboard = useDashboardStore.getState();
  
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(experiments.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedExperiments = experiments.slice(startIndex, endIndex);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    listExperiments(token)
      .then((data) => {
        setExperiments(data);
        setCurrentPage(1); // Reset to first page when experiments are loaded
      })
      .catch((err) => {
        console.error("Failed to load experiments", err);
        setExperiments([]);
        setCurrentPage(1);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this experiment?")) return;
    
    try {
      await deleteExperiment(token, id);
      // Remove from local state after successful deletion
      setExperiments((prev) => {
        const filtered = prev.filter((e) => e.id !== id);
        // Adjust current page if we deleted the last item on the current page
        const newTotalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages);
        }
        return filtered;
      });
    } catch (err) {
      console.error("Failed to delete experiment:", err);
      alert(err.message || "Failed to delete experiment");
    }
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
    // Update dataset_id and filename from the experiment's saved data
    // This ensures each experiment shows its own dataset name, not the current one
    if (data.dataset_id) {
      dashboard.setDatasetId(data.dataset_id);
    }
    // Set filename from the experiment's dataset_name (the name saved when file was opened)
    // This is critical - use the dataset_name from the experiment, not the current store
    if (data.dataset_name) {
      dashboard.setFilename(data.dataset_name);
      console.log("Set filename from experiment:", data.dataset_name, "for dataset_id:", data.dataset_id);
    } else {
      // If dataset_name is not available, clear filename to avoid showing wrong name
      dashboard.setFilename(null);
    }
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
          <>
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
                {paginatedExperiments.map((exp) => (
                  <tr key={exp.id} style={rowStyle} className="row">
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{exp.name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        ID: {exp.id}
                      </div>
                    </td>

                    <td style={tdStyle}>{formatDate(exp.created_at)}</td>

                    <td style={tdStyle}>
                      <StatusBadge status={exp.status_code || exp.status} />
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
                      <ExportButton
                        key={`export-${exp.id}`}
                        experimentData={() => experimentDataRef.current[exp.id] || null}
                        renderTrigger={(doExport, disabled) => (
                          <button
                            style={{
                              ...secondaryButtonStyle,
                              ...(disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}),
                            }}
                            onClick={async () => {
                              // Fetch experiment data before opening export dialog
                              try {
                                const expData = await getExperiment(token, exp.id);
                                // Transform experiment data to match expected format
                                const transformedData = {
                                  id: exp.id, // Store experiment ID to match later
                                  filters: expData.filters || {},
                                  force_model_params: expData.force_model_params || {},
                                  elasticity_params: expData.elasticity_params || {},
                                  curve_id: expData.curve_id,
                                  metadata: {
                                    spring_constant: expData.metadata?.spring_constant,
                                    tip_radius: expData.metadata?.tip_radius,
                                    tip_geometry: expData.metadata?.tip_geometry,
                                  },
                                  youngs_modulus_mean: expData.youngs_modulus_mean,
                                  youngs_modulus_std: expData.youngs_modulus_std,
                                };
                                // Store in ref for immediate access
                                experimentDataRef.current[exp.id] = transformedData;
                                // Call doExport - it will read from ref via the function
                                doExport();
                              } catch (err) {
                                console.error("Failed to load experiment data:", err);
                                alert("Failed to load experiment data for export");
                              }
                            }}
                            disabled={disabled}
                          >
                            ⬇ Export
                          </button>
                        )}
                      />
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
            {experiments.length > ITEMS_PER_PAGE && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            )}
          </>
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

function Pagination({ currentPage, totalPages, onPageChange }) {
  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is less than max visible
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show first page, last page, and pages around current
      if (currentPage <= 3) {
        // Near the start
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        // Near the end
        pages.push(1);
        pages.push("...");
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // In the middle
        pages.push(1);
        pages.push("...");
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push("...");
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div style={paginationStyle}>
      <button
        style={{
          ...paginationButtonStyle,
          ...(currentPage === 1 ? paginationButtonDisabledStyle : {}),
        }}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        ← Previous
      </button>
      
      <div style={paginationNumbersStyle}>
        {getPageNumbers().map((page, index) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${index}`} style={paginationEllipsisStyle}>
                ...
              </span>
            );
          }
          return (
            <button
              key={page}
              style={{
                ...paginationNumberButtonStyle,
                ...(currentPage === page
                  ? paginationNumberButtonActiveStyle
                  : {}),
              }}
              onClick={() => onPageChange(page)}
            >
              {page}
            </button>
          );
        })}
      </div>
      
      <button
        style={{
          ...paginationButtonStyle,
          ...(currentPage === totalPages ? paginationButtonDisabledStyle : {}),
        }}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Next →
      </button>
    </div>
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

const statusConfig = {
  success: { bg: "#ecfdf3", fg: "#065f46", label: "Success ✓" },
  pending: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
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

const paginationStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 24,
  paddingTop: 24,
  borderTop: "1px solid #eef1ff",
};

const paginationButtonStyle = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  color: "#1d1e2c",
  cursor: "pointer",
  transition: "all 0.2s",
};

const paginationButtonDisabledStyle = {
  opacity: 0.5,
  cursor: "not-allowed",
};

const paginationNumbersStyle = {
  display: "flex",
  gap: 4,
  alignItems: "center",
};

const paginationNumberButtonStyle = {
  minWidth: 36,
  height: 36,
  padding: "0 8px",
  borderRadius: 8,
  border: "1px solid #e6e9f7",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  color: "#1d1e2c",
  cursor: "pointer",
  transition: "all 0.2s",
};

const paginationNumberButtonActiveStyle = {
  background: "linear-gradient(180deg, #6772ff 0%, #5468ff 100%)",
  color: "#fff",
  border: "none",
};

const paginationEllipsisStyle = {
  padding: "0 8px",
  fontSize: 13,
  color: "#6b7280",
};
