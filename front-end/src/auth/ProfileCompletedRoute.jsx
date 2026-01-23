import { Navigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";

export default function ProfileCompletedRoute({ children }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const profileCompleted = useAuthStore((s) => s.profileCompleted);

  if (!isAuth) return <Navigate to="/login" replace />;
  if (!profileCompleted) return <Navigate to="/profile" replace />;

  return children;
}
