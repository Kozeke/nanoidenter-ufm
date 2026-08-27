import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ProtectedRoute from "./auth/ProtectedRoute";
import { useAuthInit } from "./hooks/useAuthInit";
import { useAuthStore } from "./state/useAuthStore";
import Profile from "./pages/Profile";
import MyExperiments from "./pages/MyExperiments";
import MyDatasets from "./pages/MyDatasets";
import ProfileCompletedRoute from "./auth/ProfileCompletedRoute";

function App() {
  useAuthInit();
  const profileCompleted = useAuthStore((s) => s.profileCompleted);

  const isAuth = useAuthStore((s) => s.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        {/* Default entry */}
        <Route
          path="/"
          element={<Navigate
            to={
              !isAuth
                ? "/login"
                : profileCompleted
                ? "/dashboard"
                : "/profile"
            }
          />}
        />

        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected */}
        <Route
          path="/dashboard"
          element={
            <ProfileCompletedRoute>
              <Dashboard />
            </ProfileCompletedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/experiments"
          element={
            <ProfileCompletedRoute>
              <MyExperiments />
            </ProfileCompletedRoute>
          }
        />
        <Route
          path="/datasets"
          element={
            <ProfileCompletedRoute>
              <MyDatasets />
            </ProfileCompletedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
