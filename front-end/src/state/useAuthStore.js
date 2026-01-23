import { create } from "zustand";

export const useAuthStore = create((set) => ({
  token: localStorage.getItem("token"),
  user: null,
  isAuthenticated: !!localStorage.getItem("token"),
  profileCompleted: false,

  login: (token) => {
    localStorage.setItem("token", token);
    set({
      token,
      isAuthenticated: true,
    });
  },

  // 🔥 FIX IS HERE
  setUser: (user) => {
    console.log("userSet", user);
    set({
      isAuthenticated: true,
      user,
      profileCompleted: !!user.profile_completed,
    })
  },
    
  logout: () => {
    localStorage.removeItem("token");
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      profileCompleted: false,
    });
  },
}));

