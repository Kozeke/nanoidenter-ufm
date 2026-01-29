import { create } from "zustand";

export const useAuthStore = create((set) => ({
  token: localStorage.getItem("token"),
  user: null,
  isAuthenticated: !!localStorage.getItem("token"),
  profileCompleted: false,
  isInitializing: !!localStorage.getItem("token"), // Track if we're still loading user data

  login: (token) => {
    localStorage.setItem("token", token);
    set({
      token,
      isAuthenticated: true,
      isInitializing: true, // Start initializing after login
    });
  },

  // 🔥 FIX IS HERE
  setUser: (user) => {
    console.log("userSet", user);
    set({
      isAuthenticated: true,
      user,
      profileCompleted: !!user.profile_completed,
      isInitializing: false, // Finished initializing
    })
  },
    
  logout: () => {
    localStorage.removeItem("token");
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      profileCompleted: false,
      isInitializing: false,
    });
  },
}));

