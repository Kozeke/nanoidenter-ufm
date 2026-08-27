import { useEffect } from "react";
import { getMe, getLastAccessedDataset } from "../api/auth";
import { useAuthStore } from "../state/useAuthStore";
import { useDashboardStore } from "../state/useDashboardStore";

export function useAuthInit() {
  // Stores the JWT currently held in the auth store (also mirrored in localStorage).
  const token = useAuthStore((s) => s.token);
  // Writes the /auth/me payload into the auth store once identity is confirmed.
  const setUser = useAuthStore((s) => s.setUser);
  // Clears the session when the *current* token is proven invalid.
  const logout = useAuthStore((s) => s.logout);
  // Restores the last-opened dataset id into the dashboard store after login/refresh.
  const setDatasetId = useDashboardStore((s) => s.setDatasetId);
  // Restores the last-opened dataset filename alongside the dataset id.
  const setFilename = useDashboardStore((s) => s.setFilename);

  useEffect(() => {
    if (!token) {
      // If no token, make sure we're not initializing
      useAuthStore.setState({ isInitializing: false });
      return;
    }

    // Marks this effect instance so an in-flight getMe from a previous token
    // (e.g. stale localStorage JWT) cannot logout() the freshly logged-in session.
    let cancelled = false;
    // Captures the token this request was started with for stale-response checks.
    const tokenAtStart = token;

    getMe(token)
      .then(async (userData) => {
        if (cancelled) return;
        // Skip applying results if the user already logged in/out with a different token.
        if (useAuthStore.getState().token !== tokenAtStart) return;

        setUser(userData);
        // Fetch last accessed dataset after getting user data
        const datasetInfo = await getLastAccessedDataset(tokenAtStart);
        if (cancelled) return;
        if (useAuthStore.getState().token !== tokenAtStart) return;

        if (datasetInfo) {
          setDatasetId(datasetInfo.dataset_id);
          if (datasetInfo.filename) {
            setFilename(datasetInfo.filename);
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Only tear down the session if *this* token is still the active one.
        // Otherwise a 401 from a previous/stale getMe would wipe a successful login.
        if (useAuthStore.getState().token !== tokenAtStart) return;

        useAuthStore.setState({ isInitializing: false });
        logout();
      });

    return () => {
      cancelled = true;
    };
  }, [token, setUser, logout, setDatasetId, setFilename]);
}
