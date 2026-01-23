import { useNavigate } from "react-router-dom";

export default function BackToDashboardButton() {
  const navigate = useNavigate();

  return (
    <button onClick={() => navigate("/dashboard")} style={buttonStyle}>
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
