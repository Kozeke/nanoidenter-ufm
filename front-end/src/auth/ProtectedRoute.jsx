import { Navigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";
import { Box, CircularProgress } from "@mui/material";

export default function ProtectedRoute({ children }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
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

  return isAuth ? children : <Navigate to="/login" replace />;
}
