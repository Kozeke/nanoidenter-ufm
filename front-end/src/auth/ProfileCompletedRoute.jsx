import { Navigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";
import { Box, CircularProgress } from "@mui/material";
import { useEffect, useRef } from "react";

export default function ProfileCompletedRoute({ children }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const profileCompleted = useAuthStore((s) => s.profileCompleted);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const alertShownRef = useRef(false);

  // Show alert when profile is not completed (only once per mount)
  // This must be called before any early returns to follow React Hooks rules
  useEffect(() => {
    if (!isInitializing && !isAuth) return;
    if (!isInitializing && isAuth && !profileCompleted && !alertShownRef.current) {
      alert("Profile required fields are required. Please complete your profile to access this page.");
      alertShownRef.current = true;
    }
  }, [isInitializing, isAuth, profileCompleted]);

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
  
  if (!profileCompleted) {
    return <Navigate to="/profile" replace />;
  }

  return children;
}
