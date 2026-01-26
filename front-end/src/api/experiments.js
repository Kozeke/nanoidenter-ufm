import { fetchWithAuth } from "./fetchWithAuth";

const API = process.env.REACT_APP_BACKEND_URL;

export async function listExperiments(token) {
  const res = await fetchWithAuth(`${API}/experiments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load experiments");
  return res.json();
}

export async function getExperiment(token, id) {
  const res = await fetchWithAuth(`${API}/experiments/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to load experiment");
  return res.json();
}

export async function saveExperiment(token, payload) {
  const res = await fetchWithAuth(`${API}/experiments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Failed to save experiment");
  return res.json();
}

export async function deleteExperiment(token, id) {
  const res = await fetchWithAuth(`${API}/experiments/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: "Failed to delete experiment" }));
    throw new Error(error.detail || "Failed to delete experiment");
  }
  return res.json();
}