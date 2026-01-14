import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";

export default function LogoutButton() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <button onClick={handleLogout} style={logoutButtonStyle}>
      Logout
    </button>
  );
}

const logoutButtonStyle = {
  height: 34,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid #e6e9f7",
  background: "linear-gradient(180deg, #ffffff 0%, #f6f7ff 100%)",
  color: "#1d1e2c",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(20,20,43,0.12)",
};
