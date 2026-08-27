// Client-side API helpers for listing lightweight dataset summaries.
import { fetchWithAuth } from "./fetchWithAuth";

// Stores backend base URL for dataset endpoint calls.
const API = process.env.REACT_APP_BACKEND_URL;

// Fetches table-ready datasets for the authenticated user.
export async function listDatasets(token) {
  // Executes authorized request to the datasets listing endpoint.
  const response = await fetchWithAuth(`${API}/datasets`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Prevents rendering stale data when backend response fails.
  if (!response.ok) throw new Error("Failed to load datasets");
  return response.json();
}

// Fetches one dataset summary row for modal preview.
export async function getDataset(token, datasetId) {
  // Executes authorized request to fetch a single dataset record.
  const response = await fetchWithAuth(`${API}/datasets/${datasetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Prevents modal rendering with invalid or missing dataset data.
  if (!response.ok) throw new Error("Failed to load dataset");
  return response.json();
}

// Deletes one dataset owned by the authenticated user.
export async function deleteDataset(token, datasetId) {
  // Executes authorized request to remove the selected dataset row.
  const response = await fetchWithAuth(`${API}/datasets/${datasetId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    // Stores backend error payload with graceful fallback for UI messaging.
    const error = await response
      .json()
      .catch(() => ({ detail: "Failed to delete dataset" }));
    throw new Error(error.detail || "Failed to delete dataset");
  }
  return response.json();
}

// Updates editable metadata fields for one dataset.
export async function updateDatasetMetadata(token, datasetId, metadata) {
  // Executes authorized request to persist modal metadata edits.
  const response = await fetchWithAuth(`${API}/datasets/${datasetId}/metadata`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    // Stores backend error payload with graceful fallback for UI messaging.
    const error = await response
      .json()
      .catch(() => ({ detail: "Failed to update dataset metadata" }));
    throw new Error(error.detail || "Failed to update dataset metadata");
  }
  return response.json();
}
