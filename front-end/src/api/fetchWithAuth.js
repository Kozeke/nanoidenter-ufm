import { useAuthStore } from "../state/useAuthStore";

export async function fetchWithAuth(url, options = {}) {
  const res = await fetch(url, options);

  if (res.status === 401) {
    // 🔐 logout globally
    const logout = useAuthStore.getState().logout();
    
    // 🚫 hard redirect (blocks page instantly)
    window.location.href = "/login";

    // Stop execution
    throw new Error("Unauthorized");
  }

  return res;
}
