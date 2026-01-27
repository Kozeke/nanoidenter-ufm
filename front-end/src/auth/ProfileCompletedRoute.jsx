import { Navigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";
import { Box, CircularProgress } from "@mui/material";

export default function ProfileCompletedRoute({ children }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const profileCompleted = useAuthStore((s) => s.profileCompleted);
  const isInitializing = useAuthStore((s) => s.isInitializing);

  // Wait for auth initialization to complete before making redirect decisions
  if (isInitializing) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuth) return <Navigate to="/login" replace />;
  if (!profileCompleted) return <Navigate to="/profile" replace />;

  return children;
}
