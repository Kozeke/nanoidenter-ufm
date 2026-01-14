import { useEffect } from "react";
import { getMe } from "../api/auth";
import { useAuthStore } from "../state/useAuthStore";

export function useAuthInit() {
  const token = useAuthStore((s) => s.token);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!token) return;

    getMe(token)
      .then(setUser)
      .catch(logout);
  }, [token]);
}
