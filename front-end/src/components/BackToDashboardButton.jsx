import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/useAuthStore";

export default function BackToDashboardButton() {
  const navigate = useNavigate();
  const profileCompleted = useAuthStore((s) => s.profileCompleted);

  const handleClick = () => {
    if (!profileCompleted) {
      alert("Profile required fields are required. Please complete your profile to access the dashboard.");
      navigate("/profile");
      return;
    }
    navigate("/dashboard");
  };

  return (
    <button onClick={handleClick} style={buttonStyle}>
      ← Back to Analysis
    </button>
  );
}

const buttonStyle = {
  height: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #e6e9f7",
  background: "linear-gradient(180deg, #ffffff 0%, #f6f7ff 100%)",
  fontSize: 13,
  fontWeight: 600,
  color: "#1d1e2c",
  cursor: "pointer",
  boxShadow: "0 6px 14px rgba(20,20,43,0.12)",
};
