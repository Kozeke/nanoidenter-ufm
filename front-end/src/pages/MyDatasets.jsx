// Page component that displays user datasets in a lightweight summary table.
import { useEffect, useState } from "react";
import BackToDashboardButton from "../components/BackToDashboardButton";
import { deleteDataset, listDatasets } from "../api/datasets";
import DatasetPreviewModal from "../components/DatasetPreviewModal";
import { useAuthStore } from "../state/useAuthStore";
import { useDashboardStore } from "../state/useDashboardStore";
import { useNavigate } from "react-router-dom";

// Renders the "My Datasets" page with dataset metadata and lengths.
export default function MyDatasets() {
  // Stores router navigation helper used for opening dashboard route.
  const navigate = useNavigate();
  // Stores the fetched dataset rows returned from the backend.
  const [datasets, setDatasets] = useState([]);
  // Stores whether data is currently being loaded for the table.
  const [loading, setLoading] = useState(true);
  // Stores the dataset ID currently selected for preview modal display.
  const [previewId, setPreviewId] = useState(null);
  // Stores auth token used for authorized dataset API calls.
  const token = useAuthStore((state) => state.token);
  // Stores dashboard actions used when opening a dataset from this table.
  const dashboard = useDashboardStore.getState();

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    listDatasets(token)
      .then((data) => {
        setDatasets(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Failed to load datasets", error);
        setDatasets([]);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Opens the selected dataset in dashboard by updating shared store state first.
  const handleOpen = (dataset) => {
    // Resets filters and analysis parameters so the dataset opens with default controls.
    dashboard.resetFiltersAndParams();
    // Clears header model statistics so the E badge returns to default empty state.
    dashboard.setModelStats("force", []);
    dashboard.setModelStats("elasticity", []);
    dashboard.setModelStats("stiffness", []);
    dashboard.setModelStats("stiffnessByCurve", []);
    // Resets active tab to the default dashboard tab.
    dashboard.setActiveTab("forceDisplacement");
    // Opening a dataset starts a new analysis — do not update a prior experiment.
    dashboard.clearOpenedExperiment();
    dashboard.setDatasetId(dataset.id);
    dashboard.setFilename(dataset.name || dataset.filename || null);
    dashboard.setSelectedCurveId(null);
    dashboard.setSelectedCurveIds([]);
    // Clears export curve selection so it repopulates from the newly opened dataset.
    dashboard.setSelectedExportCurveIds([]);
    navigate("/dashboard");
  };

  // Deletes the selected dataset after explicit user confirmation.
  const handleDelete = async (datasetId) => {
    if (!window.confirm("Delete this dataset?")) return;

    try {
      await deleteDataset(token, datasetId);
      // Removes deleted dataset from local table state immediately.
      setDatasets((previousDatasets) =>
        previousDatasets.filter((dataset) => dataset.id !== datasetId)
      );
    } catch (error) {
      console.error("Failed to delete dataset:", error);
      alert(error.message || "Failed to delete dataset");
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 12 }}>
          <BackToDashboardButton />
        </div>
        <h2 style={titleStyle}>My Datasets</h2>
        <p style={subtitleStyle}>Uploaded datasets with file and metadata summary</p>

        {loading ? (
          <div>Loading datasets...</div>
        ) : datasets.length === 0 ? (
          <div style={emptyStyle}>No datasets found</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>File Name</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {datasets.map((dataset) => (
                <tr key={dataset.id} style={rowStyle}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{dataset.name || "Unnamed dataset"}</div>
                    <div style={idStyle}>ID: {dataset.id}</div>
                  </td>
                  <td style={tdStyle}>{dataset.filename || "—"}</td>
                  <td style={tdStyle}>{formatDate(dataset.created_at)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button
                      style={secondaryButtonStyle}
                      onClick={() => setPreviewId(dataset.id)}
                    >
                      👁 Preview
                    </button>
                    <button
                      style={actionButtonStyle}
                      onClick={() => handleOpen(dataset)}
                    >
                      ▶ Open
                    </button>
                    <button
                      style={dangerButtonStyle}
                      onClick={() => handleDelete(dataset.id)}
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
        <DatasetPreviewModal
          id={previewId}
          onClose={() => setPreviewId(null)}
          onOpen={handleOpen}
        />
      )}
    </div>
  );
}

// Converts backend timestamp values into a user-friendly date/time format.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

// Defines the overall page container style.
const pageStyle = {
  padding: 24,
  display: "flex",
  justifyContent: "center",
};

// Defines the card style wrapping the datasets table.
const cardStyle = {
  width: "100%",
  maxWidth: 1100,
  background: "linear-gradient(180deg, #ffffff 0%, #fafbff 100%)",
  borderRadius: 14,
  border: "1px solid #e9ecf5",
  boxShadow: "0 18px 40px rgba(20,20,43,0.12)",
  padding: 24,
};

// Defines the page title typography style.
const titleStyle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  color: "#1d1e2c",
};

// Defines the subtitle text style under the title.
const subtitleStyle = {
  marginTop: 6,
  marginBottom: 16,
  fontSize: 14,
  color: "#6b7280",
};

// Defines the base style for the datasets HTML table.
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
};

// Defines table header cell style.
const thStyle = {
  textAlign: "left",
  fontSize: 13,
  color: "#6b7280",
  paddingBottom: 8,
  borderBottom: "1px solid #eef1ff",
};

// Defines row border style for each table entry.
const rowStyle = {
  borderBottom: "1px solid #eef1ff",
};

// Defines table body cell style.
const tdStyle = {
  padding: "12px 0",
  fontSize: 14,
  color: "#1d1e2c",
  verticalAlign: "top",
};

// Defines style for dataset ID label text.
const idStyle = {
  fontSize: 11,
  color: "#9ca3af",
  marginTop: 2,
};

// Defines style for primary "Open" action button.
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

// Defines style for secondary "Preview" action button.
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

// Defines style for destructive "Delete" action button.
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

// Defines style for empty state text when there are no datasets.
const emptyStyle = {
  padding: 24,
  textAlign: "center",
  fontSize: 14,
  color: "#6b7280",
};
