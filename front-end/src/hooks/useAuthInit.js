import { useEffect } from "react";
import { getMe } from "../api/auth";
import { useAuthStore } from "../state/useAuthStore";

export function useAuthInit() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) {
      // If no token, make sure we're not initializing
      useAuthStore.setState({ isInitializing: false });
      return;
    }

    getMe(token)
      .then(setUser)
      .catch((err) => {
        // On error, stop initializing and logout
        useAuthStore.setState({ isInitializing: false });
        logout();
      });
  }, [token, setUser, logout]);
}
