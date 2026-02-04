import { useEffect } from "react";
import { getMe, getLastAccessedDataset } from "../api/auth";
import { useAuthStore } from "../state/useAuthStore";
import { useDashboardStore } from "../state/useDashboardStore";

export function useAuthInit() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const setDatasetId = useDashboardStore((s) => s.setDatasetId);
  const setFilename = useDashboardStore((s) => s.setFilename);

  useEffect(() => {
    if (!token) {
      // If no token, make sure we're not initializing
      useAuthStore.setState({ isInitializing: false });
      return;
    }

    getMe(token)
      .then(async (userData) => {
        setUser(userData);
        // Fetch last accessed dataset after getting user data
        const datasetInfo = await getLastAccessedDataset(token);
        if (datasetInfo) {
          setDatasetId(datasetInfo.dataset_id);
          if (datasetInfo.filename) {
            setFilename(datasetInfo.filename);
          }
        }
      })
      .catch((err) => {
        // On error, stop initializing and logout
        useAuthStore.setState({ isInitializing: false });
        logout();
      });
  }, [token, setUser, logout, setDatasetId, setFilename]);
}
